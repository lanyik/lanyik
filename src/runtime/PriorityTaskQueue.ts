export type WorkLane = "critical" | "interactive" | "visible" | "prefetch" | "background";

export interface PriorityTaskQueueOptions {
    maxPendingTasks?: number;
    maxPendingWeight?: number;
    starvationMs?: number;
    now?: () => number;
}

export interface PriorityTaskOptions {
    key?: string;
    lane?: WorkLane;
    priority?: number;
    weight?: number;
    signal?: AbortSignal;
    cancelled?: (reason: Error) => void;
}

export interface PriorityTaskQueueStats {
    readonly pendingTasks: number;
    readonly pendingWeight: number;
    readonly oldestTaskAgeMs: number;
    readonly cancelledTasks: number;
    readonly shedTasks: number;
    readonly starvationPromotions: number;
}

export class WorkQueueBackpressureError extends Error {
    public readonly name = "WorkQueueBackpressureError";
}

interface QueueEntry<T> {
    id: number;
    key?: string;
    lane: WorkLane;
    priority: number;
    weight: number;
    sequence: number;
    enqueuedAt: number;
    value: T;
    signal?: AbortSignal;
    cancelled?: (reason: Error) => void;
    abort?: () => void;
}

const LANE_RANK: Readonly<Record<WorkLane, number>> = {
    critical: 0,
    interactive: 1,
    visible: 2,
    prefetch: 3,
    background: 4
};

function cancellationError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

// One priority/cancellation/backpressure vocabulary shared by main-thread and
// worker queues. Aging promotes a task by one lane at each starvation window,
// while FIFO sequence remains the deterministic final tie-breaker.
export class PriorityTaskQueue<T> {
    private readonly entries = new Map<number, QueueEntry<T>>();
    private readonly keyed = new Map<string, number>();
    private readonly now: () => number;
    private readonly maxPendingTasks: number;
    private readonly maxPendingWeight: number;
    private readonly starvationMs: number;
    private nextId = 1;
    private sequence = 0;
    private pendingWeight = 0;
    private cancelledTasks = 0;
    private shedTasks = 0;

    constructor(options: PriorityTaskQueueOptions = {}) {
        this.maxPendingTasks = options.maxPendingTasks ?? Number.MAX_SAFE_INTEGER;
        this.maxPendingWeight = options.maxPendingWeight ?? Number.MAX_SAFE_INTEGER;
        this.starvationMs = options.starvationMs ?? 2_000;
        this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
        if (!Number.isSafeInteger(this.maxPendingTasks) || this.maxPendingTasks <= 0) {
            throw new RangeError("maxPendingTasks must be a positive safe integer");
        }
        if (!Number.isSafeInteger(this.maxPendingWeight) || this.maxPendingWeight <= 0) {
            throw new RangeError("maxPendingWeight must be a positive safe integer");
        }
        if (!Number.isFinite(this.starvationMs) || this.starvationMs <= 0) {
            throw new RangeError("starvationMs must be positive and finite");
        }
    }

    public enqueue(value: T, options: PriorityTaskOptions = {}): number | undefined {
        const lane = options.lane ?? "visible";
        const priority = options.priority ?? 0;
        const weight = options.weight ?? 1;
        if (!(lane in LANE_RANK)) throw new TypeError(`unknown work lane "${String(lane)}"`);
        if (!Number.isFinite(priority)) throw new RangeError("task priority must be finite");
        if (!Number.isSafeInteger(weight) || weight <= 0) throw new RangeError("task weight must be a positive safe integer");
        if (options.key !== undefined && options.key.length === 0) throw new TypeError("task key cannot be empty");
        if (options.signal?.aborted) {
            this.notifyCancellation(options.cancelled, cancellationError("Task was aborted before it was queued"));
            return undefined;
        }
        // An individually impossible task must not enter the queue. If it did,
        // shedOverflow() could evict every lower lane first and then still have
        // to discard the oversized task, destroying useful work for no gain.
        if (weight > this.maxPendingWeight) {
            this.shedTasks += 1;
            this.notifyCancellation(
                options.cancelled,
                new WorkQueueBackpressureError(
                    `Task weight ${weight} exceeds the queue limit ${this.maxPendingWeight}`
                )
            );
            return undefined;
        }
        if (options.key !== undefined) {
            const previous = this.keyed.get(options.key);
            if (previous !== undefined) this.remove(previous, cancellationError("Task was replaced"), true);
        }
        const entry: QueueEntry<T> = {
            id: this.nextId++,
            key: options.key,
            lane,
            priority,
            weight,
            sequence: this.sequence++,
            enqueuedAt: this.now(),
            value,
            signal: options.signal,
            cancelled: options.cancelled
        };
        if (options.signal) {
            entry.abort = () => this.remove(entry.id, cancellationError("Queued task was aborted"), true);
            options.signal.addEventListener("abort", entry.abort, { once: true });
        }
        this.entries.set(entry.id, entry);
        if (entry.key !== undefined) this.keyed.set(entry.key, entry.id);
        this.pendingWeight += weight;
        this.shedOverflow();
        return this.entries.has(entry.id) ? entry.id : undefined;
    }

    public take(predicate?: (value: T) => boolean): T | undefined {
        const now = this.now();
        let selected: QueueEntry<T> | undefined;
        for (const entry of this.entries.values()) {
            if (entry.signal?.aborted) {
                this.remove(entry.id, cancellationError("Queued task was aborted"), true);
                continue;
            }
            if (predicate && !predicate(entry.value)) continue;
            if (!selected || this.compare(entry, selected, now) < 0) selected = entry;
        }
        if (!selected) return undefined;
        this.detach(selected);
        return selected.value;
    }

    public cancelKey(key: string, reason = cancellationError("Queued task was cancelled")): boolean {
        const id = this.keyed.get(key);
        return id === undefined ? false : this.remove(id, reason, true);
    }

    public cancel(id: number, reason = cancellationError("Queued task was cancelled")): boolean {
        return this.remove(id, reason, true);
    }

    public clear(reason = cancellationError("Work queue was cleared")): void {
        for (const id of [...this.entries.keys()]) this.remove(id, reason, true);
    }

    public get values(): readonly T[] { return [...this.entries.values()].map(entry => entry.value); }

    public get stats(): Readonly<PriorityTaskQueueStats> {
        const now = this.now();
        let oldestTaskAgeMs = 0;
        let starvationPromotions = 0;
        for (const entry of this.entries.values()) {
            const age = Math.max(0, now - entry.enqueuedAt);
            oldestTaskAgeMs = Math.max(oldestTaskAgeMs, age);
            starvationPromotions += Math.min(LANE_RANK[entry.lane], Math.floor(age / this.starvationMs));
        }
        return {
            pendingTasks: this.entries.size,
            pendingWeight: this.pendingWeight,
            oldestTaskAgeMs,
            cancelledTasks: this.cancelledTasks,
            shedTasks: this.shedTasks,
            starvationPromotions
        };
    }

    private shedOverflow(): void {
        while (this.entries.size > this.maxPendingTasks || this.pendingWeight > this.maxPendingWeight) {
            let worst: QueueEntry<T> | undefined;
            for (const entry of this.entries.values()) {
                if (!worst || this.compareForEviction(entry, worst) > 0) worst = entry;
            }
            if (!worst) return;
            this.shedTasks += 1;
            this.remove(
                worst.id,
                new WorkQueueBackpressureError("Queued task was shed by the configured backpressure limit"),
                false
            );
        }
    }

    private compare(first: QueueEntry<T>, second: QueueEntry<T>, now: number): number {
        const firstStarved = this.isStarved(first, now);
        const secondStarved = this.isStarved(second, now);
        if (firstStarved !== secondStarved) return firstStarved ? -1 : 1;
        // Once work crosses its bounded starvation deadline, FIFO outranks
        // both lane and caller priority so an endless stream of urgent work
        // cannot postpone it forever.
        if (firstStarved) return first.sequence - second.sequence;
        return this.effectiveLane(first, now) - this.effectiveLane(second, now)
            || first.priority - second.priority
            || first.sequence - second.sequence;
    }

    // Dispatch aging prevents starvation among admitted work. Admission is a
    // different policy boundary: an old background task must not evict a fresh
    // critical task merely because the tab was suspended long enough for its
    // wall-clock starvation deadline to elapse.
    private compareForEviction(first: QueueEntry<T>, second: QueueEntry<T>): number {
        return LANE_RANK[first.lane] - LANE_RANK[second.lane]
            || first.priority - second.priority
            || first.sequence - second.sequence;
    }

    private isStarved(entry: QueueEntry<T>, now: number): boolean {
        const deadlineWindows = LANE_RANK[entry.lane] + 1;
        return Math.max(0, now - entry.enqueuedAt) >= this.starvationMs * deadlineWindows;
    }

    private effectiveLane(entry: QueueEntry<T>, now: number): number {
        const promotions = Math.min(LANE_RANK[entry.lane], Math.floor(Math.max(0, now - entry.enqueuedAt) / this.starvationMs));
        return LANE_RANK[entry.lane] - promotions;
    }

    private remove(id: number, reason: Error, countCancellation: boolean): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;
        this.detach(entry);
        if (countCancellation) this.cancelledTasks += 1;
        this.notifyCancellation(entry.cancelled, reason);
        return true;
    }

    private notifyCancellation(observer: ((reason: Error) => void) | undefined, reason: Error): void {
        try { observer?.(reason); } catch { /* cancellation observers cannot corrupt the queue */ }
    }

    private detach(entry: QueueEntry<T>): void {
        this.entries.delete(entry.id);
        if (entry.key !== undefined && this.keyed.get(entry.key) === entry.id) this.keyed.delete(entry.key);
        if (entry.signal && entry.abort) entry.signal.removeEventListener("abort", entry.abort);
        this.pendingWeight = Math.max(0, this.pendingWeight - entry.weight);
    }
}

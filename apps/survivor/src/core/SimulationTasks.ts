import { GAME_CONFIG } from "./GameConfig";
export interface DeferredTaskStamp {
    readonly requestId: number;
    readonly key: string;
    readonly entity: number;
    readonly issuedTick: number;
    readonly worldRevision: number;
}
export interface DeferredTask<T> {
    readonly key: string;
    readonly entity: number;
    readonly maxAgeTicks: number;
    /** Dispatch immutable input to an executor; completion must not mutate the simulation. */
    execute(signal: AbortSignal, stamp: DeferredTaskStamp): Promise<T>;
    /** Called only by the authority at a tick boundary after validity checks. */
    commit(result: T, stamp: DeferredTaskStamp, commitTick: number): undefined;
}
interface PendingTask {
    stamp: DeferredTaskStamp;
    deadline: number;
    controller: AbortController;
    settled: boolean;
    cancelled: boolean;
    apply?: (tick: number) => void;
    error?: Error;
}

/** Required work is a barrier. Deferred completions enter a bounded inbox, never an async world writer. */
export class SimulationTasks {
    private readonly pending = new Map<number, PendingTask>();
    private readonly latest = new Map<string, PendingTask>();
    private sequence = 0;
    private tick = 0;
    private worldRevision = 0;
    private required = false;
    private committing = false;
    private closed = false;
    private committed = 0;
    private discarded = 0;
    private rejected = 0;

    constructor(private readonly isAlive: (entity: number) => boolean, private readonly capacity: number = GAME_CONFIG.workers.deferredCapacity) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("Invalid deferred task capacity");
    }
    public get stats() {
        let ready = 0;
        for (const task of this.pending.values()) if (task.settled && !task.cancelled) ready++;
        return { pending: this.pending.size, ready, committed: this.committed, discarded: this.discarded, rejected: this.rejected };
    }
    public assertCanStep(): void {
        if (this.closed || this.required || this.committing) throw new Error("Simulation task boundary is closed or awaiting required work or committing results");
    }
    public async require(work: () => Promise<void>): Promise<void> {
        this.assertCanStep(); this.required = true;
        try {
            await work();
            if (this.closed) throw new Error("Simulation tasks closed during required work");
        } finally { this.required = false; }
    }
    public submit<T>(task: DeferredTask<T>): DeferredTaskStamp | undefined {
        if (this.closed) throw new Error("Simulation tasks are closed");
        if (!task.key || !Number.isSafeInteger(task.entity) || task.entity <= 0 || !Number.isSafeInteger(this.sequence + 1)
            || !Number.isSafeInteger(task.maxAgeTicks) || task.maxAgeTicks < 1
            || !Number.isSafeInteger(this.tick + task.maxAgeTicks) || !this.isAlive(task.entity)) throw new Error("Invalid deferred task scope");
        // Cancelled but unsettled work still owns capacity, so ignoring abort cannot create an unbounded executor queue.
        if (this.pending.size === this.capacity) { this.rejected++; return undefined; }
        const key = this.key(task.key, task.entity), previous = this.latest.get(key);
        if (previous) this.invalidate(previous);
        const stamp = Object.freeze({ requestId: ++this.sequence, key: task.key, entity: task.entity,
            issuedTick: this.tick, worldRevision: this.worldRevision });
        const entry: PendingTask = { stamp, deadline: this.tick + task.maxAgeTicks,
            controller: new AbortController(), settled: false, cancelled: false };
        this.pending.set(stamp.requestId, entry); this.latest.set(key, entry);
        const settle = (apply?: (tick: number) => void, error?: Error) => {
            if (this.closed) return;
            entry.settled = true;
            if (entry.cancelled) this.forget(entry);
            else { entry.apply = apply; entry.error = error; }
        };
        try {
            void task.execute(entry.controller.signal, stamp).then(
                result => settle(tick => task.commit(result, stamp, tick)),
                reason => settle(undefined, reason instanceof Error ? reason : new Error(String(reason))));
        } catch (reason) { settle(undefined, reason instanceof Error ? reason : new Error(String(reason))); }
        return stamp;
    }
    public cancel(key: string, entity: number): void {
        const task = this.latest.get(this.key(key, entity));
        if (task) this.invalidate(task);
    }
    /** Residency has been synchronized; required collision/attack work has not started. */
    public commitReady(tick: number, worldRevision: number): void {
        this.assertCanStep();
        if (!Number.isSafeInteger(tick) || tick < this.tick || !Number.isSafeInteger(worldRevision) || worldRevision < this.worldRevision) throw new Error("Invalid task boundary");
        this.tick = tick; this.worldRevision = worldRevision;
        this.committing = true;
        try {
            for (const entry of this.pending.values()) {
                if (entry.cancelled) continue;
                if (entry.stamp.worldRevision !== worldRevision || tick > entry.deadline || !this.isAlive(entry.stamp.entity)) {
                    this.invalidate(entry); continue;
                }
                if (!entry.settled || tick <= entry.stamp.issuedTick) continue;
                this.forget(entry);
                if (entry.error) throw entry.error;
                entry.apply!(tick); this.committed++;
            }
        } finally { this.committing = false; }
    }
    public dispose(): void {
        this.closed = true;
        for (const entry of this.pending.values()) entry.controller.abort();
        this.pending.clear(); this.latest.clear();
    }
    private key(key: string, entity: number): string { return `${entity}:${key}`; }
    private forget(entry: PendingTask): void {
        this.pending.delete(entry.stamp.requestId);
        const key = this.key(entry.stamp.key, entry.stamp.entity);
        if (this.latest.get(key) === entry) this.latest.delete(key);
    }
    private invalidate(entry: PendingTask): void {
        if (entry.cancelled) return;
        entry.cancelled = true; this.discarded++; entry.controller.abort();
        if (entry.settled) this.forget(entry);
    }
}

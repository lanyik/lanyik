import {
    PriorityTaskQueue,
    PriorityTaskQueueOptions,
    PriorityTaskQueueStats
} from "./PriorityTaskQueue";

export interface WorkDomainTelemetry extends Partial<PriorityTaskQueueStats> {
    busyTasks?: number;
}

export interface RuntimeWorkDomainStats {
    readonly id: string;
    readonly pendingTasks: number;
    readonly pendingWeight: number;
    readonly busyTasks: number;
    readonly oldestTaskAgeMs: number;
    readonly cancelledTasks: number;
    readonly shedTasks: number;
    readonly starvationPromotions: number;
}

export interface RuntimeWorkCoordinatorStats {
    readonly disposed: boolean;
    readonly domains: Readonly<Record<string, RuntimeWorkDomainStats>>;
    readonly pendingTasks: number;
    readonly pendingWeight: number;
    readonly busyTasks: number;
    readonly oldestTaskAgeMs: number;
    readonly cancelledTasks: number;
    readonly shedTasks: number;
    readonly starvationPromotions: number;
}

export interface RuntimeWorkCoordinatorOptions {
    defaultMaxPendingTasks?: number;
    defaultMaxPendingWeight?: number;
    starvationMs?: number;
    now?: () => number;
}

interface DomainRegistration {
    telemetry(): WorkDomainTelemetry;
    clear?: (reason: Error) => void;
}

function nonNegativeTelemetry(value: number | undefined, fallback = 0): number {
    return Number.isFinite(value) && (value as number) >= 0 ? value as number : fallback;
}

// Federates domain-specific executors without pretending a frame callback and
// a Worker slot are interchangeable. Every domain shares lane/aging semantics,
// cancellation ownership, bounded queues and one aggregate pressure surface.
export class RuntimeWorkCoordinator {
    private readonly domains = new Map<string, DomainRegistration>();
    private readonly queueDomains = new WeakMap<object, string>();
    private readonly controller = new AbortController();
    private readonly defaults: PriorityTaskQueueOptions;
    private disposed = false;

    constructor(options: RuntimeWorkCoordinatorOptions = {}) {
        this.defaults = {
            maxPendingTasks: options.defaultMaxPendingTasks ?? 512,
            maxPendingWeight: options.defaultMaxPendingWeight ?? 2048,
            starvationMs: options.starvationMs ?? 2_000,
            now: options.now
        };
    }

    public get signal(): AbortSignal { return this.controller.signal; }

    public createQueue<T>(domain: string, options: PriorityTaskQueueOptions = {}): PriorityTaskQueue<T> {
        this.assertActive();
        const id = this.uniqueDomainId(domain);
        const queue = new PriorityTaskQueue<T>({
            maxPendingTasks: options.maxPendingTasks ?? this.defaults.maxPendingTasks,
            maxPendingWeight: options.maxPendingWeight ?? this.defaults.maxPendingWeight,
            starvationMs: options.starvationMs ?? this.defaults.starvationMs,
            now: options.now ?? this.defaults.now
        });
        this.domains.set(id, {
            telemetry: () => queue.stats,
            clear: reason => queue.clear(reason)
        });
        this.queueDomains.set(queue, id);
        return queue;
    }

    public releaseQueue<T>(queue: PriorityTaskQueue<T>, clear = true): boolean {
        const id = this.queueDomains.get(queue);
        if (!id) return false;
        const registration = this.domains.get(id);
        if (clear) registration?.clear?.(new Error(`work domain "${id}" was released`));
        this.domains.delete(id);
        this.queueDomains.delete(queue);
        return true;
    }

    public registerTelemetry(domain: string, telemetry: () => WorkDomainTelemetry): () => void {
        this.assertActive();
        if (typeof telemetry !== "function") throw new TypeError("work-domain telemetry provider is required");
        const id = this.uniqueDomainId(domain);
        const registration: DomainRegistration = { telemetry };
        this.domains.set(id, registration);
        let attached = true;
        return () => {
            if (!attached) return;
            attached = false;
            // A stale disposer must never remove a later domain that reused
            // the same human-readable id.
            if (this.domains.get(id) === registration) this.domains.delete(id);
        };
    }

    public get stats(): Readonly<RuntimeWorkCoordinatorStats> {
        const domains: Record<string, RuntimeWorkDomainStats> = {};
        const totals = {
            pendingTasks: 0,
            pendingWeight: 0,
            busyTasks: 0,
            oldestTaskAgeMs: 0,
            cancelledTasks: 0,
            shedTasks: 0,
            starvationPromotions: 0
        };
        for (const [id, registration] of this.domains) {
            let sample: WorkDomainTelemetry;
            try { sample = registration.telemetry() ?? {}; } catch { sample = {}; }
            const pendingTasks = nonNegativeTelemetry(sample.pendingTasks);
            const domain: RuntimeWorkDomainStats = {
                id,
                pendingTasks,
                pendingWeight: nonNegativeTelemetry(sample.pendingWeight, pendingTasks),
                busyTasks: nonNegativeTelemetry(sample.busyTasks),
                oldestTaskAgeMs: nonNegativeTelemetry(sample.oldestTaskAgeMs),
                cancelledTasks: nonNegativeTelemetry(sample.cancelledTasks),
                shedTasks: nonNegativeTelemetry(sample.shedTasks),
                starvationPromotions: nonNegativeTelemetry(sample.starvationPromotions)
            };
            domains[id] = domain;
            totals.pendingTasks += domain.pendingTasks;
            totals.pendingWeight += domain.pendingWeight;
            totals.busyTasks += domain.busyTasks;
            totals.oldestTaskAgeMs = Math.max(totals.oldestTaskAgeMs, domain.oldestTaskAgeMs);
            totals.cancelledTasks += domain.cancelledTasks;
            totals.shedTasks += domain.shedTasks;
            totals.starvationPromotions += domain.starvationPromotions;
        }
        return { disposed: this.disposed, domains, ...totals };
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new Error("RuntimeWorkCoordinator was disposed");
        error.name = "AbortError";
        this.controller.abort(error);
        for (const registration of this.domains.values()) registration.clear?.(error);
        this.domains.clear();
    }

    private uniqueDomainId(domain: string): string {
        if (typeof domain !== "string" || domain.trim().length === 0) {
            throw new TypeError("work domain must be a non-empty string");
        }
        if (!this.domains.has(domain)) return domain;
        let suffix = 2;
        while (this.domains.has(`${domain}#${suffix}`)) suffix += 1;
        return `${domain}#${suffix}`;
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("RuntimeWorkCoordinator has been disposed");
    }
}

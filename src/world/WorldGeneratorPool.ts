import { PackedWorldChunk, WorldChunkGenerationOptions } from "./generateWorldChunk";
import { WorldVegetationGenerationOptions, WorldVegetationLayout } from "./generateVegetation";
import { WorldOverviewGenerationOptions, WorldOverviewRaster } from "./generateWorldOverview";
import { WorldGeneratorClient } from "./WorldGeneratorClient";
import {
    PriorityTaskQueue,
    WorkLane,
    WorkQueueBackpressureError
} from "../runtime/PriorityTaskQueue";
import { RuntimeWorkCoordinator } from "../runtime/RuntimeWorkCoordinator";
import { lifecycleAbortError } from "../runtime/LifecycleScope";

export interface ChunkGeneratorClient {
    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk>;
    generateVegetation?(options: WorldVegetationGenerationOptions): Promise<WorldVegetationLayout>;
    generateOverview?(options: WorldOverviewGenerationOptions, signal?: AbortSignal): Promise<WorldOverviewRaster>;
    dispose(): void;
    readonly isDisposed?: boolean;
}

export interface WorldGeneratorPoolOptions {
    size?: number;
    maxWorkers?: number;
    workerOptions?: WorkerOptions;
    clientFactory?: () => ChunkGeneratorClient;
    reservedChunkWorkers?: number;
    maxQueuedTasks?: number;
    maxQueuedWeight?: number;
    starvationMs?: number;
    now?: () => number;
    coordinator?: RuntimeWorkCoordinator;
    domain?: string;
}

export interface ChunkRequestOptions {
    priority?: number;
    signal?: AbortSignal;
    lane?: WorkLane;
    weight?: number;
    onScheduled?: (task: WorldTaskControl) => void;
}

export interface WorldTaskControl {
    readonly started: boolean;
    reprioritize(lane: WorkLane, priority: number): boolean;
    cancelQueued(): boolean;
}

export interface WorldGeneratorPoolStats {
    workers: number;
    configuredWorkers: number;
    busyWorkers: number;
    queued: number;
    completed: number;
    queuedChunks: number;
    queuedVegetation: number;
    queuedOverviews: number;
    busyChunkWorkers: number;
    busyVegetationWorkers: number;
    busyOverviewWorkers: number;
    averageChunkMs: number;
    averageVegetationMs: number;
    averageOverviewMs: number;
    queuedWeight: number;
    oldestQueuedMs: number;
    shedTasks: number;
    starvationPromotions: number;
    workerFailures: number;
    clientFactoryFailures: number;
}

interface QueuedTask {
    kind: "chunk" | "vegetation" | "overview";
    queueId?: number;
    options: WorldChunkGenerationOptions | WorldVegetationGenerationOptions | WorldOverviewGenerationOptions;
    signal?: AbortSignal;
    resolve(result: PackedWorldChunk | WorldVegetationLayout | WorldOverviewRaster): void;
    reject(error: Error): void;
    abort?: () => void;
    started: boolean;
    settled: boolean;
}

interface WorkerSlot {
    client: ChunkGeneratorClient;
    busy: boolean;
    taskKind?: QueuedTask["kind"];
    task?: QueuedTask;
}

function defaultPoolSize(maxWorkers: number): number {
    const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(maxWorkers, hardware - 1));
}

//A bounded priority scheduler over dedicated workers. Camera-near chunks use
//lower priorities and jump ahead of prefetch work; one task per worker avoids
//unbounded message queues hidden inside the browser's Worker implementation.
export class WorldGeneratorPool {
    private readonly slots: WorkerSlot[];
    private readonly clientFactory: () => ChunkGeneratorClient;
    private readonly queue: PriorityTaskQueue<QueuedTask>;
    private completed = 0;
    private disposed = false;
    private readonly maxWorkers: number;
    private readonly reservedChunkWorkers: number;
    private desiredSize: number;
    private averageChunkMs = 0;
    private averageVegetationMs = 0;
    private averageOverviewMs = 0;
    private workerFailures = 0;
    private clientFactoryFailures = 0;
    private readonly coordinatorSignal: AbortSignal | undefined;
    private readonly coordinatorAbort: (() => void) | undefined;
    private readonly workCoordinator: RuntimeWorkCoordinator | undefined;

    constructor(workerUrl: string | URL, options: WorldGeneratorPoolOptions = {}) {
        this.maxWorkers = options.maxWorkers ?? 8;
        const size = options.size ?? defaultPoolSize(this.maxWorkers);
        if (!Number.isInteger(size) || size <= 0 || size > this.maxWorkers) {
            throw new RangeError(`worker pool size must be an integer between 1 and ${this.maxWorkers}`);
        }
        this.desiredSize = size;
        this.reservedChunkWorkers = options.reservedChunkWorkers ?? 1;
        if (!Number.isInteger(this.reservedChunkWorkers) || this.reservedChunkWorkers < 0
            || this.reservedChunkWorkers > this.maxWorkers) {
            throw new RangeError(`reservedChunkWorkers must be an integer between 0 and ${this.maxWorkers}`);
        }
        this.clientFactory = options.clientFactory
            ?? (() => new WorldGeneratorClient(workerUrl, options.workerOptions ?? { type: "module" }));
        const queueOptions = {
            maxPendingTasks: options.maxQueuedTasks ?? 512,
            maxPendingWeight: options.maxQueuedWeight ?? 1024,
            starvationMs: options.starvationMs,
            now: options.now
        };
        this.workCoordinator = options.coordinator;
        this.queue = options.coordinator
            ? options.coordinator.createQueue<QueuedTask>(options.domain ?? "worker", queueOptions)
            : new PriorityTaskQueue<QueuedTask>(queueOptions);
        this.coordinatorSignal = options.coordinator?.signal;
        this.coordinatorAbort = this.coordinatorSignal ? () => this.dispose() : undefined;
        this.coordinatorSignal?.addEventListener("abort", this.coordinatorAbort!, { once: true });
        const initialSlots: WorkerSlot[] = [];
        try {
            for (let index = 0; index < size; index += 1) {
                initialSlots.push({ client: this.createClient(), busy: false });
            }
        } catch (reason) {
            for (const slot of initialSlots) {
                try { slot.client.dispose(); } catch { /* constructor cleanup is best effort */ }
            }
            if (this.coordinatorAbort) this.coordinatorSignal?.removeEventListener("abort", this.coordinatorAbort);
            this.workCoordinator?.releaseQueue(this.queue);
            throw reason;
        }
        this.slots = initialSlots;
    }

    public generateChunk(
        options: WorldChunkGenerationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<PackedWorldChunk> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(lifecycleAbortError("World chunk request was aborted"));
        return new Promise<PackedWorldChunk>((resolve, reject) => {
            const task: QueuedTask = {
                kind: "chunk",
                options,
                signal: request.signal,
                resolve: result => resolve(result as PackedWorldChunk),
                reject,
                started: false,
                settled: false
            };
            if (request.signal) {
                task.abort = () => {
                    if (task.settled) return;
                    if (task.queueId !== undefined
                        && this.queue.cancel(task.queueId, lifecycleAbortError("World chunk request was aborted"))) return;
                    this.finishTask(task, () => reject(lifecycleAbortError("World chunk request was aborted")));
                };
                request.signal.addEventListener("abort", task.abort, { once: true });
            }
            task.queueId = this.queue.enqueue(task, {
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                lane: request.lane ?? "visible",
                weight: request.weight ?? 1,
                cancelled: reason => this.finishTask(task, () => task.reject(reason))
            });
            if (task.queueId === undefined && !task.settled) {
                this.finishTask(task, () => reject(new WorkQueueBackpressureError("World chunk request was shed")));
            }
            if (task.queueId !== undefined) this.notifyScheduled(task, request.onScheduled);
            this.dispatch();
        });
    }

    public generateVegetation(
        options: WorldVegetationGenerationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldVegetationLayout> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(lifecycleAbortError("World vegetation request was aborted"));
        return new Promise<WorldVegetationLayout>((resolve, reject) => {
            const task: QueuedTask = {
                kind: "vegetation",
                options,
                signal: request.signal,
                resolve: result => resolve(result as WorldVegetationLayout),
                reject,
                started: false,
                settled: false
            };
            if (request.signal) {
                task.abort = () => {
                    if (task.settled) return;
                    if (task.queueId !== undefined
                        && this.queue.cancel(task.queueId, lifecycleAbortError("World vegetation request was aborted"))) return;
                    this.finishTask(task, () => reject(lifecycleAbortError("World vegetation request was aborted")));
                };
                request.signal.addEventListener("abort", task.abort, { once: true });
            }
            task.queueId = this.queue.enqueue(task, {
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                lane: request.lane ?? "prefetch",
                weight: request.weight ?? Math.max(1, Math.ceil((options.points?.length ?? 0) / 256)),
                cancelled: reason => this.finishTask(task, () => task.reject(reason))
            });
            if (task.queueId === undefined && !task.settled) {
                this.finishTask(task, () => reject(new WorkQueueBackpressureError("Vegetation request was shed")));
            }
            if (task.queueId !== undefined) this.notifyScheduled(task, request.onScheduled);
            this.dispatch();
        });
    }

    public generateOverview(
        options: WorldOverviewGenerationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldOverviewRaster> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(lifecycleAbortError("World overview request was aborted"));
        return new Promise<WorldOverviewRaster>((resolve, reject) => {
            const task: QueuedTask = {
                kind: "overview",
                options,
                signal: request.signal,
                resolve: result => resolve(result as WorldOverviewRaster),
                reject,
                started: false,
                settled: false
            };
            if (request.signal) {
                task.abort = () => {
                    if (task.settled) return;
                    if (task.queueId !== undefined
                        && this.queue.cancel(task.queueId, lifecycleAbortError("World overview request was aborted"))) return;
                    this.finishTask(task, () => reject(lifecycleAbortError("World overview request was aborted")));
                };
                request.signal.addEventListener("abort", task.abort, { once: true });
            }
            task.queueId = this.queue.enqueue(task, {
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                lane: request.lane ?? "background",
                weight: request.weight ?? Math.max(1,
                    Math.ceil(options.pixelWidth * options.pixelHeight / 4096),
                    Math.ceil(options.tileSpanX * options.tileSpanY / (512 * 512))
                ),
                cancelled: reason => this.finishTask(task, () => task.reject(reason))
            });
            if (task.queueId === undefined && !task.settled) {
                this.finishTask(task, () => reject(new WorkQueueBackpressureError("World overview request was shed")));
            }
            if (task.queueId !== undefined) this.notifyScheduled(task, request.onScheduled);
            this.dispatch();
        });
    }

    public get stats(): Readonly<WorldGeneratorPoolStats> {
        const queued = this.queue.values.filter(task => !task.settled && !task.signal?.aborted);
        const queueStats = this.queue.stats;
        return {
            workers: this.slots.length,
            configuredWorkers: this.desiredSize,
            busyWorkers: this.slots.filter(slot => slot.busy).length,
            queued: queued.length,
            completed: this.completed,
            queuedChunks: queued.filter(task => task.kind === "chunk").length,
            queuedVegetation: queued.filter(task => task.kind === "vegetation").length,
            queuedOverviews: queued.filter(task => task.kind === "overview").length,
            busyChunkWorkers: this.slots.filter(slot => slot.busy && slot.taskKind === "chunk").length,
            busyVegetationWorkers: this.slots.filter(slot => slot.busy && slot.taskKind === "vegetation").length,
            busyOverviewWorkers: this.slots.filter(slot => slot.busy && slot.taskKind === "overview").length,
            averageChunkMs: this.averageChunkMs,
            averageVegetationMs: this.averageVegetationMs,
            averageOverviewMs: this.averageOverviewMs,
            queuedWeight: queueStats.pendingWeight,
            oldestQueuedMs: queueStats.oldestTaskAgeMs,
            shedTasks: queueStats.shedTasks,
            starvationPromotions: queueStats.starvationPromotions,
            workerFailures: this.workerFailures,
            clientFactoryFailures: this.clientFactoryFailures
        };
    }

    public configureSize(size: number): number {
        if (this.disposed) throw new Error("WorldGeneratorPool has been disposed");
        if (!Number.isInteger(size) || size <= 0 || size > this.maxWorkers) {
            throw new RangeError(`worker pool size must be an integer between 1 and ${this.maxWorkers}`);
        }
        this.desiredSize = size;
        this.reconcileSize(true);
        this.dispatch();
        return this.desiredSize;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.coordinatorAbort) this.coordinatorSignal?.removeEventListener("abort", this.coordinatorAbort);
        const error = lifecycleAbortError("World generator pool was disposed");
        this.queue.clear(error);
        this.workCoordinator?.releaseQueue(this.queue, false);
        for (const slot of this.slots) {
            if (slot.task) this.finishTask(slot.task, () => slot.task!.reject(error));
            try { slot.client.dispose(); } catch { /* continue releasing the remaining workers */ }
        }
    }

    private dispatch(): void {
        if (this.disposed) return;
        for (const slot of this.slots) {
            if (slot.busy) continue;
            const task = this.takeNextTask();
            if (!task) return;
            // Client construction may fail independently of the task. Reject
            // one admitted request, leave the slot idle, and retry creation on
            // the next dispatch instead of leaking the removed queue entry.
            if (slot.client.isDisposed) {
                const replacementError = this.replaceDisposedClient(slot);
                if (replacementError) {
                    this.finishTask(task, () => task.reject(replacementError));
                    if (this.slots.every(candidate => candidate.client.isDisposed)) {
                        this.queue.clear(replacementError);
                    }
                    continue;
                }
            }
            slot.busy = true;
            slot.taskKind = task.kind;
            slot.task = task;
            const started = typeof performance === "undefined" ? Date.now() : performance.now();
            // A custom client is allowed to fail synchronously. Preserve the
            // existing immediate dispatch contract, but normalize a throw to
            // a rejected promise so slot cleanup always runs.
            let pending: Promise<PackedWorldChunk | WorldVegetationLayout | WorldOverviewRaster>;
            try {
                if (task.kind === "chunk") {
                    pending = slot.client.generateChunk(task.options as WorldChunkGenerationOptions);
                } else if (task.kind === "vegetation") {
                    pending = slot.client.generateVegetation
                        ? slot.client.generateVegetation(task.options as WorldVegetationGenerationOptions)
                        : Promise.reject(new Error("World generation client does not support vegetation tasks"));
                } else {
                    pending = slot.client.generateOverview
                        ? slot.client.generateOverview(task.options as WorldOverviewGenerationOptions, task.signal)
                        : Promise.reject(new Error("World generation client does not support overview tasks"));
                }
            } catch (reason) {
                pending = Promise.reject(reason);
            }
            void pending.then(
                result => {
                    if (!task!.settled) {
                        this.completed += 1;
                        this.finishTask(task!, () => task!.resolve(result));
                    }
                },
                reason => {
                    if (!task!.settled) {
                        const error = reason instanceof Error ? reason : new Error(String(reason));
                        this.finishTask(task!, () => task!.reject(error));
                    }
                    if (slot.client.isDisposed) this.workerFailures += 1;
                }
            ).finally(() => {
                const finished = typeof performance === "undefined" ? Date.now() : performance.now();
                this.recordDuration(task!.kind, Math.max(0, finished - started));
                slot.busy = false;
                slot.taskKind = undefined;
                slot.task = undefined;
                this.reconcileSize(false);
                this.dispatch();
            });
        }
    }

    private takeNextTask(): QueuedTask | undefined {
        const activeWorkers = Math.max(1, Math.min(this.desiredSize, this.slots.length));
        const maximumBackground = activeWorkers === 1
            ? 1
            : Math.max(1, activeWorkers - this.reservedChunkWorkers);
        const busyBackground = this.slots.filter(candidate =>
            candidate.busy && candidate.taskKind !== "chunk").length;
        const task = this.queue.take(busyBackground >= maximumBackground
            ? candidate => candidate.kind === "chunk"
            : undefined);
        if (task) {
            task.queueId = undefined;
            task.started = true;
        }
        return task;
    }

    private notifyScheduled(task: QueuedTask, observer: ChunkRequestOptions["onScheduled"]): void {
        if (!observer) return;
        try {
            observer({
                get started() { return task.started; },
                reprioritize: (lane, priority) => task.queueId !== undefined
                    && !task.settled
                    && this.queue.update(task.queueId, { lane, priority }),
                cancelQueued: () => task.queueId !== undefined
                    && !task.settled
                    && this.queue.cancel(task.queueId, lifecycleAbortError("Queued world task was cancelled"))
            });
        } catch (reason) {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            if (task.queueId !== undefined) this.queue.cancel(task.queueId, error);
        }
    }

    private recordDuration(kind: QueuedTask["kind"], durationMs: number): void {
        const alpha = 0.2;
        if (kind === "chunk") {
            this.averageChunkMs = this.averageChunkMs === 0
                ? durationMs : this.averageChunkMs + (durationMs - this.averageChunkMs) * alpha;
        } else if (kind === "vegetation") {
            this.averageVegetationMs = this.averageVegetationMs === 0
                ? durationMs : this.averageVegetationMs + (durationMs - this.averageVegetationMs) * alpha;
        } else {
            this.averageOverviewMs = this.averageOverviewMs === 0
                ? durationMs : this.averageOverviewMs + (durationMs - this.averageOverviewMs) * alpha;
        }
    }

    private finishTask(task: QueuedTask, settle: () => void): void {
        if (task.settled) return;
        task.settled = true;
        if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
        settle();
    }

    private replaceDisposedClient(slot: WorkerSlot): Error | undefined {
        try {
            slot.client = this.createClient();
            return undefined;
        } catch (reason) {
            this.clientFactoryFailures += 1;
            return reason instanceof Error ? reason : new Error(String(reason));
        }
    }

    private createClient(): ChunkGeneratorClient {
        const client = this.clientFactory();
        if (!client || typeof client.generateChunk !== "function" || typeof client.dispose !== "function") {
            throw new TypeError("clientFactory must return a chunk generator client");
        }
        if (client.isDisposed) {
            try { client.dispose(); } catch { /* invalid clients still need best-effort cleanup */ }
            throw new Error("clientFactory returned an already disposed client");
        }
        return client;
    }

    private reconcileSize(throwOnFactoryFailure: boolean): void {
        if (this.disposed) return;
        while (this.slots.length > this.desiredSize) {
            let index = -1;
            for (let candidate = this.slots.length - 1; candidate >= 0; candidate -= 1) {
                if (!this.slots[candidate].busy) {
                    index = candidate;
                    break;
                }
            }
            if (index < 0) break;
            const [slot] = this.slots.splice(index, 1);
            try { slot.client.dispose(); } catch { /* continue shrinking the pool */ }
        }
        while (this.slots.length < this.desiredSize) {
            try {
                this.slots.push({ client: this.createClient(), busy: false });
            } catch (reason) {
                this.clientFactoryFailures += 1;
                if (throwOnFactoryFailure) throw reason;
                break;
            }
        }
    }
}

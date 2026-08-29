import {
    PriorityTaskQueue,
    WorkLane,
    WorkQueueBackpressureError
} from "../runtime/PriorityTaskQueue";
import { BaseSemanticChunk } from "./BaseSemanticChunk";
import {
    GenerateSemanticChunkOptions,
    SurfaceWorkerClient
} from "./SurfaceWorkerClient";

export interface SemanticChunkWorkerClient {
    generateSemanticChunk(options: Readonly<GenerateSemanticChunkOptions>): Promise<BaseSemanticChunk>;
    dispose(): void;
    readonly isDisposed?: boolean;
}

export interface SurfaceTaskRequestOptions {
    readonly priority?: number;
    readonly signal?: AbortSignal;
    readonly lane?: WorkLane;
    readonly weight?: number;
}

export interface SurfaceWorkerPoolOptions {
    readonly size?: number;
    readonly maxWorkers?: number;
    readonly workerOptions?: WorkerOptions;
    readonly clientFactory?: () => SemanticChunkWorkerClient;
    readonly maxQueuedTasks?: number;
    readonly maxQueuedWeight?: number;
    readonly starvationMs?: number;
    readonly maximumWorkerRetries?: number;
    readonly now?: () => number;
}

export interface SurfaceWorkerPoolStats {
    readonly workers: number;
    readonly busyWorkers: number;
    readonly queued: number;
    readonly completed: number;
    readonly workerFailures: number;
    readonly retried: number;
    readonly queuedWeight: number;
    readonly oldestQueuedMs: number;
    readonly shedTasks: number;
    readonly starvationPromotions: number;
    readonly averageSemanticChunkMs: number;
}

interface SemanticTask {
    readonly options: GenerateSemanticChunkOptions;
    readonly signal?: AbortSignal;
    readonly resolve: (chunk: BaseSemanticChunk) => void;
    readonly reject: (error: Error) => void;
    queueId?: number;
    abort?: () => void;
    attempts: number;
    settled: boolean;
}

interface WorkerSlot {
    client: SemanticChunkWorkerClient;
    busy: boolean;
    task?: SemanticTask;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("surface worker task was aborted", "AbortError");
    const error = new Error("surface worker task was aborted");
    error.name = "AbortError";
    return error;
}

function defaultPoolSize(maxWorkers: number): number {
    const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(maxWorkers, hardware - 1));
}

export class SurfaceWorkerPool {
    private readonly slots: WorkerSlot[] = [];
    private readonly clientFactory: () => SemanticChunkWorkerClient;
    private readonly queue: PriorityTaskQueue<SemanticTask>;
    private readonly maximumWorkerRetries: number;
    private completed = 0;
    private workerFailures = 0;
    private retried = 0;
    private averageSemanticChunkMs = 0;
    private disposed = false;

    constructor(workerUrl: string | URL, options: Readonly<SurfaceWorkerPoolOptions> = {}) {
        const maxWorkers = options.maxWorkers ?? 8;
        if (!Number.isInteger(maxWorkers) || maxWorkers <= 0 || maxWorkers > 8) {
            throw new RangeError("surface worker maxWorkers must be an integer between 1 and 8");
        }
        const size = options.size ?? defaultPoolSize(maxWorkers);
        if (!Number.isInteger(size) || size <= 0 || size > maxWorkers) {
            throw new RangeError(`surface worker pool size must be an integer between 1 and ${maxWorkers}`);
        }
        this.maximumWorkerRetries = options.maximumWorkerRetries ?? 1;
        if (!Number.isInteger(this.maximumWorkerRetries)
            || this.maximumWorkerRetries < 0 || this.maximumWorkerRetries > 2) {
            throw new RangeError("surface worker retry count must be an integer between 0 and 2");
        }
        this.clientFactory = options.clientFactory
            ?? (() => new SurfaceWorkerClient(workerUrl, options.workerOptions ?? { type: "module" }));
        this.queue = new PriorityTaskQueue<SemanticTask>({
            maxPendingTasks: options.maxQueuedTasks ?? 512,
            maxPendingWeight: options.maxQueuedWeight ?? 512,
            starvationMs: options.starvationMs,
            now: options.now
        });
        try {
            for (let index = 0; index < size; index += 1) {
                this.slots.push({ client: this.createClient(), busy: false });
            }
        } catch (reason) {
            for (const slot of this.slots) {
                try { slot.client.dispose(); } catch { /* continue constructor cleanup */ }
            }
            this.slots.length = 0;
            throw reason;
        }
    }

    public generateSemanticChunk(
        options: Readonly<GenerateSemanticChunkOptions>,
        request: Readonly<SurfaceTaskRequestOptions> = {}
    ): Promise<BaseSemanticChunk> {
        if (this.disposed) return Promise.reject(new Error("SurfaceWorkerPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        return new Promise<BaseSemanticChunk>((resolve, reject) => {
            const task: SemanticTask = {
                options,
                signal: request.signal,
                resolve,
                reject,
                attempts: 0,
                settled: false
            };
            if (request.signal) {
                task.abort = () => {
                    if (task.settled) return;
                    if (task.queueId !== undefined && this.queue.cancel(task.queueId, abortError())) return;
                    this.finishTask(task, () => reject(abortError()));
                };
                request.signal.addEventListener("abort", task.abort, { once: true });
            }
            task.queueId = this.queue.enqueue(task, {
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                lane: request.lane ?? "visible",
                weight: request.weight ?? 1,
                cancelled: reason => this.finishTask(task, () => reject(reason))
            });
            if (task.queueId === undefined && !task.settled) {
                this.finishTask(task, () => reject(new WorkQueueBackpressureError("surface worker task was shed")));
            }
            this.dispatch();
        });
    }

    public get stats(): Readonly<SurfaceWorkerPoolStats> {
        const queue = this.queue.stats;
        return Object.freeze({
            workers: this.slots.length,
            busyWorkers: this.slots.filter(slot => slot.busy).length,
            queued: queue.pendingTasks,
            completed: this.completed,
            workerFailures: this.workerFailures,
            retried: this.retried,
            queuedWeight: queue.pendingWeight,
            oldestQueuedMs: queue.oldestTaskAgeMs,
            shedTasks: queue.shedTasks,
            starvationPromotions: queue.starvationPromotions,
            averageSemanticChunkMs: this.averageSemanticChunkMs
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new Error("surface worker pool was disposed");
        this.queue.clear(error);
        for (const slot of this.slots) {
            if (slot.task) this.finishTask(slot.task, () => slot.task!.reject(error));
            try { slot.client.dispose(); } catch { /* continue disposing the remaining workers */ }
        }
    }

    private dispatch(): void {
        if (this.disposed) return;
        for (const slot of this.slots) {
            if (slot.busy) continue;
            const task = this.queue.take();
            if (!task) return;
            task.queueId = undefined;
            slot.busy = true;
            slot.task = task;
            if (slot.client.isDisposed) {
                try {
                    slot.client = this.createClient();
                } catch (reason) {
                    const error = reason instanceof Error ? reason : new Error(String(reason));
                    this.finishTask(task, () => task.reject(error));
                    this.releaseSlot(slot);
                    continue;
                }
            }
            this.execute(slot, task);
        }
    }

    private execute(slot: WorkerSlot, task: SemanticTask): void {
        const started = typeof performance === "undefined" ? Date.now() : performance.now();
        let pending: Promise<BaseSemanticChunk>;
        try {
            pending = slot.client.generateSemanticChunk(task.options);
        } catch (reason) {
            pending = Promise.reject(reason);
        }
        void pending.then(chunk => {
            this.recordDuration(started);
            if (!task.settled) {
                this.completed += 1;
                this.finishTask(task, () => task.resolve(chunk));
            }
            this.releaseSlot(slot);
        }, reason => {
            this.recordDuration(started);
            const error = reason instanceof Error ? reason : new Error(String(reason));
            const workerFailed = slot.client.isDisposed && !this.disposed;
            if (workerFailed) this.workerFailures += 1;
            if (!task.settled && workerFailed && task.attempts < this.maximumWorkerRetries) {
                task.attempts += 1;
                this.retried += 1;
                try {
                    slot.client = this.createClient();
                    this.execute(slot, task);
                    return;
                } catch (replacementReason) {
                    const replacementError = replacementReason instanceof Error
                        ? replacementReason : new Error(String(replacementReason));
                    this.finishTask(task, () => task.reject(replacementError));
                    this.releaseSlot(slot);
                    return;
                }
            }
            if (!task.settled) this.finishTask(task, () => task.reject(error));
            this.releaseSlot(slot);
        });
    }

    private releaseSlot(slot: WorkerSlot): void {
        slot.busy = false;
        slot.task = undefined;
        this.dispatch();
    }

    private finishTask(task: SemanticTask, settle: () => void): void {
        if (task.settled) return;
        task.settled = true;
        if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
        settle();
    }

    private createClient(): SemanticChunkWorkerClient {
        const client = this.clientFactory();
        if (!client || typeof client.generateSemanticChunk !== "function" || typeof client.dispose !== "function") {
            throw new TypeError("surface worker client factory returned an invalid client");
        }
        if (client.isDisposed) {
            try { client.dispose(); } catch { /* invalid clients still need best-effort cleanup */ }
            throw new Error("surface worker client factory returned a disposed client");
        }
        return client;
    }

    private recordDuration(started: number): void {
        const finished = typeof performance === "undefined" ? Date.now() : performance.now();
        const duration = Math.max(0, finished - started);
        this.averageSemanticChunkMs = this.averageSemanticChunkMs === 0
            ? duration : this.averageSemanticChunkMs + (duration - this.averageSemanticChunkMs) * 0.2;
    }
}

import { PackedWorldChunk, WorldChunkGenerationOptions } from "./generateWorldChunk";
import { WorldGeneratorClient } from "./WorldGeneratorClient";

export interface ChunkGeneratorClient {
    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk>;
    dispose(): void;
    readonly isDisposed?: boolean;
}

export interface WorldGeneratorPoolOptions {
    size?: number;
    maxWorkers?: number;
    workerOptions?: WorkerOptions;
    clientFactory?: () => ChunkGeneratorClient;
}

export interface ChunkRequestOptions {
    priority?: number;
    signal?: AbortSignal;
}

export interface WorldGeneratorPoolStats {
    workers: number;
    busyWorkers: number;
    queued: number;
    completed: number;
}

interface QueuedTask {
    sequence: number;
    priority: number;
    options: WorldChunkGenerationOptions;
    signal?: AbortSignal;
    resolve(chunk: PackedWorldChunk): void;
    reject(error: Error): void;
    abort?: () => void;
    settled: boolean;
}

interface WorkerSlot {
    client: ChunkGeneratorClient;
    busy: boolean;
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("World chunk request was aborted", "AbortError");
    const error = new Error("World chunk request was aborted");
    error.name = "AbortError";
    return error;
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
    private readonly queue: QueuedTask[] = [];
    private sequence = 0;
    private completed = 0;
    private disposed = false;

    constructor(workerUrl: string | URL, options: WorldGeneratorPoolOptions = {}) {
        const maxWorkers = options.maxWorkers ?? 8;
        const size = options.size ?? defaultPoolSize(maxWorkers);
        if (!Number.isInteger(size) || size <= 0 || size > maxWorkers) {
            throw new RangeError(`worker pool size must be an integer between 1 and ${maxWorkers}`);
        }
        this.clientFactory = options.clientFactory
            ?? (() => new WorldGeneratorClient(workerUrl, options.workerOptions ?? { type: "module" }));
        this.slots = Array.from({ length: size }, () => ({ client: this.clientFactory(), busy: false }));
    }

    public generateChunk(
        options: WorldChunkGenerationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<PackedWorldChunk> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        return new Promise<PackedWorldChunk>((resolve, reject) => {
            const task: QueuedTask = {
                sequence: this.sequence++,
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                options,
                signal: request.signal,
                resolve,
                reject,
                settled: false
            };
            if (request.signal) {
                task.abort = () => {
                    if (task.settled) return;
                    task.settled = true;
                    const index = this.queue.indexOf(task);
                    if (index >= 0) this.queue.splice(index, 1);
                    reject(abortError());
                };
                request.signal.addEventListener("abort", task.abort, { once: true });
            }
            this.queue.push(task);
            this.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
            this.dispatch();
        });
    }

    public get stats(): Readonly<WorldGeneratorPoolStats> {
        return {
            workers: this.slots.length,
            busyWorkers: this.slots.filter(slot => slot.busy).length,
            queued: this.queue.length,
            completed: this.completed
        };
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new Error("WorldGeneratorPool was disposed");
        for (const task of this.queue.splice(0)) this.finishTask(task, () => task.reject(error));
        for (const slot of this.slots) slot.client.dispose();
    }

    private dispatch(): void {
        if (this.disposed) return;
        for (const slot of this.slots) {
            if (slot.busy) continue;
            let task: QueuedTask | undefined;
            while ((task = this.queue.shift())) {
                if (!task.settled && !task.signal?.aborted) break;
                if (!task.settled) {
                    const abortedTask = task;
                    this.finishTask(abortedTask, () => abortedTask.reject(abortError()));
                }
                task = undefined;
            }
            if (!task) return;
            slot.busy = true;
            void slot.client.generateChunk(task.options).then(
                chunk => {
                    if (!task!.settled) {
                        this.completed += 1;
                        this.finishTask(task!, () => task!.resolve(chunk));
                    }
                },
                reason => {
                    if (!task!.settled) {
                        const error = reason instanceof Error ? reason : new Error(String(reason));
                        this.finishTask(task!, () => task!.reject(error));
                    }
                    if (!this.disposed && slot.client.isDisposed) slot.client = this.clientFactory();
                }
            ).finally(() => {
                slot.busy = false;
                this.dispatch();
            });
        }
    }

    private finishTask(task: QueuedTask, settle: () => void): void {
        if (task.settled) return;
        task.settled = true;
        if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
        settle();
    }
}

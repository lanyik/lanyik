import { PackedWorldChunk, WorldChunkGenerationOptions } from "./generateWorldChunk";
import { WorldVegetationGenerationOptions, WorldVegetationLayout } from "./generateVegetation";
import { WorldGeneratorClient } from "./WorldGeneratorClient";

export interface ChunkGeneratorClient {
    generateChunk(options: WorldChunkGenerationOptions): Promise<PackedWorldChunk>;
    generateVegetation?(options: WorldVegetationGenerationOptions): Promise<WorldVegetationLayout>;
    dispose(): void;
    readonly isDisposed?: boolean;
}

export interface WorldGeneratorPoolOptions {
    size?: number;
    maxWorkers?: number;
    workerOptions?: WorkerOptions;
    clientFactory?: () => ChunkGeneratorClient;
    reservedChunkWorkers?: number;
}

export interface ChunkRequestOptions {
    priority?: number;
    signal?: AbortSignal;
}

export interface WorldGeneratorPoolStats {
    workers: number;
    configuredWorkers: number;
    busyWorkers: number;
    queued: number;
    completed: number;
    queuedChunks: number;
    queuedVegetation: number;
    busyChunkWorkers: number;
    busyVegetationWorkers: number;
    averageChunkMs: number;
    averageVegetationMs: number;
}

interface QueuedTask {
    kind: "chunk" | "vegetation";
    sequence: number;
    priority: number;
    options: WorldChunkGenerationOptions | WorldVegetationGenerationOptions;
    signal?: AbortSignal;
    resolve(result: PackedWorldChunk | WorldVegetationLayout): void;
    reject(error: Error): void;
    abort?: () => void;
    settled: boolean;
}

interface WorkerSlot {
    client: ChunkGeneratorClient;
    busy: boolean;
    taskKind?: QueuedTask["kind"];
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
    private readonly maxWorkers: number;
    private readonly reservedChunkWorkers: number;
    private desiredSize: number;
    private averageChunkMs = 0;
    private averageVegetationMs = 0;

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
                kind: "chunk",
                sequence: this.sequence++,
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                options,
                signal: request.signal,
                resolve: result => resolve(result as PackedWorldChunk),
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

    public generateVegetation(
        options: WorldVegetationGenerationOptions,
        request: ChunkRequestOptions = {}
    ): Promise<WorldVegetationLayout> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
        if (request.signal?.aborted) return Promise.reject(abortError());
        return new Promise<WorldVegetationLayout>((resolve, reject) => {
            const task: QueuedTask = {
                kind: "vegetation",
                sequence: this.sequence++,
                priority: Number.isFinite(request.priority) ? request.priority as number : 0,
                options,
                signal: request.signal,
                resolve: result => resolve(result as WorldVegetationLayout),
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
        const queued = this.queue.filter(task => !task.settled && !task.signal?.aborted);
        return {
            workers: this.slots.length,
            configuredWorkers: this.desiredSize,
            busyWorkers: this.slots.filter(slot => slot.busy).length,
            queued: queued.length,
            completed: this.completed,
            queuedChunks: queued.filter(task => task.kind === "chunk").length,
            queuedVegetation: queued.filter(task => task.kind === "vegetation").length,
            busyChunkWorkers: this.slots.filter(slot => slot.busy && slot.taskKind === "chunk").length,
            busyVegetationWorkers: this.slots.filter(slot => slot.busy && slot.taskKind === "vegetation").length,
            averageChunkMs: this.averageChunkMs,
            averageVegetationMs: this.averageVegetationMs
        };
    }

    public configureSize(size: number): number {
        if (this.disposed) throw new Error("WorldGeneratorPool has been disposed");
        if (!Number.isInteger(size) || size <= 0 || size > this.maxWorkers) {
            throw new RangeError(`worker pool size must be an integer between 1 and ${this.maxWorkers}`);
        }
        this.desiredSize = size;
        this.reconcileSize();
        this.dispatch();
        return this.desiredSize;
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
            // A Worker can enter an error state after its last request has
            // settled. In that idle-error window there is no rejected pool
            // task whose handler could replace the client, so never dispatch
            // new work through a client that already reports itself disposed.
            if (slot.client.isDisposed) slot.client = this.clientFactory();
            const task = this.takeNextTask();
            if (!task) return;
            slot.busy = true;
            slot.taskKind = task.kind;
            const started = typeof performance === "undefined" ? Date.now() : performance.now();
            const pending = task.kind === "chunk"
                ? slot.client.generateChunk(task.options as WorldChunkGenerationOptions)
                : slot.client.generateVegetation
                    ? slot.client.generateVegetation(task.options as WorldVegetationGenerationOptions)
                    : Promise.reject(new Error("World generation client does not support vegetation tasks"));
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
                    if (!this.disposed && slot.client.isDisposed) slot.client = this.clientFactory();
                }
            ).finally(() => {
                const finished = typeof performance === "undefined" ? Date.now() : performance.now();
                this.recordDuration(task!.kind, Math.max(0, finished - started));
                slot.busy = false;
                slot.taskKind = undefined;
                this.reconcileSize();
                this.dispatch();
            });
        }
    }

    private takeNextTask(): QueuedTask | undefined {
        for (let index = this.queue.length - 1; index >= 0; index -= 1) {
            const task = this.queue[index];
            if (!task.settled && !task.signal?.aborted) continue;
            this.queue.splice(index, 1);
            if (!task.settled) this.finishTask(task, () => task.reject(abortError()));
        }
        if (this.queue.length === 0) return undefined;
        const activeWorkers = Math.max(1, Math.min(this.desiredSize, this.slots.length));
        const maximumVegetation = activeWorkers === 1
            ? 1
            : Math.max(1, activeWorkers - this.reservedChunkWorkers);
        const busyVegetation = this.slots.filter(candidate =>
            candidate.busy && candidate.taskKind === "vegetation").length;
        const index = busyVegetation >= maximumVegetation
            ? this.queue.findIndex(task => task.kind === "chunk")
            : 0;
        return index < 0 ? undefined : this.queue.splice(index, 1)[0];
    }

    private recordDuration(kind: QueuedTask["kind"], durationMs: number): void {
        const alpha = 0.2;
        if (kind === "chunk") {
            this.averageChunkMs = this.averageChunkMs === 0
                ? durationMs : this.averageChunkMs + (durationMs - this.averageChunkMs) * alpha;
        } else {
            this.averageVegetationMs = this.averageVegetationMs === 0
                ? durationMs : this.averageVegetationMs + (durationMs - this.averageVegetationMs) * alpha;
        }
    }

    private finishTask(task: QueuedTask, settle: () => void): void {
        if (task.settled) return;
        task.settled = true;
        if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
        settle();
    }

    private reconcileSize(): void {
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
            slot.client.dispose();
        }
        while (this.slots.length < this.desiredSize) {
            this.slots.push({ client: this.clientFactory(), busy: false });
        }
    }
}

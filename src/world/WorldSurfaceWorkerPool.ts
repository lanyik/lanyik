import type { WorkLane } from "../runtime/PriorityTaskQueue";
import { BaseSemanticChunk } from "./semantic/BaseSemanticChunk";
import { BaseSemanticChunkGenerationOptions } from "./semantic/generateBaseSemanticChunk";
import { TransferableEffectiveWindow } from "./semantic/EffectiveSurfaceWindow";
import { HydrologyRegion } from "./semantic/HydrologyRegion";
import { HydrologyRegionGenerationOptions } from "./semantic/generateHydrologyRegion";
import { SurfaceWorkerCompilation, SurfaceWorkerCompilationError } from "./semantic/SurfaceWorkerProtocol";
import { WorldSurfaceWorkerClient } from "./WorldSurfaceWorkerClient";

export interface WorldSurfaceWorker {
    generateSemanticChunk(options: BaseSemanticChunkGenerationOptions, request?: WorldSurfaceWorkerRequestOptions): Promise<BaseSemanticChunk>;
    generateHydrologyRegion(options: HydrologyRegionGenerationOptions, request?: WorldSurfaceWorkerRequestOptions): Promise<HydrologyRegion>;
    compileSurfaceChunk(window: TransferableEffectiveWindow, request?: WorldSurfaceWorkerRequestOptions): Promise<SurfaceWorkerCompilation>;
    dispose(): void;
    readonly isDisposed?: boolean;
}

export interface WorldSurfaceWorkerRequestOptions {
    readonly priority?: number;
    readonly lane?: WorkLane;
    readonly signal?: AbortSignal;
}

export interface WorldSurfaceWorkerPoolOptions {
    readonly size?: number;
    readonly maxWorkers?: number;
    readonly maxQueuedTasks?: number;
    readonly workerOptions?: WorkerOptions;
    readonly clientFactory?: () => WorldSurfaceWorker;
}

export interface WorldSurfaceWorkerPoolStats {
    readonly state: "ready" | "disposed";
    readonly workers: number;
    readonly busyWorkers: number;
    readonly queuedTasks: number;
    readonly queuedSemanticChunks: number;
    readonly queuedHydrologyRegions: number;
    readonly queuedSurfaceChunks: number;
    readonly completedTasks: number;
    readonly rejectedTasks: number;
    readonly workerRestarts: number;
}

type TaskKind = "semantic" | "hydrology" | "surface";
type TaskInput = BaseSemanticChunkGenerationOptions | HydrologyRegionGenerationOptions | TransferableEffectiveWindow;
type TaskOutput = BaseSemanticChunk | HydrologyRegion | SurfaceWorkerCompilation;

interface Task {
    readonly sequence: number;
    readonly kind: TaskKind;
    readonly input: TaskInput;
    readonly priority: number;
    readonly lane: WorkLane;
    readonly signal?: AbortSignal;
    readonly resolve: (value: TaskOutput) => void;
    readonly reject: (error: Error) => void;
    abort?: () => void;
    running: boolean;
    settled: boolean;
    attempts: number;
}

interface Slot {
    worker: WorldSurfaceWorker;
    task?: Task;
}

const LANE_ORDER: Readonly<Record<WorkLane, number>> = Object.freeze({
    critical: 0,
    interactive: 1,
    visible: 2,
    prefetch: 3,
    background: 4
});

function defaultPoolSize(maxWorkers: number): number {
    const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(maxWorkers, hardware - 1));
}

function abortError(): Error {
    if (typeof DOMException !== "undefined") return new DOMException("surface worker task was aborted", "AbortError");
    const error = new Error("surface worker task was aborted");
    error.name = "AbortError";
    return error;
}

function asError(reason: unknown): Error { return reason instanceof Error ? reason : new Error(String(reason)); }

export class WorldSurfaceWorkerPool {
    private readonly workerUrl: string | URL;
    private readonly workerOptions: WorkerOptions;
    private readonly factory: () => WorldSurfaceWorker;
    private readonly maxQueuedTasks: number;
    private readonly slots: Slot[];
    private readonly queue: Task[] = [];
    private nextSequence = 1;
    private completed = 0;
    private rejected = 0;
    private restarts = 0;
    private disposed = false;

    constructor(workerUrl: string | URL, options: WorldSurfaceWorkerPoolOptions = {}) {
        const maxWorkers = options.maxWorkers ?? 8;
        const size = options.size ?? defaultPoolSize(maxWorkers);
        this.maxQueuedTasks = options.maxQueuedTasks ?? 512;
        if (!Number.isInteger(maxWorkers) || maxWorkers <= 0
            || !Number.isInteger(size) || size <= 0 || size > maxWorkers
            || !Number.isSafeInteger(this.maxQueuedTasks) || this.maxQueuedTasks <= 0) {
            throw new RangeError("WorldSurfaceWorkerPool limits are invalid");
        }
        this.workerUrl = workerUrl;
        this.workerOptions = options.workerOptions ?? { type: "module" };
        this.factory = options.clientFactory ?? (() => new WorldSurfaceWorkerClient(this.workerUrl, this.workerOptions));
        this.slots = Array.from({ length: size }, () => ({ worker: this.factory() }));
    }

    public generateSemanticChunk(
        options: BaseSemanticChunkGenerationOptions,
        request: WorldSurfaceWorkerRequestOptions = {}
    ): Promise<BaseSemanticChunk> {
        return this.enqueue("semantic", options, request) as Promise<BaseSemanticChunk>;
    }

    public generateHydrologyRegion(
        options: HydrologyRegionGenerationOptions,
        request: WorldSurfaceWorkerRequestOptions = {}
    ): Promise<HydrologyRegion> {
        return this.enqueue("hydrology", options, request) as Promise<HydrologyRegion>;
    }

    public compileSurfaceChunk(
        window: TransferableEffectiveWindow,
        request: WorldSurfaceWorkerRequestOptions = {}
    ): Promise<SurfaceWorkerCompilation> {
        return this.enqueue("surface", window, request) as Promise<SurfaceWorkerCompilation>;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const error = new Error("WorldSurfaceWorkerPool has been disposed");
        for (const task of this.queue.splice(0)) this.rejectTask(task, error);
        for (const slot of this.slots) {
            if (slot.task) this.rejectTask(slot.task, error);
            slot.worker.dispose();
            slot.task = undefined;
        }
    }

    public get stats(): Readonly<WorldSurfaceWorkerPoolStats> {
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            workers: this.slots.length,
            busyWorkers: this.slots.filter(slot => slot.task).length,
            queuedTasks: this.queue.length,
            queuedSemanticChunks: this.queue.filter(task => task.kind === "semantic").length,
            queuedHydrologyRegions: this.queue.filter(task => task.kind === "hydrology").length,
            queuedSurfaceChunks: this.queue.filter(task => task.kind === "surface").length,
            completedTasks: this.completed,
            rejectedTasks: this.rejected,
            workerRestarts: this.restarts
        });
    }

    private enqueue(
        kind: TaskKind,
        input: TaskInput,
        options: WorldSurfaceWorkerRequestOptions
    ): Promise<TaskOutput> {
        if (this.disposed) return Promise.reject(new Error("WorldSurfaceWorkerPool has been disposed"));
        const lane = options.lane ?? "visible";
        const priority = options.priority ?? 0;
        if (!(lane in LANE_ORDER) || !Number.isFinite(priority)
            || options.signal !== undefined && typeof options.signal.addEventListener !== "function") {
            return Promise.reject(new TypeError("surface worker request options are invalid"));
        }
        if (options.signal?.aborted) return Promise.reject(abortError());
        if (this.queue.length >= this.maxQueuedTasks && !this.slots.some(slot => !slot.task)) {
            this.rejected += 1;
            return Promise.reject(new RangeError("surface worker queue capacity is exhausted"));
        }
        return new Promise((resolve, reject) => {
            const task: Task = {
                sequence: this.nextSequence++,
                kind,
                input,
                priority,
                lane,
                signal: options.signal,
                resolve,
                reject,
                running: false,
                settled: false,
                attempts: 0
            };
            task.abort = () => {
                if (task.settled || task.running) return;
                const index = this.queue.indexOf(task);
                if (index >= 0) this.queue.splice(index, 1);
                this.rejectTask(task, abortError());
            };
            options.signal?.addEventListener("abort", task.abort, { once: true });
            this.queue.push(task);
            this.sortQueue();
            this.dispatch();
        });
    }

    private sortQueue(): void {
        this.queue.sort((first, second) => LANE_ORDER[first.lane] - LANE_ORDER[second.lane]
            || first.priority - second.priority || first.sequence - second.sequence);
    }

    private dispatch(): void {
        if (this.disposed) return;
        for (const slot of this.slots) {
            if (slot.task || this.queue.length === 0) continue;
            const task = this.queue.shift()!;
            task.running = true;
            task.attempts += 1;
            slot.task = task;
            let promise: Promise<TaskOutput>;
            if (task.kind === "semantic") {
                promise = slot.worker.generateSemanticChunk(task.input as BaseSemanticChunkGenerationOptions);
            } else if (task.kind === "hydrology") {
                promise = slot.worker.generateHydrologyRegion(task.input as HydrologyRegionGenerationOptions);
            } else {
                promise = slot.worker.compileSurfaceChunk(task.input as TransferableEffectiveWindow);
            }
            void promise.then(value => this.complete(slot, task, value), reason => this.failTask(slot, task, reason));
        }
    }

    private complete(slot: Slot, task: Task, value: TaskOutput): void {
        if (slot.task !== task) return;
        slot.task = undefined;
        if (task.signal?.aborted) {
            if (task.kind === "surface") {
                const result = value as SurfaceWorkerCompilation;
                const error = new SurfaceWorkerCompilationError("surface worker task was aborted", result.reclaimedWindowBuffers);
                error.name = "AbortError";
                this.rejectTask(task, error);
            } else this.rejectTask(task, abortError());
        } else if (!task.settled) {
            task.settled = true;
            task.signal?.removeEventListener("abort", task.abort!);
            this.completed += 1;
            task.resolve(value);
        }
        this.dispatch();
    }

    private failTask(slot: Slot, task: Task, reason: unknown): void {
        if (slot.task !== task) return;
        slot.task = undefined;
        const failedWorker = slot.worker.isDisposed === true;
        if (!this.disposed && failedWorker && task.attempts < 2 && !task.signal?.aborted) {
            try {
                slot.worker = this.factory();
                this.restarts += 1;
                task.running = false;
                this.queue.push(task);
                this.sortQueue();
                this.dispatch();
                return;
            } catch (restartReason) {
                this.rejectTask(task, asError(restartReason));
            }
        } else this.rejectTask(task, asError(reason));
        this.dispatch();
    }

    private rejectTask(task: Task, error: Error): void {
        if (task.settled) return;
        task.settled = true;
        task.signal?.removeEventListener("abort", task.abort!);
        this.rejected += 1;
        task.reject(error);
    }
}

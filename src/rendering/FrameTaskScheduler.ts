import { PriorityTaskQueue, WorkLane } from "../runtime/PriorityTaskQueue";
import { RuntimeWorkCoordinator } from "../runtime/RuntimeWorkCoordinator";

export interface FrameTaskSchedulerOptions {
    budgetMs?: number;
    maxTasksPerFrame?: number;
    now?: () => number;
    error?: (error: Error) => void;
    maxPendingTasks?: number;
    maxPendingWeight?: number;
    starvationMs?: number;
    coordinator?: RuntimeWorkCoordinator;
    domain?: string;
}

export interface FrameTaskEnqueueOptions {
    lane?: WorkLane;
    weight?: number;
    signal?: AbortSignal;
    cancelled?: (reason: Error) => void;
}

export interface FrameTaskSchedulerStats {
    pendingTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    lastFrameTasks: number;
    lastFrameDurationMs: number;
    oldestTaskAgeMs: number;
    pendingWeight: number;
    shedTasks: number;
    starvationPromotions: number;
}

interface FrameTask {
    run(): void;
}

//A small main-thread backpressure queue. Worker results may arrive together,
//but expensive scene/BufferGeometry mounts are admitted over multiple frames.
export class FrameTaskScheduler {
    private readonly tasks: PriorityTaskQueue<FrameTask>;
    private readonly now: () => number;
    private readonly error?: (error: Error) => void;
    private readonly workCoordinator: RuntimeWorkCoordinator | undefined;
    private budgetMs: number;
    private maxTasksPerFrame: number;
    private completed = 0;
    private lastFrameTasks = 0;
    private lastFrameDurationMs = 0;
    private disposed = false;

    constructor(options: FrameTaskSchedulerOptions = {}) {
        this.budgetMs = options.budgetMs ?? 3;
        this.maxTasksPerFrame = options.maxTasksPerFrame ?? 2;
        this.now = options.now ?? (() => performance.now());
        this.error = options.error;
        this.workCoordinator = options.coordinator;
        const queueOptions = {
            now: this.now,
            maxPendingTasks: options.maxPendingTasks,
            maxPendingWeight: options.maxPendingWeight,
            starvationMs: options.starvationMs
        };
        this.tasks = options.coordinator
            ? options.coordinator.createQueue<FrameTask>(options.domain ?? "frame", queueOptions)
            : new PriorityTaskQueue<FrameTask>(queueOptions);
        this.validate();
    }

    public configure(options: Pick<FrameTaskSchedulerOptions, "budgetMs" | "maxTasksPerFrame">): void {
        if (this.disposed) throw new Error("FrameTaskScheduler has been disposed");
        if (options.budgetMs !== undefined) this.budgetMs = options.budgetMs;
        if (options.maxTasksPerFrame !== undefined) this.maxTasksPerFrame = options.maxTasksPerFrame;
        this.validate();
    }

    public enqueue(
        key: string,
        priority: number,
        run: () => void,
        options: FrameTaskEnqueueOptions = {}
    ): boolean {
        if (this.disposed) throw new Error("FrameTaskScheduler has been disposed");
        if (!key) throw new TypeError("frame task key is required");
        if (!Number.isFinite(priority)) throw new RangeError("frame task priority must be finite");
        return this.tasks.enqueue({ run }, {
            key,
            priority,
            lane: options.lane ?? "visible",
            weight: options.weight,
            signal: options.signal,
            cancelled: options.cancelled
        }) !== undefined;
    }

    public cancel(key: string): boolean {
        return this.tasks.cancelKey(key);
    }

    public clear(): void {
        this.tasks.clear();
        this.lastFrameTasks = 0;
        this.lastFrameDurationMs = 0;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.workCoordinator?.releaseQueue(this.tasks, false);
    }

    public runFrame(): number {
        if (this.disposed) return 0;
        const started = this.now();
        let ran = 0;
        while (true) {
            if (ran >= this.maxTasksPerFrame) break;
            if (ran > 0 && this.now() - started >= this.budgetMs) break;
            const task = this.tasks.take();
            if (!task) break;
            try {
                task.run();
            } catch (reason) {
                try {
                    this.error?.(reason instanceof Error ? reason : new Error(String(reason)));
                } catch {
                    //Observers cannot break the frame loop.
                }
            }
            ran += 1;
            this.completed += 1;
        }
        this.lastFrameTasks = ran;
        this.lastFrameDurationMs = this.now() - started;
        return ran;
    }

    public get stats(): Readonly<FrameTaskSchedulerStats> {
        const queue = this.tasks.stats;
        return {
            pendingTasks: queue.pendingTasks,
            completedTasks: this.completed,
            cancelledTasks: queue.cancelledTasks,
            lastFrameTasks: this.lastFrameTasks,
            lastFrameDurationMs: this.lastFrameDurationMs,
            oldestTaskAgeMs: queue.oldestTaskAgeMs,
            pendingWeight: queue.pendingWeight,
            shedTasks: queue.shedTasks,
            starvationPromotions: queue.starvationPromotions
        };
    }

    private validate(): void {
        if (!Number.isFinite(this.budgetMs) || this.budgetMs <= 0) {
            throw new RangeError("frame task budgetMs must be a positive finite number");
        }
        if (!Number.isInteger(this.maxTasksPerFrame) || this.maxTasksPerFrame <= 0) {
            throw new RangeError("frame task maxTasksPerFrame must be a positive integer");
        }
    }
}

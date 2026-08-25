export interface FrameTaskSchedulerOptions {
    budgetMs?: number;
    maxTasksPerFrame?: number;
    now?: () => number;
    error?: (error: Error) => void;
}

export interface FrameTaskSchedulerStats {
    pendingTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    lastFrameTasks: number;
    lastFrameDurationMs: number;
}

interface FrameTask {
    key: string;
    priority: number;
    sequence: number;
    run(): void;
}

//A small main-thread backpressure queue. Worker results may arrive together,
//but expensive scene/BufferGeometry mounts are admitted over multiple frames.
export class FrameTaskScheduler {
    private readonly tasks = new Map<string, FrameTask>();
    private readonly now: () => number;
    private readonly error?: (error: Error) => void;
    private budgetMs: number;
    private maxTasksPerFrame: number;
    private sequence = 0;
    private completed = 0;
    private cancelled = 0;
    private lastFrameTasks = 0;
    private lastFrameDurationMs = 0;

    constructor(options: FrameTaskSchedulerOptions = {}) {
        this.budgetMs = options.budgetMs ?? 3;
        this.maxTasksPerFrame = options.maxTasksPerFrame ?? 2;
        this.now = options.now ?? (() => performance.now());
        this.error = options.error;
        this.validate();
    }

    public configure(options: Pick<FrameTaskSchedulerOptions, "budgetMs" | "maxTasksPerFrame">): void {
        if (options.budgetMs !== undefined) this.budgetMs = options.budgetMs;
        if (options.maxTasksPerFrame !== undefined) this.maxTasksPerFrame = options.maxTasksPerFrame;
        this.validate();
    }

    public enqueue(key: string, priority: number, run: () => void): void {
        if (!key) throw new TypeError("frame task key is required");
        if (!Number.isFinite(priority)) throw new RangeError("frame task priority must be finite");
        this.tasks.set(key, { key, priority, sequence: this.sequence++, run });
    }

    public cancel(key: string): boolean {
        const removed = this.tasks.delete(key);
        if (removed) this.cancelled += 1;
        return removed;
    }

    public clear(): void {
        this.cancelled += this.tasks.size;
        this.tasks.clear();
        this.lastFrameTasks = 0;
        this.lastFrameDurationMs = 0;
    }

    public runFrame(): number {
        const started = this.now();
        let ran = 0;
        const ordered = [...this.tasks.values()]
            .sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
        for (const task of ordered) {
            if (ran >= this.maxTasksPerFrame) break;
            if (ran > 0 && this.now() - started >= this.budgetMs) break;
            if (!this.tasks.delete(task.key)) continue;
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
        return {
            pendingTasks: this.tasks.size,
            completedTasks: this.completed,
            cancelledTasks: this.cancelled,
            lastFrameTasks: this.lastFrameTasks,
            lastFrameDurationMs: this.lastFrameDurationMs
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

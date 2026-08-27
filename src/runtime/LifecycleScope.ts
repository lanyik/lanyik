export type LifecycleState = "active" | "closing" | "closed";

export interface LifecycleScopeOptions {
    now?: () => number;
    error?: (error: Error) => void;
    /**
     * Maximum time close() waits for cooperative tasks before detaching them.
     * Omit to wait indefinitely. Detachment never re-enables publication.
     */
    drainTimeoutMs?: number;
}

export interface LifecycleScopeStats {
    readonly label: string;
    readonly generation: number;
    readonly state: LifecycleState;
    readonly pendingTasks: number;
    readonly startedTasks: number;
    readonly completedTasks: number;
    readonly failedTasks: number;
    readonly cancelledTasks: number;
    readonly detachedTasks: number;
    readonly rejectedPublications: number;
    readonly drainTimedOut: boolean;
    readonly ageMs: number;
}

let nextLifecycleGeneration = 1;

export function lifecycleAbortError(message = "Lifecycle scope was closed"): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export class LifecycleDrainTimeoutError extends Error {
    public readonly name = "LifecycleDrainTimeoutError";

    constructor(
        public readonly label: string,
        public readonly timeoutMs: number,
        public readonly detachedTasks: number
    ) {
        super(`${label} did not drain ${detachedTasks} task(s) within ${timeoutMs}ms`);
    }
}

// A lifecycle scope is the ownership boundary for one replaceable asynchronous
// session. Closing it aborts producers immediately; tracked work may finish in
// the background, but publish() makes late results unable to escape the scope.
export class LifecycleScope {
    public readonly generation = nextLifecycleGeneration++;
    private readonly controller = new AbortController();
    private readonly pending = new Set<Promise<unknown>>();
    private readonly now: () => number;
    private readonly reportError?: (error: Error) => void;
    private readonly drainTimeoutMs: number | undefined;
    private readonly startedAt: number;
    private stateValue: LifecycleState = "active";
    private startedTasks = 0;
    private completedTasks = 0;
    private failedTasks = 0;
    private cancelledTasks = 0;
    private detachedTasks = 0;
    private rejectedPublications = 0;
    private drainTimedOut = false;
    private settlePromise: Promise<void> | undefined;
    private resolveSettled: (() => void) | undefined;
    private drainTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(public readonly label: string, options: LifecycleScopeOptions = {}) {
        if (typeof label !== "string" || label.trim().length === 0) {
            throw new TypeError("lifecycle scope label must be a non-empty string");
        }
        this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
        this.reportError = options.error;
        this.drainTimeoutMs = options.drainTimeoutMs;
        if (this.drainTimeoutMs !== undefined
            && (!Number.isFinite(this.drainTimeoutMs) || this.drainTimeoutMs <= 0)) {
            throw new RangeError("lifecycle drainTimeoutMs must be positive and finite");
        }
        this.startedAt = this.now();
    }

    public get signal(): AbortSignal { return this.controller.signal; }
    public get state(): LifecycleState { return this.stateValue; }
    public get active(): boolean { return this.stateValue === "active"; }

    public throwIfClosed(): void {
        if (!this.active) throw lifecycleAbortError(`${this.label} is no longer active`);
    }

    public track<T>(task: PromiseLike<T>): Promise<T> {
        if (!this.active) {
            // The caller may already have started the promise while evaluating
            // track(task). Observe it so a late rejection cannot become an
            // unhandled process/page error; use run() when lazy start matters.
            void Promise.resolve(task).catch(() => undefined);
            return Promise.reject(lifecycleAbortError(`${this.label} is no longer active`));
        }
        this.startedTasks += 1;
        let observed: Promise<T>;
        observed = Promise.resolve(task).then(
            value => {
                this.completedTasks += 1;
                return value;
            },
            reason => {
                const error = reason instanceof Error ? reason : new Error(String(reason));
                if (error.name === "AbortError" || this.signal.aborted) this.cancelledTasks += 1;
                else {
                    this.failedTasks += 1;
                    try { this.reportError?.(error); } catch { /* observers do not own the scope */ }
                }
                throw reason;
            }
        );
        this.pending.add(observed);
        void observed.then(
            () => this.finish(observed),
            () => this.finish(observed)
        );
        return observed;
    }

    public run<T>(operation: (signal: AbortSignal) => PromiseLike<T> | T): Promise<T> {
        if (!this.active) return Promise.reject(lifecycleAbortError(`${this.label} is no longer active`));
        let result: PromiseLike<T> | T;
        try {
            result = operation(this.signal);
        } catch (reason) {
            result = Promise.reject(reason);
        }
        return this.track(Promise.resolve(result));
    }

    // Returns false instead of invoking an observer when the session has been
    // superseded. Callers can release the value in onRejected when it owns a
    // resource that otherwise needs explicit cleanup.
    public publish<T>(value: T, observer: (value: T) => void, onRejected?: (value: T) => void): boolean {
        if (!this.active) {
            this.rejectedPublications += 1;
            try { onRejected?.(value); } catch (reason) { this.captureError(reason); }
            return false;
        }
        observer(value);
        return true;
    }

    public close(reason: unknown = lifecycleAbortError(`${this.label} was closed`)): Promise<void> {
        if (this.stateValue === "active") {
            this.stateValue = "closing";
            this.controller.abort(reason);
        }
        if (this.pending.size === 0) this.markClosed();
        else this.armDrainTimeout();
        return this.settled;
    }

    public get settled(): Promise<void> {
        if (this.stateValue === "closed") return Promise.resolve();
        if (!this.settlePromise) {
            this.settlePromise = new Promise(resolve => { this.resolveSettled = resolve; });
        }
        return this.settlePromise;
    }

    public get stats(): Readonly<LifecycleScopeStats> {
        return {
            label: this.label,
            generation: this.generation,
            state: this.stateValue,
            pendingTasks: this.pending.size,
            startedTasks: this.startedTasks,
            completedTasks: this.completedTasks,
            failedTasks: this.failedTasks,
            cancelledTasks: this.cancelledTasks,
            detachedTasks: this.detachedTasks,
            rejectedPublications: this.rejectedPublications,
            drainTimedOut: this.drainTimedOut,
            ageMs: Math.max(0, this.now() - this.startedAt)
        };
    }

    private finish(task: Promise<unknown>): void {
        this.pending.delete(task);
        if (this.stateValue === "closing" && this.pending.size === 0) this.markClosed();
    }

    private markClosed(): void {
        if (this.drainTimer !== undefined) {
            clearTimeout(this.drainTimer);
            this.drainTimer = undefined;
        }
        this.stateValue = "closed";
        this.resolveSettled?.();
        this.resolveSettled = undefined;
    }

    private armDrainTimeout(): void {
        if (this.drainTimeoutMs === undefined || this.drainTimer !== undefined) return;
        this.drainTimer = setTimeout(() => {
            this.drainTimer = undefined;
            if (this.stateValue !== "closing" || this.pending.size === 0) return;
            const detached = this.pending.size;
            this.pending.clear();
            this.detachedTasks += detached;
            this.drainTimedOut = true;
            this.captureError(new LifecycleDrainTimeoutError(this.label, this.drainTimeoutMs!, detached));
            this.markClosed();
        }, this.drainTimeoutMs);
    }

    private captureError(reason: unknown): void {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        try { this.reportError?.(error); } catch { /* observers do not own the scope */ }
    }
}

export interface WebGlGpuTimerOptions {
    maxPendingQueries?: number;
    now?: () => number;
}

export interface WebGlGpuTimerStats {
    readonly supported: boolean;
    readonly active: boolean;
    readonly pendingQueries: number;
    readonly maxPendingQueries: number;
    readonly saturated: boolean;
    readonly saturatedFrames: number;
    readonly completedSamples: number;
    readonly disjointSamples: number;
    readonly droppedSamples: number;
    readonly lastGpuMs: number | undefined;
    readonly lastSampleAgeMs: number | undefined;
}

interface DisjointTimerExtension {
    readonly TIME_ELAPSED_EXT: number;
    readonly GPU_DISJOINT_EXT: number;
}

// Non-blocking EXT_disjoint_timer_query_webgl2 wrapper. Results are polled on
// later frames; it never waits on the GPU or calls finish(), so measurement
// itself cannot introduce the stall it is trying to observe.
export class WebGlGpuTimer {
    private extension: DisjointTimerExtension | undefined;
    private activeQuery: WebGLQuery | undefined;
    private readonly pending: WebGLQuery[] = [];
    private readonly maxPendingQueries: number;
    private readonly now: () => number;
    private disposed = false;
    private completedSamples = 0;
    private disjointSamples = 0;
    private droppedSamples = 0;
    private saturatedFrames = 0;
    private lastGpuMs: number | undefined;
    private lastSampleAt: number | undefined;

    constructor(private readonly gl: WebGL2RenderingContext, options: WebGlGpuTimerOptions = {}) {
        this.maxPendingQueries = options.maxPendingQueries ?? 4;
        this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
        if (!Number.isInteger(this.maxPendingQueries) || this.maxPendingQueries <= 0) {
            throw new RangeError("maxPendingQueries must be a positive integer");
        }
        this.refreshExtension();
    }

    public get supported(): boolean {
        return !this.disposed && this.extension !== undefined && typeof this.gl.createQuery === "function";
    }

    public begin(): boolean {
        if (!this.supported || this.activeQuery || this.gl.isContextLost()) return false;
        if (this.pending.length >= this.maxPendingQueries) {
            this.droppedSamples += 1;
            this.saturatedFrames += 1;
            return false;
        }
        const query = this.gl.createQuery();
        if (!query) {
            this.droppedSamples += 1;
            return false;
        }
        try {
            this.gl.beginQuery(this.extension!.TIME_ELAPSED_EXT, query);
            this.activeQuery = query;
            return true;
        } catch {
            this.deleteQuery(query);
            this.droppedSamples += 1;
            return false;
        }
    }

    public end(): void {
        const query = this.activeQuery;
        if (!query) return;
        this.activeQuery = undefined;
        try {
            this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
            this.pending.push(query);
        } catch {
            this.deleteQuery(query);
            this.droppedSamples += 1;
        }
    }

    // Returns the newest newly-available measurement, or undefined when the
    // GPU has not completed a query yet. Disjoint results are discarded.
    public poll(): number | undefined {
        if (!this.supported) return undefined;
        if (this.gl.isContextLost()) {
            this.clearQueries(true);
            this.extension = undefined;
            this.resetLastSample();
            return undefined;
        }
        if (this.pending.length === 0) return undefined;
        let disjoint = false;
        try {
            disjoint = Boolean(this.gl.getParameter(this.extension!.GPU_DISJOINT_EXT));
        } catch {
            this.clearQueries(true);
            return undefined;
        }
        if (disjoint) {
            this.disjointSamples += this.pending.length;
            for (const query of this.pending.splice(0)) this.deleteQuery(query);
            return undefined;
        }
        let latest: number | undefined;
        while (this.pending.length > 0) {
            const query = this.pending[0];
            let available = false;
            try {
                available = Boolean(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE));
            } catch {
                this.pending.shift();
                this.deleteQuery(query);
                this.droppedSamples += 1;
                continue;
            }
            if (!available) break;
            this.pending.shift();
            let elapsedNs: number;
            try {
                elapsedNs = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
            } catch {
                this.deleteQuery(query);
                this.droppedSamples += 1;
                continue;
            }
            this.deleteQuery(query);
            if (!Number.isFinite(elapsedNs) || elapsedNs < 0) {
                this.droppedSamples += 1;
                continue;
            }
            latest = elapsedNs / 1_000_000;
            this.lastGpuMs = latest;
            this.lastSampleAt = this.now();
            this.completedSamples += 1;
        }
        return latest;
    }

    public handleContextRestored(): void {
        if (this.disposed) return;
        this.clearQueries();
        this.resetLastSample();
        this.refreshExtension();
    }

    public handleContextLost(): void {
        if (this.disposed) return;
        this.clearQueries(true);
        this.extension = undefined;
        this.resetLastSample();
    }

    public get stats(): Readonly<WebGlGpuTimerStats> {
        return {
            supported: this.supported,
            active: this.activeQuery !== undefined,
            pendingQueries: this.pending.length,
            maxPendingQueries: this.maxPendingQueries,
            saturated: this.pending.length >= this.maxPendingQueries,
            saturatedFrames: this.saturatedFrames,
            completedSamples: this.completedSamples,
            disjointSamples: this.disjointSamples,
            droppedSamples: this.droppedSamples,
            lastGpuMs: this.lastGpuMs,
            lastSampleAgeMs: this.lastSampleAt === undefined
                ? undefined
                : Math.max(0, this.now() - this.lastSampleAt)
        };
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearQueries();
        this.extension = undefined;
    }

    private refreshExtension(): void {
        this.extension = this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as DisjointTimerExtension | null
            ?? undefined;
    }

    private clearQueries(countDropped = false): void {
        const discarded = this.pending.length + (this.activeQuery ? 1 : 0);
        if (this.activeQuery) {
            this.deleteQuery(this.activeQuery);
            this.activeQuery = undefined;
        }
        for (const query of this.pending.splice(0)) this.deleteQuery(query);
        if (countDropped) this.droppedSamples += discarded;
    }

    private deleteQuery(query: WebGLQuery): void {
        try { this.gl.deleteQuery(query); } catch { /* context may be lost */ }
    }

    private resetLastSample(): void {
        this.lastGpuMs = undefined;
        this.lastSampleAt = undefined;
    }
}

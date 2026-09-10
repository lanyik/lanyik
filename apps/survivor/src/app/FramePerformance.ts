import type { HexMapFrameEndEvent } from "three-hex-map";

class WindowMetric {
    private readonly values = new Float64Array(512);
    private count = 0;
    private sum = 0;
    public add(value: number | undefined): void {
        if (value === undefined || !Number.isFinite(value) || value < 0) return;
        this.values[this.count++ % this.values.length] = value; this.sum += value;
    }
    public take(): { mean: number; p95: number; count: number } | undefined {
        if (!this.count) return undefined;
        const sorted = this.values.slice(0, Math.min(this.count, this.values.length)).sort();
        const result = { mean: this.sum / this.count, p95: sorted[Math.ceil(sorted.length * .95) - 1], count: this.count };
        this.count = this.sum = 0; return result;
    }
}

export interface FramePerformanceSnapshot {
    readonly fps: number | undefined;
    readonly frameP95Ms: number | undefined;
    readonly mainMs: number | undefined;
    readonly mainP95Ms: number | undefined;
    readonly presentationMs: number | undefined;
    readonly mountMs: number | undefined;
    readonly gpuMs: number | undefined;
    readonly gpuSupported: boolean;
    readonly gpuSampleAgeMs: number | undefined;
    readonly messageMs: number | undefined;
    readonly messages: number;
    readonly longFrames: number | undefined;
    readonly longFrameMaxMs: number | undefined;
    readonly blockingMaxMs: number | undefined;
    readonly layoutMaxMs: number | undefined;
}

export interface RuntimePerformanceSnapshot extends FramePerformanceSnapshot {
    readonly windowMs: number;
    readonly snapshotAgeMs: number;
    readonly inputLatencyMs: number | undefined;
    readonly running: boolean;
    readonly pendingSteps: number;
    readonly droppedSteps: number;
    readonly clockClampedMs: number;
    readonly pendingRequests: number;
    readonly executeMs: number | undefined;
    readonly queryWaitMs: number | undefined;
    readonly roundTripMs: number | undefined;
    readonly transportMs: number | undefined;
    readonly deferredPending: number;
    readonly deferredDiscarded: number;
}

/** One sampling window; no per-frame snapshots or unbounded performance history. */
export class FramePerformance {
    private readonly interval = new WindowMetric();
    private readonly main = new WindowMetric();
    private readonly presentation = new WindowMetric();
    private readonly mounts = new WindowMetric();
    private readonly gpu = new WindowMetric();
    private readonly messages = new WindowMetric();
    private gpuSupported = false;
    private gpuAge: number | undefined;
    private longFrames = 0;
    private longMax = 0;
    private blockingMax = 0;
    private layoutMax = 0;
    public longFramesSupported = false;
    public frame(frame: HexMapFrameEndEvent, presentationMs: number): void {
        if (frame.dtS > 0) this.interval.add(frame.dtS * 1000);
        this.main.add(frame.cpuFrameMs); this.presentation.add(presentationMs); this.mounts.add(frame.frameTaskMs);
        this.gpuSupported = frame.gpuSupported; this.gpuAge = frame.gpuSampleAgeMs;
        // HexMap publishes only newly available GPU samples, never duplicates the last measurement.
        this.gpu.add(frame.gpuFrameMs);
    }
    public message(ms: number): void { this.messages.add(ms); }
    public longFrame(duration: number, blocking: number, layout: number): void {
        this.longFrames++; this.longMax = Math.max(this.longMax, duration);
        this.blockingMax = Math.max(this.blockingMax, blocking); this.layoutMax = Math.max(this.layoutMax, layout);
    }
    public take(): FramePerformanceSnapshot {
        const interval = this.interval.take(), main = this.main.take(), messages = this.messages.take();
        const result = Object.freeze({ fps: interval && interval.mean > 0 ? 1000 / interval.mean : undefined,
            frameP95Ms: interval?.p95, mainMs: main?.mean, mainP95Ms: main?.p95,
            presentationMs: this.presentation.take()?.mean, mountMs: this.mounts.take()?.mean,
            gpuMs: this.gpu.take()?.mean, gpuSupported: this.gpuSupported, gpuSampleAgeMs: this.gpuAge,
            messageMs: messages?.mean, messages: messages?.count ?? 0,
            longFrames: this.longFramesSupported ? this.longFrames : undefined,
            longFrameMaxMs: this.longFramesSupported ? this.longMax : undefined,
            blockingMaxMs: this.longFramesSupported ? this.blockingMax : undefined,
            layoutMaxMs: this.longFramesSupported ? this.layoutMax : undefined });
        this.longFrames = this.longMax = this.blockingMax = this.layoutMax = 0;
        return result;
    }
}

/** Measures changed movement samples until a result using them is actually drawn. */
export class InputFeedback {
    private sequence = 0;
    private presented = 0;
    private sample: { id: number; at: number } | undefined;
    private accepted: { id: number; at: number } | undefined;
    public latencyMs: number | undefined;
    public change(now: number): void { this.sample = { id: ++this.sequence, at: now }; }
    public sent() { return this.sample; }
    public accept(sample: ReturnType<InputFeedback["sent"]>): void { if (sample) this.accepted = sample; }
    public draw(now: number): void {
        if (this.accepted && this.accepted.id > this.presented) {
            this.latencyMs = Math.max(0, now - this.accepted.at); this.presented = this.accepted.id;
        }
    }
    public reset(): void {
        this.presented = this.sequence;
        this.sample = this.accepted = undefined; this.latencyMs = undefined;
    }
}

/** Measures display cadence and estimates throughput from measured CPU/GPU work. */
export class FramePerformanceSampler {
    constructor(intervalMs = 500) {
        this.intervalMs = intervalMs;
        this.reset();
    }

    reset() {
        this.start = undefined;
        this.frames = 0;
        this.cpuTotal = this.gpuTotal = 0;
        this.cpuSamples = this.gpuSamples = 0;
    }

    sample({ t, cpuFrameMs, gpuFrameMs }) {
        if (!Number.isFinite(t)) return null;
        if (this.start === undefined || t <= this.start) {
            this.reset();
            this.start = t;
            return null;
        }
        this.frames += 1;
        if (Number.isFinite(cpuFrameMs) && cpuFrameMs >= 0) {
            this.cpuTotal += cpuFrameMs;
            this.cpuSamples += 1;
        }
        if (Number.isFinite(gpuFrameMs) && gpuFrameMs >= 0) {
            this.gpuTotal += gpuFrameMs;
            this.gpuSamples += 1;
        }
        const elapsed = t - this.start;
        if (elapsed < this.intervalMs) return null;
        const meanCpuMs = this.cpuSamples ? this.cpuTotal / this.cpuSamples : null;
        const meanGpuMs = this.gpuSamples ? this.gpuTotal / this.gpuSamples : null;
        // CPU submission and GPU execution overlap across frames. Their slower
        // average estimates throughput; adding them would measure a different quantity.
        const workFrameMs = meanCpuMs === null && meanGpuMs === null
            ? null : Math.max(meanCpuMs ?? 0, meanGpuMs ?? 0);
        const sample = {
            fps: this.frames * 1000 / elapsed,
            frameTime: elapsed / this.frames,
            cpuFrameMs: meanCpuMs,
            gpuFrameMs: meanGpuMs,
            workFrameMs,
            theoreticalFps: workFrameMs > 0 ? 1000 / workFrameMs : null,
            timingBasis: meanCpuMs !== null && meanGpuMs !== null ? "cpuGpu"
                : meanCpuMs !== null ? "cpu" : meanGpuMs !== null ? "gpu" : null
        };
        this.reset();
        this.start = t;
        return sample;
    }
}

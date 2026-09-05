import { describe, expect, it } from "vitest";
import { FramePerformanceSampler } from "../../public/frame-performance.js";

describe("demo frame performance", () => {
    it("measures irregular frame cadence independently of CPU and GPU work", () => {
        const sampler = new FramePerformanceSampler(100);
        expect(sampler.sample({ t: 1000 })).toBeNull();
        for (const t of [1010, 1020, 1090]) {
            expect(sampler.sample({ t, cpuFrameMs: 0.1, gpuFrameMs: 0.2 })).toBeNull();
        }
        expect(sampler.sample({ t: 1100, cpuFrameMs: 0.1, gpuFrameMs: 0.2 })).toEqual({
            fps: 40, frameTime: 25, cpuFrameMs: 0.1, gpuFrameMs: 0.2,
            workFrameMs: 0.2, theoreticalFps: 5000, timingBasis: "cpuGpu"
        });
        expect(sampler.sample({ t: 1200, cpuFrameMs: 0 })).toEqual({
            fps: 10, frameTime: 100, cpuFrameMs: 0, gpuFrameMs: null,
            workFrameMs: 0, theoreticalFps: null, timingBasis: "cpu"
        });
    });

    it("excludes time spent suspended and starts a fresh window on resume", () => {
        const sampler = new FramePerformanceSampler(100);
        sampler.sample({ t: 0, cpuFrameMs: 1 });
        sampler.sample({ t: 50, cpuFrameMs: 1 });
        sampler.reset();
        expect(sampler.sample({ t: 60000 })).toBeNull();
        expect(sampler.sample({ t: 60100 })).toEqual({
            fps: 10, frameTime: 100, cpuFrameMs: null, gpuFrameMs: null,
            workFrameMs: null, theoreticalFps: null, timingBasis: null
        });
    });

    it("estimates throughput from average work without a display-frequency cap", () => {
        const sampler = new FramePerformanceSampler(100);
        sampler.sample({ t: 0 });
        sampler.sample({ t: 50, cpuFrameMs: 1, gpuFrameMs: 2 });
        const sample = sampler.sample({ t: 100, cpuFrameMs: 3, gpuFrameMs: 6 });
        expect(sample).toMatchObject({
            fps: 20, cpuFrameMs: 2, gpuFrameMs: 4,
            workFrameMs: 4, theoreticalFps: 250, timingBasis: "cpuGpu"
        });
        // An unavailable/disjoint GPU query must not reuse the preceding window.
        expect(sampler.sample({ t: 200, cpuFrameMs: 5, gpuFrameMs: NaN })).toMatchObject({
            gpuFrameMs: null, workFrameMs: 5, theoreticalFps: 200, timingBasis: "cpu"
        });
        expect(sampler.sample({ t: 300, cpuFrameMs: -1, gpuFrameMs: 10 })).toMatchObject({
            cpuFrameMs: null, workFrameMs: 10, theoreticalFps: 100, timingBasis: "gpu"
        });
    });
});

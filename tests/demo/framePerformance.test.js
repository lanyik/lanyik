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
            fps: 40, frameTime: 25, cpuFrameMs: 0.1, gpuFrameMs: 0.2
        });
        expect(sampler.sample({ t: 1200, cpuFrameMs: 0 })).toEqual({
            fps: 10, frameTime: 100, cpuFrameMs: 0, gpuFrameMs: null
        });
    });

    it("excludes time spent suspended and starts a fresh window on resume", () => {
        const sampler = new FramePerformanceSampler(100);
        sampler.sample({ t: 0, cpuFrameMs: 1 });
        sampler.sample({ t: 50, cpuFrameMs: 1 });
        sampler.reset();
        expect(sampler.sample({ t: 60000 })).toBeNull();
        expect(sampler.sample({ t: 60100 })).toEqual({
            fps: 10, frameTime: 100, cpuFrameMs: null, gpuFrameMs: null
        });
    });
});

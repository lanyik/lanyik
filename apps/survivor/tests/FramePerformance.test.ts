import { expect, test } from "vitest";
import { FramePerformance, InputFeedback } from "../src/app/FramePerformance";

test("frame windows separate main, presentation, messages, GPU availability and browser long frames", () => {
    const perf = new FramePerformance(); perf.longFramesSupported = true;
    for (let i = 0; i < 100; i++) perf.frame({ t: i * 20, dtS: .02, drawCalls: 64, triangles: 120000, cpuFrameMs: i < 94 ? 2 : 8,
        frameTaskMs: 1, gpuFrameMs: i % 2 === 0 ? 4 : undefined, gpuSupported: true, gpuSampleAgeMs: 20 }, .5);
    perf.message(3); perf.message(5); perf.longFrame(60, 10, 4);
    perf.simulation({ steps: 2, simulationMs: 10, queryWaitMs: 2, simulationYieldMs: 1 });
    perf.simulation({ steps: 6, simulationMs: 30, queryWaitMs: 6, simulationYieldMs: 3 });
    perf.simulation({ steps: 0, simulationMs: 900, queryWaitMs: 0, simulationYieldMs: 900 });
    expect(perf.take()).toMatchObject({ fps: 50, frameP95Ms: 20, mainP95Ms: 8, presentationMs: .5,
        mountMs: 1, gpuMs: 4, messageMs: 4, messages: 2, longFrames: 1, blockingMaxMs: 10, layoutMaxMs: 4,
        drawCalls: 64, drawCallsP95: 64, triangles: 120000,
        theoreticalFps: 250, logicalHz: 8, theoreticalLogicHz: 200, logicStepMs: 5, logicExecuteMs: 3.5, logicBudgetPercent: 60 });
    expect(perf.take()).toMatchObject({ fps: undefined, gpuMs: undefined, messageMs: undefined, longFrames: 0, logicalHz: 0, theoreticalLogicHz: undefined });
    expect(new FramePerformance().take()).toMatchObject({ gpuMs: undefined, longFrames: undefined, drawCalls: undefined, triangles: undefined });
});

test("input feedback includes request backlog and waits for drawing; reset excludes stale acknowledgments", () => {
    const feedback = new InputFeedback();
    feedback.change(20); const first = feedback.sent();
    feedback.accept(first); expect(feedback.latencyMs).toBeUndefined();
    feedback.draw(120); expect(feedback.latencyMs).toBe(100);
    feedback.draw(200); expect(feedback.latencyMs).toBe(100);
    feedback.change(220); const old = feedback.sent(); feedback.reset();
    feedback.accept(old); feedback.draw(300); expect(feedback.latencyMs).toBeUndefined();
    feedback.change(320); feedback.accept(feedback.sent()); feedback.draw(360);
    expect(feedback.latencyMs).toBe(40);
});

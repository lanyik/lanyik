import { describe, expect, test, vi } from "vitest";

import { WebGlGpuTimer } from "../../src/rendering/WebGlGpuTimer";

function fakeContext() {
    let queryId = 0;
    let available = false;
    let disjoint = false;
    const gl = {
        QUERY_RESULT_AVAILABLE: 1,
        QUERY_RESULT: 2,
        getExtension: vi.fn(() => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 })),
        createQuery: vi.fn(() => ({ id: ++queryId }) as unknown as WebGLQuery),
        beginQuery: vi.fn(),
        endQuery: vi.fn(),
        deleteQuery: vi.fn(),
        isContextLost: vi.fn(() => false),
        getQueryParameter: vi.fn((_query: WebGLQuery, key: number) => key === 1 ? available : 8_500_000),
        getParameter: vi.fn(() => disjoint)
    };
    return {
        gl: gl as unknown as WebGL2RenderingContext,
        complete(value = true) { available = value; },
        setDisjoint(value: boolean) { disjoint = value; }
    };
}

describe("WebGlGpuTimer", () => {
    test("polls a later frame without synchronously waiting for the query", () => {
        const fake = fakeContext();
        let now = 10;
        const timer = new WebGlGpuTimer(fake.gl, { now: () => now });
        expect(timer.begin()).toBe(true);
        timer.end();
        expect(timer.poll()).toBeUndefined();
        fake.complete();
        expect(timer.poll()).toBe(8.5);
        expect(timer.stats).toMatchObject({
            completedSamples: 1,
            pendingQueries: 0,
            lastGpuMs: 8.5,
            lastSampleAgeMs: 0
        });
        now = 35;
        expect(timer.stats.lastSampleAgeMs).toBe(25);
    });

    test("discards disjoint samples and bounds outstanding queries", () => {
        const fake = fakeContext();
        const timer = new WebGlGpuTimer(fake.gl, { maxPendingQueries: 1 });
        timer.begin();
        timer.end();
        expect(timer.begin()).toBe(false);
        fake.complete();
        fake.setDisjoint(true);
        expect(timer.poll()).toBeUndefined();
        expect(timer.stats).toMatchObject({
            disjointSamples: 1,
            droppedSamples: 1,
            saturatedFrames: 1,
            saturated: false
        });
        timer.dispose();
        expect(timer.supported).toBe(false);
    });

    test("invalidates stale samples when the WebGL context is restored", () => {
        const fake = fakeContext();
        const timer = new WebGlGpuTimer(fake.gl);
        timer.begin();
        timer.end();
        fake.complete();
        expect(timer.poll()).toBe(8.5);
        expect(timer.stats.lastGpuMs).toBe(8.5);

        timer.handleContextRestored();
        expect(timer.stats).toMatchObject({ lastGpuMs: undefined, lastSampleAgeMs: undefined });
    });

    test("drops context-bound queries immediately when the context is lost", () => {
        const fake = fakeContext();
        const timer = new WebGlGpuTimer(fake.gl);
        timer.begin();
        timer.end();
        expect(timer.stats.pendingQueries).toBe(1);
        timer.handleContextLost();
        expect(timer.stats).toMatchObject({ supported: false, active: false, pendingQueries: 0, droppedSamples: 1 });
        timer.handleContextRestored();
        expect(timer.stats.supported).toBe(true);
    });
});

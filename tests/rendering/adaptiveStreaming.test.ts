import { describe, expect, test, vi } from "vitest";

import { AdaptiveStreamingController, HexMap } from "../../src/index";
import {
    AdaptiveStreamingControllerOptions,
    AdaptiveStreamingProfile
} from "../../src/rendering/AdaptiveStreamingController";
import { FrameTaskScheduler } from "../../src/rendering/FrameTaskScheduler";

function controller(overrides: Partial<AdaptiveStreamingControllerOptions> = {}) {
    return new AdaptiveStreamingController({
        targetFrameMs: 16,
        baseFrameBudgetMs: 4,
        baseMaxTasksPerFrame: 4,
        baseWorkerCount: 4,
        baseLodDistances: { near: 100, far: 200, vegetation: 160, hysteresis: 20 },
        degradeFrames: 2,
        recoverFrames: 3,
        cooldownFrames: 0,
        emaAlpha: 1,
        ...overrides
    });
}

describe("adaptive streaming controller", () => {
    test("queues resident vegetation migrations across frame tasks", () => {
        const rebuild = vi.fn((_key: string) => Promise.resolve());
        const frameTasks = new FrameTaskScheduler({ budgetMs: 10, maxTasksPerFrame: 1 });
        const map = Object.create(HexMap.prototype) as {
            disposed: boolean;
            adaptiveResolutionScale: number;
            appliedVegetationDensityScale: number;
            adaptiveVegetationRevision: number;
            options: { grassEnabled: boolean; grassDensity: number; treesPerTile: number };
            frameTasks: FrameTaskScheduler;
            chunkScheduler: { configure: ReturnType<typeof vi.fn>; invalidateScene: ReturnType<typeof vi.fn> };
            worldController: {
                source: { chunkDistance(x: number, y: number, cx: number, cy: number): number; configureWorkerCount(count: number): number };
                streamer: { stats: { centerChunkX: number; centerChunkY: number } };
                lifecycle: { run<T>(operation: () => PromiseLike<T> | T): Promise<T> };
            };
            worldChunkLayers: Map<string, {
                chunk: { chunkX: number; chunkY: number };
                requestedVegetationScale?: number;
                requestedVegetationSignature?: string;
                grassVegetationSignature?: string;
                forestVegetationSignature?: string;
            }>;
            rebuildAdaptiveWorldVegetation: typeof rebuild;
            handleResize: ReturnType<typeof vi.fn>;
            applyAdaptiveStreamingProfile(profile: Readonly<AdaptiveStreamingProfile>): void;
        };
        map.disposed = false;
        map.adaptiveResolutionScale = 1;
        map.appliedVegetationDensityScale = 1;
        map.adaptiveVegetationRevision = 0;
        map.options = { grassEnabled: true, grassDensity: 10, treesPerTile: 4 };
        map.frameTasks = frameTasks;
        map.chunkScheduler = { configure: vi.fn(), invalidateScene: vi.fn() };
        map.worldController = {
            source: {
                chunkDistance: (x, y, cx, cy) => Math.hypot(x - cx, y - cy),
                configureWorkerCount: count => count
            },
            streamer: { stats: { centerChunkX: 0, centerChunkY: 0 } },
            lifecycle: { run: operation => Promise.resolve(operation()) }
        };
        map.worldChunkLayers = new Map([
            ["0,0", { chunk: { chunkX: 0, chunkY: 0 }, grassVegetationSignature: "10:4", forestVegetationSignature: "10:4" }],
            ["2,0", { chunk: { chunkX: 2, chunkY: 0 }, grassVegetationSignature: "10:4", forestVegetationSignature: "10:4" }]
        ]);
        map.rebuildAdaptiveWorldVegetation = rebuild;
        map.handleResize = vi.fn();
        const profile: AdaptiveStreamingProfile = {
            qualityLevel: 2,
            mainThreadLevel: 0,
            gpuLevel: 2,
            workerLevel: 0,
            frameBudgetMs: 4,
            maxTasksPerFrame: 1,
            workerCount: 4,
            resolutionScale: 0.7,
            vegetationDensityScale: 0.5,
            lodDistanceScale: 0.8,
            lodBias: 0,
            vegetationLodBias: 1,
            lodDistances: { near: 80, far: 160, vegetation: 128, hysteresis: 16 }
        };

        map.applyAdaptiveStreamingProfile(profile);
        expect(map.handleResize).toHaveBeenCalledOnce();
        expect(frameTasks.stats.pendingTasks).toBe(2);
        expect(rebuild).not.toHaveBeenCalled();
        frameTasks.runFrame();
        expect(rebuild).toHaveBeenCalledOnce();
        expect(rebuild.mock.calls[0][0]).toBe("0,0");
        expect(frameTasks.stats.pendingTasks).toBe(1);
    });

    test("degrades quickly under sustained load and recovers conservatively", () => {
        const adaptive = controller();
        expect(adaptive.sample(20)).toBeUndefined();
        const degraded = adaptive.sample(20)!;
        expect(degraded).toMatchObject({
            qualityLevel: 1,
            frameBudgetMs: 3,
            maxTasksPerFrame: 3,
            workerCount: 3,
            resolutionScale: 0.85,
            vegetationDensityScale: 0.85,
            lodDistanceScale: 0.9
        });
        expect(adaptive.sample(10)).toBeUndefined();
        expect(adaptive.sample(10)).toBeUndefined();
        expect(adaptive.sample(10)?.qualityLevel).toBe(0);
        expect(adaptive.stats.transitions).toBe(2);
    });

    test("adds vegetation and global LOD bias at the strongest pressure levels", () => {
        const adaptive = controller();
        for (let level = 1; level <= 3; level += 1) {
            adaptive.sample(30);
            adaptive.sample(30);
        }
        expect(adaptive.currentProfile).toMatchObject({
            qualityLevel: 3,
            workerCount: 1,
            resolutionScale: 0.25,
            lodBias: 1,
            vegetationLodBias: 1
        });
        expect(adaptive.currentProfile.lodDistances.near).toBeCloseTo(55);
        expect(adaptive.currentProfile.lodDistances.far).toBeCloseTo(110);
        expect(adaptive.currentProfile.lodDistances.vegetation).toBeCloseTo(88);
        expect(adaptive.currentProfile.lodDistances.hysteresis).toBeCloseTo(11);
    });

    test("ignores background-tab sized samples", () => {
        const adaptive = controller();
        for (let index = 0; index < 10; index += 1) adaptive.sample(1000);
        expect(adaptive.stats.averageFrameMs).toBe(0);
        expect(adaptive.currentProfile.qualityLevel).toBe(0);
    });

    test("clamps but retains structured long-frame telemetry", () => {
        const adaptive = controller();
        const sample = { frameMs: 1000, frameTaskBacklog: 0, workerQueueDepth: 0 };
        expect(adaptive.sample(sample)).toBeUndefined();
        expect(adaptive.sample(sample)).toMatchObject({ gpuLevel: 1 });
        expect(adaptive.stats.averageFrameMs).toBe(250);
    });

    test("routes GPU pressure only to LOD and vegetation actuators", () => {
        const adaptive = controller();
        adaptive.sample({ frameMs: 20, gpuFrameMs: 20 });
        const degraded = adaptive.sample({ frameMs: 20, gpuFrameMs: 20 })!;
        expect(degraded).toMatchObject({
            mainThreadLevel: 0,
            gpuLevel: 1,
            workerLevel: 0,
            frameBudgetMs: 4,
            maxTasksPerFrame: 4,
            workerCount: 4,
            resolutionScale: 0.85,
            vegetationDensityScale: 0.85,
            lodDistanceScale: 0.9
        });
    });

    test("turns hard resource-budget overage into explicit degradation pressure", () => {
        const adaptive = controller();
        const sample = {
            frameMs: 12,
            gpuTimingSupported: true,
            cpuBudgetExceededBytes: 1024,
            gpuBudgetExceededBytes: 2048
        };
        expect(adaptive.sample(sample)).toBeUndefined();
        expect(adaptive.sample(sample)).toMatchObject({
            mainThreadLevel: 1,
            gpuLevel: 1,
            workerLevel: 0
        });
        expect(adaptive.stats).toMatchObject({
            cpuBudgetExceededBytes: 1024,
            gpuBudgetExceededBytes: 2048
        });
    });

    test("treats sustained slow frames as render pressure once observable work is idle", () => {
        const adaptive = controller();
        const sample = {
            frameMs: 24,
            frameTaskMs: 0,
            frameTaskBacklog: 0,
            oldestFrameTaskMs: 0,
            workerQueueDepth: 0,
            workerContentionMs: 0
        };
        expect(adaptive.sample(sample)).toBeUndefined();
        expect(adaptive.sample(sample)).toMatchObject({
            mainThreadLevel: 0,
            gpuLevel: 1,
            workerLevel: 0,
            vegetationDensityScale: 0.85,
            lodDistanceScale: 0.9
        });
    });

    test("does not invent GPU pressure from frame cadence when timer queries are supported", () => {
        const adaptive = controller();
        const sample = {
            frameMs: 30,
            gpuTimingSupported: true,
            frameTaskMs: 0,
            frameTaskBacklog: 0,
            oldestFrameTaskMs: 0,
            workerQueueDepth: 0,
            workerContentionMs: 0
        };
        for (let frame = 0; frame < 10; frame += 1) adaptive.sample(sample);
        expect(adaptive.currentProfile.gpuLevel).toBe(0);
        expect(adaptive.stats.gpuTimingSupported).toBe(true);
    });

    test("degrades when supported GPU timing is saturated and no fresh sample arrives", () => {
        const adaptive = controller();
        const sample = {
            frameMs: 16,
            gpuTimingSupported: true,
            gpuTimingSaturated: true,
            gpuSampleAgeMs: 100,
            frameTaskMs: 0,
            frameTaskBacklog: 0,
            oldestFrameTaskMs: 0,
            workerQueueDepth: 0,
            workerContentionMs: 0
        };
        expect(adaptive.sample(sample)).toBeUndefined();
        expect(adaptive.sample(sample)).toMatchObject({ gpuLevel: 1, mainThreadLevel: 0 });
        expect(adaptive.stats).toMatchObject({ gpuTimingSaturated: true, gpuSampleAgeMs: 100 });
    });

    test("does not treat refresh-limited 60 Hz frames as pressure at the 60 Hz target", () => {
        const adaptive = controller({ targetFrameMs: 1000 / 60 });
        const sample = {
            frameMs: 1000 / 60,
            frameTaskMs: 0,
            frameTaskBacklog: 0,
            oldestFrameTaskMs: 0,
            workerQueueDepth: 0,
            workerContentionMs: 0
        };
        for (let frame = 0; frame < 30; frame += 1) {
            expect(adaptive.sample(sample)).toBeUndefined();
        }
        expect(adaptive.currentProfile.qualityLevel).toBe(0);
    });

    test("routes frame-task backlog only to main-thread mount budgets", () => {
        const adaptive = controller();
        const sample = { frameMs: 25, frameTaskBacklog: 20, oldestFrameTaskMs: 80 };
        adaptive.sample(sample);
        const degraded = adaptive.sample(sample)!;
        expect(degraded).toMatchObject({
            mainThreadLevel: 1,
            gpuLevel: 0,
            workerLevel: 0,
            frameBudgetMs: 3,
            maxTasksPerFrame: 3,
            workerCount: 4,
            vegetationDensityScale: 1,
            lodDistanceScale: 1
        });
    });

    test("records worker saturation without treating it as contention", () => {
        const adaptive = controller();
        for (let index = 0; index < 10; index += 1) {
            expect(adaptive.sample({
                frameMs: 30,
                workerQueueDepth: 50,
                workerBusyRatio: 1
            })).toBeUndefined();
        }
        expect(adaptive.currentProfile.workerCount).toBe(4);
        expect(adaptive.stats).toMatchObject({ workerQueueDepth: 50, workerBusyRatio: 1 });
    });

    test("reduces workers only from an explicit contention signal", () => {
        const adaptive = controller();
        adaptive.sample({ frameMs: 20, workerContentionMs: 8 });
        const degraded = adaptive.sample({ frameMs: 20, workerContentionMs: 8 })!;
        expect(degraded).toMatchObject({
            mainThreadLevel: 0,
            gpuLevel: 0,
            workerLevel: 1,
            workerCount: 3,
            frameBudgetMs: 4,
            vegetationDensityScale: 1
        });
    });
});

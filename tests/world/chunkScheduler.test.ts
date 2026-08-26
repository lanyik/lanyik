import { describe, expect, test, vi } from "vitest";
import { BufferGeometry, Object3D, PerspectiveCamera, Vector3 } from "three";

import { tagWorldChunk } from "../../src/helpers/chunks";
import {
    WorldChunkScheduler,
    WorldChunkSchedulerHooks
} from "../../src/rendering/WorldChunkScheduler";
import { FrameTaskScheduler } from "../../src/rendering/FrameTaskScheduler";

describe("WorldChunkScheduler", () => {
    test("activates visible chunks and releases inactive CPU resources", () => {
        const root = new Object3D();
        const chunk = new Object3D();
        tagWorldChunk(chunk, "0,0", "land", {
            minX: -10, maxX: 10, minY: -2, maxY: 20, minZ: -10, maxZ: 10
        });
        root.add(chunk);

        const camera = new PerspectiveCamera(60, 1, 1, 2000);
        camera.position.set(0, 100, 100);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        const geometry = new BufferGeometry();
        const disposeGpu = vi.fn();
        const activate = vi.fn(() => ({ geometries: [geometry], disposeGpu }));
        const release = vi.fn();
        const scheduler = new WorldChunkScheduler({
            renderDistance: 500,
            lodEnabled: true,
            lodDistances: { near: 100, far: 300, vegetation: 250, hysteresis: 10 },
            gpuCacheSize: 0,
            cpuCacheSize: 0,
            gpuGraceFrames: 0,
            cpuGraceFrames: 0
        });
        const hooks = { enabled: () => true, activate, release };

        scheduler.update(root, camera, new Vector3(0, 0, 0), hooks);
        expect(chunk.visible).toBe(true);
        expect(activate).toHaveBeenCalledOnce();
        expect(scheduler.stats.visibleChunks).toBe(1);
        expect(scheduler.stats.sceneTraversals).toBe(1);

        scheduler.update(root, camera, new Vector3(2000, 0, 2000), hooks);
        expect(chunk.visible).toBe(false);
        expect(release).toHaveBeenCalledOnce();
        expect(disposeGpu).toHaveBeenCalledOnce();
        expect(scheduler.stats.residentChunks).toBe(0);
        expect(scheduler.stats.sceneTraversals).toBe(1);
    });

    test("rebuilds its flat registry only when scene chunk structure changes", () => {
        const root = new Object3D();
        const first = new Object3D();
        tagWorldChunk(first, "0,0", "land", {
            minX: -10, maxX: 10, minY: -2, maxY: 20, minZ: -10, maxZ: 10
        });
        root.add(first);
        const camera = new PerspectiveCamera(60, 1, 1, 2000);
        camera.position.set(0, 100, 100);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        const scheduler = new WorldChunkScheduler({
            renderDistance: 500,
            lodEnabled: true,
            lodDistances: { near: 100, far: 300, vegetation: 250, hysteresis: 10 },
            gpuCacheSize: 10,
            cpuCacheSize: 10,
            gpuGraceFrames: 10,
            cpuGraceFrames: 10
        });
        const hooks = { enabled: () => true, activate: vi.fn(), release: vi.fn() };

        for (let frame = 0; frame < 20; frame += 1) {
            scheduler.update(root, camera, new Vector3(), hooks);
        }
        expect(scheduler.stats.sceneTraversals).toBe(1);
        expect(scheduler.stats.registeredObjects).toBe(1);

        const second = first.clone();
        root.add(second);
        scheduler.invalidateScene();
        scheduler.update(root, camera, new Vector3(), hooks);
        expect(scheduler.stats.sceneTraversals).toBe(2);
        expect(scheduler.stats.registeredObjects).toBe(2);
    });

    test("applies adaptive global and vegetation LOD bias without changing chunk metadata", () => {
        const root = new Object3D();
        const grass = new Object3D();
        tagWorldChunk(grass, "0,0", "grass", {
            minX: -10, maxX: 10, minY: 0, maxY: 20, minZ: -10, maxZ: 10
        });
        root.add(grass);
        const camera = new PerspectiveCamera(60, 1, 1, 1000);
        camera.position.set(0, 100, 100);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        const activate = vi.fn<WorldChunkSchedulerHooks["activate"]>(() => ({ geometries: [] }));
        const scheduler = new WorldChunkScheduler({
            renderDistance: 500,
            lodEnabled: true,
            lodDistances: { near: 100, far: 300, vegetation: 250, hysteresis: 10 },
            lodBias: 0,
            vegetationLodBias: 1,
            gpuCacheSize: 10,
            cpuCacheSize: 10,
            gpuGraceFrames: 10,
            cpuGraceFrames: 10
        });
        const hooks = { enabled: () => true, activate, release: vi.fn() };
        scheduler.update(root, camera, new Vector3(), hooks);
        expect(activate.mock.calls[0][1]).toBe(1);
        scheduler.configure({ lodBias: 1 });
        scheduler.update(root, camera, new Vector3(), hooks);
        expect(activate.mock.calls[1][1]).toBe(2);
    });

    test("applies scale and rotation to custom chunk bounds before culling", () => {
        const options = {
            renderDistance: 500,
            lodEnabled: true,
            lodDistances: { near: 100, far: 300, vegetation: 250, hysteresis: 10 },
            gpuCacheSize: 10,
            cpuCacheSize: 10,
            gpuGraceFrames: 10,
            cpuGraceFrames: 10
        };

        const scaledRoot = new Object3D();
        const scaled = new Object3D();
        scaled.scale.set(100, 1, 100);
        tagWorldChunk(scaled, "0,0", "custom", {
            minX: 10, maxX: 20, minY: -1, maxY: 1, minZ: -1, maxZ: 1
        });
        scaledRoot.add(scaled);
        const originCamera = new PerspectiveCamera(90, 1, 1, 3000);
        originCamera.position.set(0, 100, 100);
        originCamera.lookAt(0, 0, 0);
        originCamera.updateProjectionMatrix();
        const scaledActivate = vi.fn<WorldChunkSchedulerHooks["activate"]>();
        new WorldChunkScheduler(options).update(scaledRoot, originCamera, new Vector3(), {
            enabled: () => true,
            activate: scaledActivate,
            release: vi.fn()
        });
        expect(scaled.visible).toBe(false);
        expect(scaledActivate).not.toHaveBeenCalled();

        const rotatedRoot = new Object3D();
        const rotated = new Object3D();
        rotated.rotation.y = Math.PI / 2;
        tagWorldChunk(rotated, "1,0", "custom", {
            minX: 400, maxX: 420, minY: -10, maxY: 10, minZ: -5, maxZ: 5
        });
        rotatedRoot.add(rotated);
        const rotatedTarget = new Vector3(0, 0, -410);
        const rotatedCamera = new PerspectiveCamera(60, 1, 1, 3000);
        rotatedCamera.position.set(0, 100, 100);
        rotatedCamera.lookAt(rotatedTarget);
        rotatedCamera.updateProjectionMatrix();
        const rotatedActivate = vi.fn<WorldChunkSchedulerHooks["activate"]>(() => ({ geometries: [] }));
        new WorldChunkScheduler(options).update(rotatedRoot, rotatedCamera, rotatedTarget, {
            enabled: () => true,
            activate: rotatedActivate,
            release: vi.fn()
        });
        expect(rotated.visible).toBe(true);
        expect(rotatedActivate).toHaveBeenCalledOnce();
    });
});

describe("FrameTaskScheduler", () => {
    test("coalesces repeated keyed work and runs only the newest task", () => {
        const order: string[] = [];
        const scheduler = new FrameTaskScheduler();
        scheduler.enqueue("copies", -1, () => order.push("stale"));
        scheduler.enqueue("copies", -1, () => order.push("latest"));

        expect(scheduler.stats.pendingTasks).toBe(1);
        expect(scheduler.runFrame()).toBe(1);
        expect(order).toEqual(["latest"]);
    });

    test("applies priority, cancellation and a deterministic per-frame budget", () => {
        let clock = 0;
        const order: string[] = [];
        const scheduler = new FrameTaskScheduler({
            budgetMs: 3,
            maxTasksPerFrame: 10,
            now: () => clock
        });
        const task = (name: string) => () => {
            order.push(name);
            clock += 2;
        };
        scheduler.enqueue("far", 10, task("far"));
        scheduler.enqueue("cancelled", 0, task("cancelled"));
        scheduler.enqueue("near", 1, task("near"));
        scheduler.enqueue("middle", 2, task("middle"));
        expect(scheduler.cancel("cancelled")).toBe(true);

        expect(scheduler.runFrame()).toBe(2);
        expect(order).toEqual(["near", "middle"]);
        expect(scheduler.stats.pendingTasks).toBe(1);
        expect(scheduler.stats.cancelledTasks).toBe(1);
        expect(scheduler.runFrame()).toBe(1);
        expect(order).toEqual(["near", "middle", "far"]);
    });
});

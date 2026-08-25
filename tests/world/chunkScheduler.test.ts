import { describe, expect, test, vi } from "vitest";
import { BufferGeometry, Object3D, PerspectiveCamera, Vector3 } from "three";

import { tagWorldChunk } from "../../src/helpers/chunks";
import { WorldChunkScheduler } from "../../src/rendering/WorldChunkScheduler";
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
});

describe("FrameTaskScheduler", () => {
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

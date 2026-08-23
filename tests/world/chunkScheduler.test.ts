import { describe, expect, test, vi } from "vitest";
import { BufferGeometry, Object3D, PerspectiveCamera, Vector3 } from "three";

import { tagWorldChunk } from "../../src/helpers/chunks";
import { WorldChunkScheduler } from "../../src/rendering/WorldChunkScheduler";

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
        const activate = vi.fn(() => ({ geometries: [geometry] }));
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

        scheduler.update(root, camera, new Vector3(2000, 0, 2000), hooks);
        expect(chunk.visible).toBe(false);
        expect(release).toHaveBeenCalledOnce();
        expect(scheduler.stats.residentChunks).toBe(0);
    });
});

import { describe, expect, test, vi } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import {
    ChunkResidencyCoordinator,
    getChunkResidencyCoordinator
} from "../../src/world/ChunkResidencyCoordinator";
import { StaticWorldSource, WorldChunk } from "../../src/world/WorldSource";

function world(width = 24, height = 12, wrapped = false): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height, wrapX: wrapped, wrapY: wrapped };
}

class CountingSource extends StaticWorldSource {
    public readonly loads: string[] = [];
    public readonly releases: string[] = [];
    public readonly residents = new Set<string>();

    public override async loadChunk(chunkX: number, chunkY: number): Promise<WorldChunk> {
        this.loads.push(`${chunkX},${chunkY}`);
        const chunk = await super.loadChunk(chunkX, chunkY);
        this.residents.add(`${chunkX},${chunkY}`);
        return chunk;
    }

    public override releaseChunk(chunk: WorldChunk): void {
        this.releases.push(`${chunk.chunkX},${chunk.chunkY}`);
        this.residents.delete(`${chunk.chunkX},${chunk.chunkY}`);
    }

    public override hasChunk(chunkX: number, chunkY: number): boolean {
        return this.residents.has(`${chunkX},${chunkY}`);
    }
}

describe("ChunkResidencyCoordinator", () => {
    test("deduplicates loads and releases only after every owner ends its lease", async () => {
        const source = new CountingSource(world());
        const residency = new ChunkResidencyCoordinator(source);

        const [render, pathfinder] = await Promise.all([
            residency.acquireChunk(0, 0, { owner: "render" }),
            residency.acquireChunk(0, 0, { owner: "pathfinder" })
        ]);

        expect(source.loads).toEqual(["0,0"]);
        expect(render.chunk).toBe(pathfinder.chunk);
        expect(residency.stats).toEqual({
            residentChunks: 1,
            pendingChunks: 0,
            activeLeases: 2,
            leasesByOwner: { render: 1, pathfinder: 1 }
        });

        render.release();
        render.release();
        expect(source.releases).toEqual([]);
        expect(source.hasChunk(0, 0)).toBe(true);

        pathfinder.release();
        expect(source.releases).toEqual(["0,0"]);
        expect(source.hasChunk(0, 0)).toBe(false);
    });

    test("uses canonical wrapped coordinates as the shared residency key", async () => {
        const source = new CountingSource(world(24, 12, true), { chunkSize: 12 });
        const residency = new ChunkResidencyCoordinator(source);
        const first = await residency.acquireChunk(-1, 0, { owner: "render" });
        const second = await residency.acquireChunk(1, 0, { owner: "simulation" });

        expect(first.chunk).toBe(second.chunk);
        expect(source.loads).toEqual(["1,0"]);
        first.release();
        second.release();
    });

    test("aborting one waiter does not cancel another owner of the same load", async () => {
        let complete!: () => void;
        class DeferredSource extends CountingSource {
            public override loadChunk(chunkX: number, chunkY: number): Promise<WorldChunk> {
                return new Promise(resolve => {
                    complete = () => resolve(super.loadChunk(chunkX, chunkY));
                });
            }
        }
        const source = new DeferredSource(world());
        const residency = new ChunkResidencyCoordinator(source);
        const controller = new AbortController();
        const cancelled = residency.acquireChunk(0, 0, { owner: "prefetch", signal: controller.signal });
        const required = residency.acquireChunk(0, 0, { owner: "render" });
        controller.abort();
        complete();

        await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
        const lease = await required;
        expect(source.loads).toEqual(["0,0"]);
        lease.release();
    });

    test("the source-scoped factory returns one coordinator", () => {
        const source = new CountingSource(world());
        expect(getChunkResidencyCoordinator(source)).toBe(getChunkResidencyCoordinator(source));
    });

    test("dispose rejects waiters, releases residents, and can own source disposal", async () => {
        const source = new CountingSource(world());
        const dispose = vi.spyOn(source, "dispose");
        const residency = new ChunkResidencyCoordinator(source);
        await residency.acquireChunk(0, 0, { owner: "render" });

        residency.dispose(true);
        expect(source.releases).toEqual(["0,0"]);
        expect(dispose).toHaveBeenCalledOnce();
        await expect(residency.acquireChunk(0, 0, { owner: "late" }))
            .rejects.toThrow(/disposed/);
    });
});

import { describe, expect, test } from "vitest";

import { FrameTaskScheduler } from "../../src/rendering/FrameTaskScheduler";
import { WorldChunkMountQueue } from "../../src/rendering/WorldChunkMountQueue";
import { WorldChunk } from "../../src/world/WorldSource";
import { WorldStreamer } from "../../src/world/WorldStreamer";

describe("WorldChunkMountQueue", () => {
    test("retries a resident mount that frame backpressure shed", () => {
        const chunks: WorldChunk[] = [
            { chunkX: 1, chunkY: 0, chunkSize: 1, coreTiles: [{ x: 1, y: 0 }] },
            { chunkX: 0, chunkY: 0, chunkSize: 1, coreTiles: [{ x: 0, y: 0 }] }
        ];
        const mounted = new Set<string>();
        const frameTasks = new FrameTaskScheduler({ maxPendingTasks: 1, maxTasksPerFrame: 1 });
        const streamer = {
            residentChunks: chunks,
            hasResident: (x: number, y: number) => chunks.some(chunk => chunk.chunkX === x && chunk.chunkY === y)
        } as unknown as WorldStreamer;
        const mounts = new WorldChunkMountQueue({
            frameTasks,
            streamer: () => streamer,
            demandKey: () => undefined,
            signal: () => undefined,
            mounted: key => mounted.has(key),
            priority: chunk => chunk.chunkX,
            mount: chunk => { mounted.add(WorldStreamer.key(chunk.chunkX, chunk.chunkY)); }
        });

        mounts.schedule(chunks[0]);
        mounts.schedule(chunks[1]);
        expect(mounts.stats.deferredChunks).toBe(1);
        frameTasks.runFrame();
        expect(mounted).toEqual(new Set(["0,0"]));

        mounts.retryOne();
        frameTasks.runFrame();
        expect(mounted).toEqual(new Set(["0,0", "1,0"]));
        expect(mounts.stats.deferredChunks).toBe(0);
    });

    test("retries the most important resident chunk first", () => {
        const chunks: WorldChunk[] = [
            { chunkX: 5, chunkY: 0, chunkSize: 1, coreTiles: [{ x: 5, y: 0 }] },
            { chunkX: 1, chunkY: 0, chunkSize: 1, coreTiles: [{ x: 1, y: 0 }] },
            { chunkX: 0, chunkY: 0, chunkSize: 1, coreTiles: [{ x: 0, y: 0 }] }
        ];
        const mounted: string[] = [];
        const frameTasks = new FrameTaskScheduler({ maxPendingTasks: 1, maxTasksPerFrame: 1 });
        const streamer = {
            residentChunks: chunks,
            hasResident: (x: number, y: number) => chunks.some(chunk => chunk.chunkX === x && chunk.chunkY === y)
        } as unknown as WorldStreamer;
        const mounts = new WorldChunkMountQueue({
            frameTasks,
            streamer: () => streamer,
            demandKey: () => undefined,
            signal: () => undefined,
            mounted: key => mounted.includes(key),
            priority: chunk => chunk.chunkX,
            mount: chunk => { mounted.push(WorldStreamer.key(chunk.chunkX, chunk.chunkY)); }
        });

        mounts.schedule(chunks[0]);
        mounts.schedule(chunks[1]);
        mounts.schedule(chunks[2]);
        frameTasks.runFrame();
        expect(mounted).toEqual(["0,0"]);

        mounts.retryOne();
        frameTasks.runFrame();
        expect(mounted).toEqual(["0,0", "1,0"]);
    });
});

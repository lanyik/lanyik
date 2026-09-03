import { describe, expect, test } from "vitest";

import { PriorityTaskQueue } from "../../src/runtime/PriorityTaskQueue";
import { ResourceBudgetLedger } from "../../src/runtime/ResourceBudget";
import { generateWorldChunk, PackedWorldChunk } from "../../src/world/generateWorldChunk";

function checksum(chunks: readonly PackedWorldChunk[]): string {
    let hash = 0x811c9dc5;
    const ordered = [...chunks].sort((a, b) => a.chunkX - b.chunkX || a.chunkY - b.chunkY);
    for (const chunk of ordered) {
        for (const value of [chunk.chunkX, chunk.chunkY, ...chunk.tiles]) {
            hash ^= value & 0xff;
            hash = Math.imul(hash, 0x01000193) >>> 0;
            hash ^= value >>> 8 & 0xff;
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
    }
    return hash.toString(16).padStart(8, "0");
}

describe("foundation acceptance invariants", () => {
    test("same world input produces the same checksum independent of request order", () => {
        const coordinates = [
            { x: -1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: -3 },
            { x: 4, y: 2 }, { x: -5, y: -2 }
        ];
        const generate = (seed: string, points = coordinates) => points.map(point => generateWorldChunk({
            seed, chunkX: point.x, chunkY: point.y, chunkSize: 24
        }));
        const forward = checksum(generate("foundation-checksum"));
        const reverse = checksum(generate("foundation-checksum", [...coordinates].reverse()));
        expect(reverse).toBe(forward);
        expect(checksum(generate("different-seed"))).not.toBe(forward);
        expect(forward).toMatch(/^[0-9a-f]{8}$/);
        // Generator v9: surface, regional placement and curve-sampled water identities are frozen.
        expect(forward).toBe("04ddbbdd");
    });

    test("admitted resources and queued work stay inside hard limits under random churn", () => {
        const resources = new ResourceBudgetLedger({ cpuBytes: 4096, gpuBytes: 2048 });
        const queue = new PriorityTaskQueue<number>({ maxPendingTasks: 32, maxPendingWeight: 64 });
        let seed = 0x12345678;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed;
        };
        for (let step = 0; step < 5_000; step += 1) {
            const id = random() % 100;
            if ((random() & 3) === 0) resources.release(`r${id}`);
            else resources.reserve(`r${id}`, { cpuBytes: random() % 256, gpuBytes: random() % 128 });
            queue.enqueue(step, {
                lane: (step % 5 === 0 ? "background" : "visible"),
                weight: random() % 4 + 1
            });
            if ((random() & 1) === 0) queue.take();
            expect(resources.stats.cpuExceededBytes).toBe(0);
            expect(resources.stats.gpuExceededBytes).toBe(0);
            expect(queue.stats.pendingTasks).toBeLessThanOrEqual(32);
            expect(queue.stats.pendingWeight).toBeLessThanOrEqual(64);
        }
    });

});

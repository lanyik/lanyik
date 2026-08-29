import { describe, expect, test } from "vitest";

import {
    assertCompiledSurfaceChunk,
    compiledSurfaceChunkResidentBytes,
    compiledSurfaceChunkTransferables,
    createCompiledSurfaceChunk
} from "../../src/world/CompiledSurfaceChunk";
import { compileSurfaceChunk } from "../../src/world/compileSurfaceChunk";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function compileDry(vegetationDensity = 0) {
    return compileSurfaceChunk(createSurfaceCompilerTestWindow({
        seaLevel: 0,
        macroHeight: () => 20_000,
        vegetationDensity: () => vegetationDensity,
        vegetationProfile: () => 2
    }));
}

describe("CompiledSurfaceChunk", () => {
    test("assembles and validates the complete deterministic surface artifact", () => {
        const first = compileDry(96);
        const second = compileDry(96);

        expect(first.key).toEqual({ chunkX: 0, chunkY: 0 });
        expect(first.waterGeometry.kind).toBe("none");
        expect(first.vegetationSeeds.count).toBeGreaterThan(0);
        expect(first.field.groundHeight).toEqual(second.field.groundHeight);
        expect(first.vegetationSeeds.positions).toEqual(second.vegetationSeeds.positions);
        expect(first.vegetationSeeds.placementSeed).toEqual(second.vegetationSeeds.placementSeed);
        expect(compiledSurfaceChunkResidentBytes(first)).toBeGreaterThan(first.field.groundHeight.byteLength);
        assertCompiledSurfaceChunk(first);
    });

    test("uses exactly 14 or 17 distinct owned result buffers", () => {
        const dry = compileDry();
        const coast = compileSurfaceChunk(createSurfaceCompilerTestWindow({
            seaLevel: 35_000,
            macroHeight: (_tileX, tileY) => Math.max(0, Math.min(0xffff, 20_000 + tileY * 2_000))
        }));
        expect(compiledSurfaceChunkTransferables(dry)).toHaveLength(14);
        expect(coast.waterGeometry.kind).toBe("coverage");
        expect(compiledSurfaceChunkTransferables(coast)).toHaveLength(17);
    });

    test("republishes a transferred chunk without retaining detached aliases", () => {
        const chunk = compileDry(128);
        const transfer = compiledSurfaceChunkTransferables(chunk);
        const clone = structuredClone(chunk, { transfer: [...transfer] }) as typeof chunk;

        expect(chunk.field.groundHeight.byteLength).toBe(0);
        expect(chunk.vegetationSeeds.positions.byteLength).toBe(0);
        const published = createCompiledSurfaceChunk(clone);
        expect(published.vegetationSeeds.count).toBe(clone.vegetationSeeds.count);
        assertCompiledSurfaceChunk(published);
    });

    test("rejects geometry, bounds, palette and root corruption", () => {
        const coast = compileSurfaceChunk(createSurfaceCompilerTestWindow({
            seaLevel: 35_000,
            macroHeight: (_tileX, tileY) => Math.max(0, Math.min(0xffff, 20_000 + tileY * 2_000))
        }));
        expect(() => assertCompiledSurfaceChunk({
            ...coast,
            waterGeometry: { formatVersion: 1, kind: "none" }
        })).toThrow(/geometry does not match/);
        expect(() => assertCompiledSurfaceChunk({
            ...coast,
            bounds: { ...coast.bounds, maximumVisualHeight: coast.bounds.maximumVisualHeight + 1 }
        })).toThrow(/visual height/);
        expect(() => assertCompiledSurfaceChunk({
            ...coast,
            waterBodies: { ...coast.waterBodies, entries: [] }
        })).toThrow(/palette disagree/);

        const forest = compileDry(255);
        const positions = forest.vegetationSeeds.positions.slice();
        positions[1] += 1;
        expect(() => assertCompiledSurfaceChunk({
            ...forest,
            vegetationSeeds: { ...forest.vegetationSeeds, positions }
        })).toThrow(/root height/);
    });

    test("rejects component buffers that alias across ownership boundaries", () => {
        const chunk = compileDry();
        const shared = chunk.field.waterCoverage.buffer;
        const vegetationSeeds = {
            ...chunk.vegetationSeeds,
            profileIndex: new Uint8Array(shared, 0, chunk.vegetationSeeds.count)
        };
        expect(() => assertCompiledSurfaceChunk({ ...chunk, vegetationSeeds }))
            .toThrow(/must not alias/);
    });
});

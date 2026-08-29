import { describe, expect, test } from "vitest";

import {
    MAX_COMPILED_VEGETATION_SEEDS,
    VEGETATION_CANDIDATES_PER_TILE,
    assertCompiledVegetationSeeds,
    compiledVegetationSeedsResidentBytes,
    compiledVegetationSeedsTransferables
} from "../../src/world/CompiledVegetationSeeds";
import {
    CompiledSurfaceSampler,
    createCompiledSurfaceSample
} from "../../src/world/CompiledSurfaceSampler";
import { compileSurfaceField } from "../../src/world/compileSurfaceField";
import { compileVegetationSeeds } from "../../src/world/compileVegetationSeeds";
import { surfaceToWorld, worldToSurface } from "../../src/world/SurfaceLattice";
import { createSurfaceCompilerTestWindow } from "./surfaceCompilerFixture";

function compileDry(options: Parameters<typeof createSurfaceCompilerTestWindow>[0] = {}) {
    const window = createSurfaceCompilerTestWindow({
        seaLevel: 0,
        macroHeight: () => 20_000,
        vegetationDensity: () => 255,
        vegetationProfile: () => 3,
        ...options
    });
    const field = compileSurfaceField(window).field;
    return { window, field, seeds: compileVegetationSeeds(window, field) };
}

describe("compiled vegetation placement seeds", () => {
    test("fills the frozen candidate budget deterministically on flat dry ground", () => {
        const first = compileDry();
        const second = compileVegetationSeeds(first.window, first.field);

        expect(first.seeds.count).toBe(MAX_COMPILED_VEGETATION_SEEDS);
        expect(first.seeds.instanceIdentity[0]).toBe(0);
        expect(first.seeds.instanceIdentity[first.seeds.count - 1])
            .toBe(MAX_COMPILED_VEGETATION_SEEDS - 1);
        expect([...first.seeds.profileIndex].every(profile => profile === 3)).toBe(true);
        expect(first.seeds.positions).toEqual(second.positions);
        expect(first.seeds.instanceIdentity).toEqual(second.instanceIdentity);
        expect(first.seeds.placementSeed).toEqual(second.placementSeed);
        expect(compiledVegetationSeedsResidentBytes(first.seeds)).toBe(first.seeds.count * 19);
    });

    test("keeps lower densities as stable candidate subsets", () => {
        const full = compileDry();
        const sparse = compileDry({ vegetationDensity: () => 96 });
        const fullIdentities = new Set(full.seeds.instanceIdentity);

        expect(sparse.seeds.count).toBeGreaterThan(0);
        expect(sparse.seeds.count).toBeLessThan(full.seeds.count);
        expect([...sparse.seeds.instanceIdentity].every(identity => fullIdentities.has(identity))).toBe(true);
        for (let index = 0; index < sparse.seeds.count; index += 1) {
            const fullIndex = sparse.seeds.instanceIdentity[index];
            expect(sparse.seeds.placementSeed[index]).toBe(full.seeds.placementSeed[fullIndex]);
            expect(sparse.seeds.positions.slice(index * 3, index * 3 + 3))
                .toEqual(full.seeds.positions.slice(fullIndex * 3, fullIndex * 3 + 3));
        }
    });

    test("binds random placement to world identity without changing local identity layout", () => {
        const first = compileDry({ worldIdentity: "world:vegetation:first" });
        const second = compileDry({ worldIdentity: "world:vegetation:second" });

        expect(first.seeds.instanceIdentity).toEqual(second.seeds.instanceIdentity);
        expect(first.seeds.positions).not.toEqual(second.seeds.positions);
        expect(first.seeds.placementSeed).not.toEqual(second.seeds.placementSeed);
    });

    test("attaches roots to the canonical compiled Ground interpolation", () => {
        const compiled = compileDry({
            macroHeight: (tileX, tileY) => 20_000 + (tileX + 2) * 100 + (tileY + 2) * 20
        });
        const sampler = new CompiledSurfaceSampler(compiled.field);
        const hexSize = compiled.window.dependencyKey.metrics.hexSize;
        const localOrigin = surfaceToWorld(0, 0, hexSize);
        for (let index = 0; index < compiled.seeds.count; index += 73) {
            const offset = index * 3;
            const logical = worldToSurface(
                compiled.seeds.positions[offset] + localOrigin.x,
                compiled.seeds.positions[offset + 2] + localOrigin.z,
                hexSize
            );
            expect(compiled.seeds.positions[offset + 1])
                .toBeCloseTo(sampler.sampleGroundHeight(logical.u, logical.v), 4);
        }
    });

    test("continuously thins the shore and emits no roots on the water side", () => {
        const dry = compileDry();
        const window = createSurfaceCompilerTestWindow({
            seaLevel: 30_000,
            macroHeight: tileX => tileX < 8 ? 10_000 : 50_000,
            vegetationDensity: () => 255,
            vegetationProfile: () => 1
        });
        const field = compileSurfaceField(window).field;
        const coast = compileVegetationSeeds(window, field);
        const sampler = new CompiledSurfaceSampler(field);
        const sample = createCompiledSurfaceSample();
        const origin = surfaceToWorld(0, 0, window.dependencyKey.metrics.hexSize);

        expect(coast.count).toBeGreaterThan(0);
        expect(coast.count).toBeLessThan(dry.seeds.count);
        for (let index = 0; index < coast.count; index += 1) {
            const offset = index * 3;
            const logical = worldToSurface(
                coast.positions[offset] + origin.x,
                coast.positions[offset + 2] + origin.z,
                window.dependencyKey.metrics.hexSize
            );
            sampler.sampleSurface(logical.u, logical.v, sample);
            expect(sample.shorelineDistance).toBeGreaterThan(0);
        }
    });

    test("rejects the frozen steep-slope range", () => {
        const steep = compileDry({
            heightScale: 100,
            macroHeight: tileX => 20_000 + (tileX + 2) * 2_000
        });
        expect(steep.seeds.count).toBe(0);
    });

    test("preserves sub-tile placement near the safe-integer coordinate ceiling", () => {
        const renderChunkX = Math.floor(Number.MAX_SAFE_INTEGER / 16) - 2;
        const compiled = compileDry({ renderChunkX });
        const distinctX = new Set<number>();
        for (let index = 0; index < VEGETATION_CANDIDATES_PER_TILE; index += 1) {
            distinctX.add(compiled.seeds.positions[index * 3]);
        }
        expect(compiled.seeds.count).toBe(MAX_COMPILED_VEGETATION_SEEDS);
        expect(distinctX.size).toBeGreaterThan(1);
    });

    test("transfers only owned result buffers and validates stable identities", () => {
        const compiled = compileDry();
        const transferables = compiledVegetationSeedsTransferables(compiled.seeds);
        const fieldByteLength = compiled.field.groundHeight.byteLength;
        const clone = structuredClone(compiled.seeds, { transfer: [...transferables] });

        expect(clone.count).toBe(MAX_COMPILED_VEGETATION_SEEDS);
        expect(compiled.seeds.positions.byteLength).toBe(0);
        expect(compiled.field.groundHeight.byteLength).toBe(fieldByteLength);

        const invalid = {
            ...clone,
            instanceIdentity: clone.instanceIdentity.slice()
        };
        invalid.instanceIdentity[1] = invalid.instanceIdentity[0];
        expect(() => assertCompiledVegetationSeeds(invalid)).toThrow(/strictly ascending/);
    });
});

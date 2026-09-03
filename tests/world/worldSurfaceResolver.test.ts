import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { getNeighbors } from "../../src/helpers/neighbors";
import { getMapNeighbors } from "../../src/helpers/topology";
import { generateWorld } from "../../src/world/generateWorld";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import {
    createWorldSurfaceResolver
} from "../../src/world/WorldSurfaceResolver";
import {
    assertWorldStyleProfile,
    WORLD_STYLE_PROFILE
} from "../../src/world/WorldStyleProfile";

function checksum(values: ArrayLike<number>): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        hash ^= value & 0xff;
        hash = Math.imul(hash, 0x01000193);
        hash ^= (value >>> 8) & 0xff;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("WorldSurfaceResolver", () => {
    test("preserves the frozen generator v9 outputs", () => {
        const infinite = generateWorldChunk({
            seed: "surface-v7-infinite", chunkX: -1, chunkY: 0, chunkSize: 24
        });
        const toroidal = generateWorldChunk({
            seed: "toroidal-water",
            chunkX: 3,
            chunkY: 3,
            chunkSize: 24,
            world: { topology: "toroidal", width: 128, height: 96 }
        });
        const bounded = generateWorld({ seed: "gallery-a", width: 128, height: 96 });
        const encoded: number[] = [];
        const land = [Land.sea, Land.coastal, Land.land, Land.sand, Land.tundra, Land.snow, Land.mountain];
        for (let x = 0; x < bounded.w; x += 1) {
            for (let y = 0; y < bounded.h; y += 1) {
                const tile = bounded.data[x][y];
                encoded.push(land.indexOf(tile.type));
                encoded.push((tile.modifiers?.includes("hill") ? 1 : 0)
                    | (tile.modifiers?.includes("wood") ? 2 : 0)
                    | (tile.modifiers?.includes("lake") ? 4 : 0)
                    | (tile.modifiers?.includes("river") ? 8 : 0));
            }
        }
        expect(checksum(infinite.tiles)).toBe("1f4e1e07");
        expect(checksum(toroidal.tiles)).toBe("76903c55");
        expect(checksum(encoded)).toBe("87c5d4d5");
    });

    test("keeps generated permanent snow on elevated hill relief", () => {
        const resolver = createWorldSurfaceResolver({ seed: "new-world" });
        const terrain = WORLD_STYLE_PROFILE.terrain;
        const minimumSnowElevation = terrain.seaLevel
            + (terrain.hillElevation - terrain.seaLevel) * 0.45;
        let snowTiles = 0;
        for (let x = -64; x < 64; x += 1) {
            for (let y = -64; y < 64; y += 1) {
                const sample = resolver.sampleGenerated(x, y);
                if (sample.baseTerrain !== Land.snow) continue;
                const tile = resolver.resolveGeneratedTile(x, y);
                if (tile.type === Land.sea || tile.type === Land.coastal) continue;
                snowTiles += 1;
                expect(sample.landform.elevation).toBeGreaterThan(minimumSnowElevation);
                expect(tile.modifiers).toContain("hill");
            }
        }
        expect(snowTiles).toBeGreaterThan(0);
    });

    test("resolves curve samples as full hex water terrain instead of river channels", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "rough-water-field",
            domain: { topology: "infinite" }
        });
        let convertedLand = 0;
        resolver.visitGeneratedWaterTiles(-96, -96, 192, 192, (x, y) => {
            const base = resolver.sampleGenerated(x, y).baseTerrain;
            if (base === Land.sea || base === Land.coastal) return;
            const tile = resolver.resolveGeneratedTile(x, y);
            convertedLand += 1;
            expect(tile.type === Land.sea || tile.type === Land.coastal).toBe(true);
            expect(tile.modifiers ?? []).not.toContain("river");
            expect("riverEdges" in tile).toBe(false);
            if (tile.type === Land.sea) {
                expect(getNeighbors(x, y).every(neighbor => {
                    const adjacent = resolver.resolveGeneratedTile(neighbor.x, neighbor.y);
                    return adjacent.type === Land.sea || adjacent.type === Land.coastal;
                })).toBe(true);
            }
        });
        expect(convertedLand).toBeGreaterThan(200);
    });

    test("freezes continuous relief, biome, vegetation and lake fields", () => {
        const resolver = createWorldSurfaceResolver({ seed: "surface-v4-fields" });
        const encoded: number[] = [];
        const reliefValues = new Set<number>();
        const vegetationValues = new Set<number>();
        const lakeValues = new Set<number>();
        for (let x = -20; x < 20; x += 1) {
            for (let y = -20; y < 20; y += 1) {
                const sample = resolver.sampleGenerated(x, y);
                const weights = sample.biomeWeights;
                if (sample.baseTerrain !== Land.sea && sample.baseTerrain !== Land.coastal) {
                    expect(weights.temperate + weights.dry + weights.cold + weights.alpine)
                        .toBeCloseTo(1, 12);
                }
                const values = [
                    sample.relief,
                    weights.temperate,
                    weights.dry,
                    weights.cold,
                    weights.alpine,
                    sample.vegetationDensity,
                    sample.lakePotential,
                    sample.landform.forestPatch,
                    sample.landform.lakePatch
                ].map(value => Math.round(value * 65535));
                encoded.push(...values);
                reliefValues.add(values[0]);
                vegetationValues.add(values[5]);
                lakeValues.add(values[6]);
            }
        }
        expect(reliefValues.size).toBeGreaterThan(100);
        expect(vegetationValues.size).toBeGreaterThan(50);
        expect(lakeValues.size).toBeGreaterThan(20);
        expect(checksum(encoded)).toBe("7ffc9327");
    });

    test("forms neighboring lake cells and regional forests instead of isolated noise", () => {
        const world = generateWorld({ seed: "gallery-a", width: 96, height: 96 });
        const lakes: Array<{ x: number; y: number }> = [];
        const woods: Array<{ x: number; y: number }> = [];
        const encoded: number[] = [];
        const land = [Land.sea, Land.coastal, Land.land, Land.sand, Land.tundra, Land.snow, Land.mountain];
        for (let x = 0; x < world.w; x += 1) {
            for (let y = 0; y < world.h; y += 1) {
                const tile = world.data[x][y];
                if (tile.modifiers?.includes("lake")) lakes.push({ x, y });
                if (tile.modifiers?.includes("wood")) woods.push({ x, y });
                encoded.push(land.indexOf(tile.type));
                encoded.push((tile.modifiers?.includes("hill") ? 1 : 0)
                    | (tile.modifiers?.includes("wood") ? 2 : 0)
                    | (tile.modifiers?.includes("lake") ? 4 : 0));
            }
        }
        expect(lakes.length).toBeGreaterThan(0);
        for (const lake of lakes) {
            expect(getMapNeighbors(world, lake.x, lake.y).some(neighbor =>
                world.data[neighbor.x][neighbor.y].modifiers?.includes("lake")
            )).toBe(true);
        }
        const adjacentWoods = woods.filter(wood => getMapNeighbors(world, wood.x, wood.y).some(neighbor =>
            world.data[neighbor.x][neighbor.y].modifiers?.includes("wood")
        ));
        expect(woods.length).toBeGreaterThan(100);
        expect(adjacentWoods.length / woods.length).toBeGreaterThan(0.65);
        expect(checksum(encoded)).toBe("9e5ede59");
    });

    test("deduplicates canonical samples inside a short-lived toroidal window", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "window",
            domain: { topology: "toroidal", width: 48, height: 36 }
        });
        const window = resolver.createWindow();
        expect(window.sampleGenerated(3, 7)).toBe(window.sampleGenerated(51, 43));
        expect(window.resolveGeneratedTile(-45, -29)).toBe(window.resolveGeneratedTile(3, 7));
        window.clear();
        expect(window.sampleGenerated(3, 7)).toEqual(resolver.sampleGenerated(3, 7));
    });

    test("uses one rule for direct and windowed tile resolution", () => {
        const resolver = createWorldSurfaceResolver({
            seed: "single-rule",
            domain: { topology: "infinite" }
        });
        const window = resolver.createWindow();
        for (let x = -12; x <= 12; x += 3) {
            for (let y = -9; y <= 9; y += 3) {
                expect(window.resolveGeneratedTile(x, y)).toEqual(resolver.resolveGeneratedTile(x, y));
            }
        }
    });

    test("rejects invalid profile numbers and threshold ordering", () => {
        const invalidScale = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidScale.fields.continent.openScale = Number.NaN;
        expect(() => assertWorldStyleProfile(invalidScale)).toThrow(/finite|positive/);

        const invalidThresholds = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidThresholds.terrain.mountainElevation = invalidThresholds.terrain.mountainPeakElevation;
        expect(() => assertWorldStyleProfile(invalidThresholds)).toThrow(/ordered/);

        const missingField = structuredClone(WORLD_STYLE_PROFILE) as any;
        delete missingField.fields.ridge;
        expect(() => assertWorldStyleProfile(missingField)).toThrow(/ridge/);

        const invalidPlacement = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidPlacement.vegetation.placementThreshold = 0.01;
        expect(() => assertWorldStyleProfile(invalidPlacement)).toThrow(/placement threshold/);

        const invalidRiverSampling = structuredClone(WORLD_STYLE_PROFILE) as any;
        invalidRiverSampling.rivers.curve.families[1].maximumLength
            = invalidRiverSampling.rivers.curve.families[1].minimumLength;
        expect(() => assertWorldStyleProfile(invalidRiverSampling)).toThrow(/ranges must be ordered/);
    });

    test("rejects invalid seed and coordinate identities", () => {
        expect(() => createWorldSurfaceResolver({ seed: Number.NaN })).toThrow(/finite/);
        const resolver = createWorldSurfaceResolver({ seed: "safe-coordinates" });
        expect(() => resolver.sampleGenerated(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(/safe integers/);
    });
});

import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
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
    test("preserves the frozen generator v3 outputs", () => {
        const infinite = generateWorldChunk({
            seed: "surface-v3-infinite", chunkX: -3, chunkY: 2, chunkSize: 24
        });
        const toroidal = generateWorldChunk({
            seed: "surface-v3-toroidal",
            chunkX: 0,
            chunkY: 0,
            chunkSize: 24,
            world: { topology: "toroidal", width: 48, height: 36 }
        });
        const bounded = generateWorld({ seed: "surface-v3-bounded", width: 32, height: 24 });
        const encoded: number[] = [];
        const land = [Land.sea, Land.coastal, Land.land, Land.sand, Land.tundra, Land.snow, Land.mountain];
        for (let x = 0; x < bounded.w; x += 1) {
            for (let y = 0; y < bounded.h; y += 1) {
                const tile = bounded.data[x][y];
                encoded.push(land.indexOf(tile.type));
                encoded.push((tile.modifiers?.includes("hill") ? 1 : 0)
                    | (tile.modifiers?.includes("wood") ? 2 : 0)
                    | (tile.modifiers?.includes("lake") ? 4 : 0));
            }
        }
        expect(checksum(infinite.tiles)).toBe("ca3aee38");
        expect(checksum(toroidal.tiles)).toBe("b20dfb95");
        expect(checksum(encoded)).toBe("8bdd046b");
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
    });

    test("rejects invalid seed and coordinate identities", () => {
        expect(() => createWorldSurfaceResolver({ seed: Number.NaN })).toThrow(/finite/);
        const resolver = createWorldSurfaceResolver({ seed: "safe-coordinates" });
        expect(() => resolver.sampleGenerated(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(/safe integers/);
    });
});

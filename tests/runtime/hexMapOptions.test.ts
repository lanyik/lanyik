import { describe, expect, test } from "vitest";

import { resolveHexMapOptions } from "../../src/HexMapOptions";

describe("HexMap option boundary", () => {
    test("resolves size-dependent defaults in one deterministic place", () => {
        const options = resolveHexMapOptions({
            element: "#map",
            size: 50,
            waterColorShallow: 0x123456,
            waterColorDeep: 0x654321
        });
        expect(options).toMatchObject({
            size: 50,
            waterDepth: 12.5,
            fogTextureSize: 400,
            riverDepth: 7.5,
            mountainHeight: 80,
            terrainTextureRegionSize: 2,
            grassBladeWidth: 1.5,
            grassBladeHeight: 9,
            grassWindStrength: 3.15,
            renderDistance: 2850,
            horizonFogStart: 2223,
            horizonFogEnd: 2707.5,
            horizonFogColor: 0xe8f0f2,
            worldSessionDrainTimeoutMs: 15_000,
            riverColorShallow: 0x123456,
            riverColorDeep: 0x654321
        });
    });

    test("rejects ambiguous selectors and unsafe resource budgets before WebGL allocation", () => {
        expect(() => resolveHexMapOptions({ element: "" })).toThrow(/non-empty CSS selector/);
        expect(() => resolveHexMapOptions({
            element: "#map",
            gpuChunkCacheBytes: Number.MAX_SAFE_INTEGER + 1
        })).toThrow(/non-negative safe integer/);
        expect(() => resolveHexMapOptions({
            element: "#map",
            worldSessionDrainTimeoutMs: 0
        })).toThrow(/positive finite number/);
        expect(() => resolveHexMapOptions({
            element: "#map",
            terrainTextureRegionSize: 0
        })).toThrow(/terrainTextureRegionSize must be a positive finite number/);
        expect(() => resolveHexMapOptions({
            element: "#map",
            horizonFogStart: 900,
            horizonFogEnd: 800
        })).toThrow(/greater than horizonFogStart/);
        expect(() => resolveHexMapOptions({
            element: "#map",
            renderDistance: 1000,
            horizonFogEnd: 1001
        })).toThrow(/<= renderDistance/);
    });

    test("derives the opaque horizon band from a custom hard render distance", () => {
        expect(resolveHexMapOptions({ element: "#map", renderDistance: 1000 })).toMatchObject({
            renderDistance: 1000,
            horizonFogStart: 780,
            horizonFogEnd: 950
        });
    });
});

import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo, RiverSegment } from "../../src/interfaces";
import {
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MIN_X,
    HydrologyPort,
    hydrologyPortConnectionSignature
} from "../../src/world/HydrologyRegion";
import {
    HYDROLOGY_KIND_LAKE,
    HYDROLOGY_KIND_RIVER,
    HydrologyRegionSpatialIndex
} from "../../src/world/HydrologyRegionSpatialIndex";
import {
    CORE_WORLD_SEMANTICS_V2
} from "../../src/world/SemanticCatalogsV2";
import {
    STATIC_EXPLICIT_WATER_LEVEL,
    StaticHydrologyRegionSource
} from "../../src/world/StaticHydrologyRegionSource";
import { createWorldDescriptorV2 } from "../../src/world/WorldDescriptorV2";
import { STATIC_PLAIN_HEIGHT } from "../../src/world/compileStaticSemanticChunk";

function plainMap(width: number, height: number): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height };
}

function descriptor(width: number, height: number) {
    return createWorldDescriptorV2({
        ...CORE_WORLD_SEMANTICS_V2,
        sourceKind: "static",
        sourceContentHash: `sha256:${"d".repeat(64)}`,
        width,
        height
    });
}

function markRiver(map: MapInfo, riverIndex: number, tiles: readonly { x: number; y: number }[]): void {
    for (let index = 0; index < tiles.length; index += 1) {
        const tile = map.data[tiles[index].x][tiles[index].y];
        tile.modifiers = tile.modifiers?.includes("river")
            ? tile.modifiers
            : [...(tile.modifiers ?? []), "river"];
        tile.rivers = [...(tile.rivers ?? []), { riverIndex, riverTileIndex: index }];
    }
}

function portsOn(ports: readonly HydrologyPort[], boundary: number): readonly HydrologyPort[] {
    return ports.filter(port => (port.boundaryMask & boundary) !== 0);
}

describe("StaticHydrologyRegionSource", () => {
    test("compiles ordered legacy rivers, lake components and half-tile boundary ports", () => {
        const map = plainMap(140, 20);
        map.data[0][10] = { type: Land.sea };
        markRiver(map, 7, [{ x: 3, y: 10 }, { x: 2, y: 10 }, { x: 1, y: 10 }]);
        markRiver(map, 9, [
            { x: 125, y: 5 },
            { x: 126, y: 5 },
            { x: 127, y: 5 },
            { x: 128, y: 5 },
            { x: 129, y: 5 }
        ]);
        map.data[130][5] = { type: Land.land, modifiers: ["lake"] };
        map.data[131][5] = { type: Land.land, modifiers: ["lake"] };
        const source = new StaticHydrologyRegionSource(map, descriptor(140, 20));
        const west = source.buildRegion(0, 0);
        const east = source.buildRegion(1, 0);
        expect(east.validBounds).toEqual({ minX: 0, minY: 0, maxXExclusive: 12, maxYExclusive: 20 });
        const westPorts = portsOn(west.boundaryPorts, HYDROLOGY_BOUNDARY_MAX_X);
        const eastPorts = portsOn(east.boundaryPorts, HYDROLOGY_BOUNDARY_MIN_X);
        expect(westPorts).toHaveLength(1);
        expect(westPorts.map(hydrologyPortConnectionSignature))
            .toEqual(eastPorts.map(hydrologyPortConnectionSignature));
        expect(westPorts[0].canonicalTileX).toBe(127.5);
        expect(west.mouths.some(mouth => mouth.targetBodyId === "ocean")).toBe(true);
        expect(east.mouths.some(mouth => mouth.targetBodyId === "static-lake:130:5")).toBe(true);
        expect(east.lakes).toHaveLength(2);
        expect(new Set(east.lakes.map(lake => lake.bodyId))).toEqual(new Set(["static-lake:130:5"]));

        const index = new HydrologyRegionSpatialIndex(east);
        expect(index.query(2, 5, STATIC_PLAIN_HEIGHT, source.descriptor.seaLevel)).toMatchObject({
            kind: HYDROLOGY_KIND_LAKE,
            level: STATIC_EXPLICIT_WATER_LEVEL,
            depth: 1_024,
            body: { bodyId: "static-lake:130:5" }
        });
        expect(index.query(0, 5, STATIC_PLAIN_HEIGHT, source.descriptor.seaLevel)).toMatchObject({
            kind: HYDROLOGY_KIND_RIVER,
            body: { bodyId: "river:static:9" }
        });

        map.data[130][5] = { type: Land.mountain };
        expect(source.buildRegion(1, 0)).toEqual(east);
    });

    test("merges authored river chains only through explicit shared ordered tiles", () => {
        const map = plainMap(8, 8);
        map.data[0][4] = { type: Land.sea };
        markRiver(map, 0, [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }]);
        markRiver(map, 1, [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }]);
        const region = new StaticHydrologyRegionSource(map, descriptor(8, 8)).buildRegion(0, 0);
        expect(new Set(region.rivers.map(river => river.riverId))).toEqual(new Set(["river:static:0"]));
        expect(region.mouths).toHaveLength(1);
        expect(region.rivers.find(river => river.segmentId.includes(
            "static-node:3:4>static-node:2:4"
        ))).toMatchObject({
            dischargeClass: 2,
            widthProfile: new Uint8Array([3, 3])
        });
    });

    test("rejects missing, discontinuous and orphaned authored river metadata", () => {
        const missing = plainMap(8, 8);
        missing.data[2][2] = { type: Land.land, modifiers: ["river"] };
        expect(() => new StaticHydrologyRegionSource(missing, descriptor(8, 8)))
            .toThrow(/requires ordered river metadata/);

        const discontinuous = plainMap(8, 8);
        discontinuous.data[1][1] = {
            type: Land.land,
            modifiers: ["river"],
            rivers: [{ riverIndex: 0, riverTileIndex: 0 }]
        };
        discontinuous.data[5][5] = {
            type: Land.land,
            modifiers: ["river"],
            rivers: [{ riverIndex: 0, riverTileIndex: 1 }]
        };
        expect(() => new StaticHydrologyRegionSource(discontinuous, descriptor(8, 8)))
            .toThrow(/non-neighboring/);

        const orphan = plainMap(8, 8);
        markRiver(orphan, 0, [{ x: 2, y: 2 }, { x: 2, y: 3 }]);
        expect(() => new StaticHydrologyRegionSource(orphan, descriptor(8, 8)))
            .toThrow(/no ocean, lake or continuing river outlet/);
    });

    test("rejects invalid river metadata numbers before graph construction", () => {
        const map = plainMap(8, 8);
        map.data[2][2] = {
            type: Land.land,
            modifiers: ["river"],
            rivers: [{ riverIndex: 0, riverTileIndex: -1 } as RiverSegment]
        };
        expect(() => new StaticHydrologyRegionSource(map, descriptor(8, 8)))
            .toThrow(/non-negative safe integers/);
    });

    test("rejects divergent, cyclic and ambiguous authored outlets", () => {
        const divergent = plainMap(8, 8);
        markRiver(divergent, 0, [{ x: 3, y: 3 }, { x: 2, y: 3 }]);
        markRiver(divergent, 1, [{ x: 3, y: 3 }, { x: 3, y: 4 }]);
        expect(() => new StaticHydrologyRegionSource(divergent, descriptor(8, 8)))
            .toThrow(/divergent ordered outlets/);

        const cyclic = plainMap(8, 8);
        markRiver(cyclic, 0, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
        markRiver(cyclic, 1, [{ x: 2, y: 1 }, { x: 1, y: 1 }]);
        expect(() => new StaticHydrologyRegionSource(cyclic, descriptor(8, 8)))
            .toThrow(/directed cycle/);

        const ambiguous = plainMap(8, 8);
        markRiver(ambiguous, 0, [{ x: 2, y: 2 }]);
        ambiguous.data[1][2] = { type: Land.sea };
        ambiguous.data[2][3] = { type: Land.land, modifiers: ["lake"] };
        expect(() => new StaticHydrologyRegionSource(ambiguous, descriptor(8, 8)))
            .toThrow(/ambiguous terminal water bodies/);
    });
});

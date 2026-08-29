import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_POINT_QUANTIZATION,
    HydrologyRegion,
    createHydrologyRegion
} from "../../src/world/HydrologyRegion";
import {
    HYDROLOGY_KIND_LAKE,
    HYDROLOGY_KIND_NONE,
    HYDROLOGY_KIND_OCEAN,
    HYDROLOGY_KIND_RIVER,
    HydrologyRegionSpatialIndex,
    hydrologyRiverHalfWidthTiles
} from "../../src/world/HydrologyRegionSpatialIndex";
import {
    assertDerivedHydrologyRaster,
    deriveHydrologyRaster,
    derivedHydrologyRasterIndex
} from "../../src/world/DerivedHydrologyRaster";

function featureRegion(): HydrologyRegion {
    return createHydrologyRegion({
        worldIdentity: "world:hydrology-query",
        topology: "finite",
        key: { regionX: 0, regionY: 0 },
        revision: 0,
        validBounds: { minX: 0, minY: 0, maxXExclusive: 128, maxYExclusive: 128 },
        boundaryPorts: [{
            connectionId: "connection:river:0",
            riverId: "river:0",
            segmentId: "segment:river:0",
            endpoint: "entry",
            boundaryMask: HYDROLOGY_BOUNDARY_MIN_X,
            point: new Int16Array([-HYDROLOGY_POINT_QUANTIZATION / 2, 64 * HYDROLOGY_POINT_QUANTIZATION]),
            canonicalTileX: -0.5,
            canonicalTileY: 64,
            flowDirection: new Int8Array([1, 0]),
            widthClass: 4,
            level: 120,
            dischargeClass: 3
        }],
        rivers: [{
            riverId: "river:0",
            segmentId: "segment:river:0",
            controlPoints: new Int16Array([
                -HYDROLOGY_POINT_QUANTIZATION / 2,
                64 * HYDROLOGY_POINT_QUANTIZATION,
                127.5 * HYDROLOGY_POINT_QUANTIZATION,
                64 * HYDROLOGY_POINT_QUANTIZATION
            ]),
            widthProfile: new Uint8Array([4, 4]),
            levelProfile: new Uint16Array([120, 80]),
            dischargeClass: 3,
            entry: { kind: "port", connectionId: "connection:river:0" },
            exit: { kind: "body", bodyId: "ocean" }
        }],
        lakes: [{
            featureId: "lake-slice:0",
            bodyId: "lake:0",
            center: new Int16Array([
                32 * HYDROLOGY_POINT_QUANTIZATION,
                32 * HYDROLOGY_POINT_QUANTIZATION
            ]),
            radius: 8 * HYDROLOGY_POINT_QUANTIZATION,
            level: 110,
            profileIndex: 1
        }],
        mouths: [{
            mouthId: "mouth:river:0",
            riverId: "river:0",
            segmentId: "segment:river:0",
            targetBodyId: "ocean",
            point: new Int16Array([
                127.5 * HYDROLOGY_POINT_QUANTIZATION,
                64 * HYDROLOGY_POINT_QUANTIZATION
            ]),
            widthClass: 4,
            dischargeClass: 3
        }],
        bodies: [
            { bodyId: "river:0", kind: "river", profileIndex: 2 },
            { bodyId: "lake:0", kind: "lake", profileIndex: 1 },
            { bodyId: "ocean", kind: "ocean", profileIndex: 0 }
        ]
    });
}

describe("derived hydrology query", () => {
    test("queries ocean, lake, river, mouth and dry land from one spatial index", () => {
        const index = new HydrologyRegionSpatialIndex(featureRegion());
        expect(index.cellCountX).toBe(8);
        expect(hydrologyRiverHalfWidthTiles(4)).toBe(1.5);

        expect(index.query(100, 100, 50, 80)).toMatchObject({
            kind: HYDROLOGY_KIND_OCEAN,
            coverage: 255,
            level: 80,
            depth: 30,
            body: { bodyId: "ocean" }
        });
        expect(index.query(32, 32, 100, 80)).toMatchObject({
            kind: HYDROLOGY_KIND_LAKE,
            coverage: 255,
            level: 110,
            depth: 10,
            body: { bodyId: "lake:0" }
        });
        expect(index.query(64, 64, 130, 80)).toMatchObject({
            kind: HYDROLOGY_KIND_RIVER,
            coverage: 255,
            level: 100,
            depth: 0,
            flowX: 1,
            flowY: 0,
            body: { bodyId: "river:0" }
        });
        expect(index.query(127.25, 64, 80, 80)).toMatchObject({
            kind: HYDROLOGY_KIND_OCEAN,
            flowX: 0,
            flowY: 0,
            body: { bodyId: "ocean" }
        });
        expect(index.query(100, 100, 100, 80)).toEqual({
            coverage: 0,
            kind: HYDROLOGY_KIND_NONE,
            level: 0,
            depth: 0,
            flowX: 0,
            flowY: 0,
            profileIndex: 0
        });
    });

    test("derives X-major typed fields and a canonical local body palette", () => {
        const index = new HydrologyRegionSpatialIndex(featureRegion());
        const groundHeight = new Uint16Array(16).fill(100);
        groundHeight[derivedHydrologyRasterIndex(2, 2, 4, 4)] = 130;
        const raster = deriveHydrologyRaster({
            index,
            width: 4,
            height: 4,
            localOriginX: 0,
            localOriginY: 0,
            stepX: 32,
            stepY: 32,
            groundHeight,
            seaLevel: 80
        });
        assertDerivedHydrologyRaster(raster);
        expect(raster.bodies.map(body => body.bodyId)).toEqual(["lake:0", "river:0"]);
        const lake = derivedHydrologyRasterIndex(1, 1, 4, 4);
        expect(raster.kind[lake]).toBe(HYDROLOGY_KIND_LAKE);
        expect(raster.bodyIndex[lake]).toBe(1);
        const river = derivedHydrologyRasterIndex(2, 2, 4, 4);
        expect(raster.kind[river]).toBe(HYDROLOGY_KIND_RIVER);
        expect(raster.bodyIndex[river]).toBe(2);
        expect(raster.depth[river]).toBe(0);
        raster.bodyIndex[river] = 0;
        expect(() => assertDerivedHydrologyRaster(raster)).toThrow(/invalid kind, flow or body/);
    });

    test("rejects queries and raster lattices outside explicit valid bounds", () => {
        const index = new HydrologyRegionSpatialIndex(featureRegion());
        expect(index.query(-0.5, -0.5, 100, 80)).toMatchObject({ kind: HYDROLOGY_KIND_NONE });
        expect(() => index.query(127.5, 0, 100, 80)).toThrow(/outside/);
        expect(() => index.query(0, 127.5, 100, 80)).toThrow(/outside/);
        expect(() => deriveHydrologyRaster({
            index,
            width: 1,
            height: 1,
            localOriginX: -0.5,
            localOriginY: -0.5,
            stepX: 1,
            stepY: 1,
            groundHeight: new Uint16Array(1),
            seaLevel: 80
        })).not.toThrow();
        expect(() => deriveHydrologyRaster({
            index,
            width: 2,
            height: 1,
            localOriginX: 127,
            localOriginY: 0,
            stepX: 1,
            stepY: 1,
            groundHeight: new Uint16Array(2),
            seaLevel: 80
        })).toThrow(/leaves region/);
    });
});

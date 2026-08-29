import { describe, expect, test } from "vitest";

import {
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_BOUNDARY_MIN_Y,
    HYDROLOGY_POINT_QUANTIZATION,
    HYDROLOGY_REGION_REVISION,
    HydrologyRegionInput,
    assertHydrologyRegion,
    createHydrologyRegion,
    hydrologyPortConnectionSignature
} from "../../src/world/HydrologyRegion";
import { HYDROLOGY_REGION_FORMAT_VERSION } from "../../src/world/WorldDescriptorV2";

function validInput(): HydrologyRegionInput {
    return {
        worldIdentity: "world:test",
        topology: "finite",
        key: { regionX: 0, regionY: 0 },
        revision: HYDROLOGY_REGION_REVISION,
        validBounds: { minX: 0, minY: 0, maxXExclusive: 2, maxYExclusive: 2 },
        boundaryPorts: [{
            connectionId: "connection:0",
            riverId: "river:0",
            segmentId: "segment:0",
            endpoint: "entry",
            boundaryMask: HYDROLOGY_BOUNDARY_MIN_X,
            point: new Int16Array([-HYDROLOGY_POINT_QUANTIZATION / 2, HYDROLOGY_POINT_QUANTIZATION]),
            canonicalTileX: -0.5,
            canonicalTileY: 1,
            flowDirection: new Int8Array([1, 0]),
            widthClass: 2,
            level: 100,
            dischargeClass: 1
        }],
        rivers: [{
            riverId: "river:0",
            segmentId: "segment:0",
            controlPoints: new Int16Array([
                -HYDROLOGY_POINT_QUANTIZATION / 2,
                HYDROLOGY_POINT_QUANTIZATION,
                HYDROLOGY_POINT_QUANTIZATION * 1.5,
                HYDROLOGY_POINT_QUANTIZATION
            ]),
            widthProfile: new Uint8Array([2, 2]),
            levelProfile: new Uint16Array([100, 90]),
            dischargeClass: 1,
            entry: { kind: "port", connectionId: "connection:0" },
            exit: { kind: "body", bodyId: "ocean" }
        }],
        lakes: [],
        mouths: [{
            mouthId: "mouth:0",
            riverId: "river:0",
            segmentId: "segment:0",
            targetBodyId: "ocean",
            point: new Int16Array([
                HYDROLOGY_POINT_QUANTIZATION * 1.5,
                HYDROLOGY_POINT_QUANTIZATION
            ]),
            widthClass: 2,
            dischargeClass: 1
        }],
        bodies: [
            { bodyId: "river:0", kind: "river", profileIndex: 2 },
            { bodyId: "ocean", kind: "ocean", profileIndex: 0 }
        ]
    };
}

describe("HydrologyRegion", () => {
    test("publishes a canonical bounded feature graph", () => {
        const region = createHydrologyRegion(validInput());
        expect(region.formatVersion).toBe(HYDROLOGY_REGION_FORMAT_VERSION);
        expect(region.bodies.map(body => body.bodyId)).toEqual(["ocean", "river:0"]);
        expect(Object.isFrozen(region)).toBe(true);
        expect(Object.isFrozen(region.rivers)).toBe(true);
        assertHydrologyRegion(region);
        expect(hydrologyPortConnectionSignature(region.boundaryPorts[0]))
            .toBe('["connection:0","river:0",-0.5,1,1,0,2,100,1]');
    });

    test("supports a canonical corner port without duplicating the crossing", () => {
        const base = validInput();
        const point = base.boundaryPorts[0].point.slice();
        point[1] = -HYDROLOGY_POINT_QUANTIZATION / 2;
        const controlPoints = base.rivers[0].controlPoints.slice();
        controlPoints[1] = -HYDROLOGY_POINT_QUANTIZATION / 2;
        const input: HydrologyRegionInput = {
            ...base,
            boundaryPorts: [{
                ...base.boundaryPorts[0],
                boundaryMask: HYDROLOGY_BOUNDARY_MIN_X | HYDROLOGY_BOUNDARY_MIN_Y,
                point,
                flowDirection: new Int8Array([1, 1])
            }],
            rivers: [{ ...base.rivers[0], controlPoints }]
        };
        const region = createHydrologyRegion(input);
        expect(region.boundaryPorts[0].boundaryMask)
            .toBe(HYDROLOGY_BOUNDARY_MIN_X | HYDROLOGY_BOUNDARY_MIN_Y);
    });

    test("rejects mismatched ports, rising profiles and missing terminal mouths", () => {
        const mismatchBase = validInput();
        const mismatchedPort: HydrologyRegionInput = {
            ...mismatchBase,
            boundaryPorts: [{ ...mismatchBase.boundaryPorts[0], widthClass: 3 }]
        };
        expect(() => createHydrologyRegion(mismatchedPort)).toThrow(/port geometry or flow class/);

        const rising = validInput();
        rising.rivers[0].levelProfile[1] = 101;
        expect(() => createHydrologyRegion(rising)).toThrow(/level cannot rise/);

        const missingMouth: HydrologyRegionInput = { ...validInput(), mouths: [] };
        expect(() => createHydrologyRegion(missingMouth)).toThrow(/no mouth/);
    });

    test("rejects duplicate identities and invalid topology keys", () => {
        const duplicateBase = validInput();
        const duplicateBodies: HydrologyRegionInput = {
            ...duplicateBase,
            bodies: [...duplicateBase.bodies, duplicateBase.bodies[0]]
        };
        expect(() => createHydrologyRegion(duplicateBodies)).toThrow(/unique canonical identity/);

        const negativeFinite: HydrologyRegionInput = {
            ...validInput(),
            key: { regionX: -1, regionY: 0 }
        };
        expect(() => createHydrologyRegion(negativeFinite)).toThrow(/key/);

        const negativeInfinite: HydrologyRegionInput = {
            ...validInput(),
            topology: "infinite",
            key: { regionX: -1, regionY: -2 }
        };
        expect(() => createHydrologyRegion(negativeInfinite)).not.toThrow();
    });

    test("detects typed-array corruption on revalidation", () => {
        const region = createHydrologyRegion(validInput());
        region.rivers[0].widthProfile[0] = 0;
        expect(() => assertHydrologyRegion(region)).toThrow(/zero width/);
    });
});

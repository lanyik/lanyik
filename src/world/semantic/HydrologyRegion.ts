import {
    HydrologyBodyId,
    HydrologyEdgeId,
    HydrologyFeatureId,
    HYDROLOGY_MAX_DISCHARGE_CLASS,
    OCEAN_BODY_ID
} from "./MacroDrainageGraph";
import {
    assertHydrologyRegionKey,
    assertHydrologyRegionLocalBounds,
    HYDROLOGY_COORDINATE_SCALE,
    HYDROLOGY_REGION_SIZE,
    HYDROLOGY_REGION_REVISION,
    HydrologyRegionKey,
    HydrologyRegionLocalBounds
} from "./WorldSemanticFormat";

export type HydrologySegmentId = string;
export type HydrologyPortId = string;
export type HydrologyConnectionId = string;

export const HYDROLOGY_MAX_REGION_RIVERS = 512;
export const HYDROLOGY_MAX_REGION_PORTS = 128;
export const HYDROLOGY_MAX_REGION_LAKES = 64;
export const HYDROLOGY_MAX_REGION_MOUTHS = 64;
export const HYDROLOGY_MAX_REGION_BODIES = 255;
export const HYDROLOGY_MAX_REGION_CONTROL_POINTS = 2_048;

export interface RiverEndpoint {
    readonly kind: "source" | "confluence" | "boundary" | "mouth";
    readonly connectionId: HydrologyConnectionId;
}

export interface HydrologyPort {
    readonly portId: HydrologyPortId;
    readonly connectionId: HydrologyConnectionId;
    readonly edgeId: HydrologyEdgeId;
    readonly riverId: HydrologyFeatureId;
    readonly bodyId: HydrologyBodyId;
    readonly side: "west" | "east" | "north" | "south";
    readonly x: number;
    readonly y: number;
    readonly flow: "in" | "out";
    readonly flowX: number;
    readonly flowY: number;
    readonly width: number;
    readonly level: number;
    readonly dischargeClass: number;
}

export interface RiverFeatureSegment {
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly edgeId: HydrologyEdgeId;
    readonly controlPoints: Int16Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly dischargeClass: number;
    readonly entry: RiverEndpoint;
    readonly exit: RiverEndpoint;
}

export interface LakeFeature {
    readonly lakeId: HydrologyFeatureId;
    readonly bodyId: HydrologyBodyId;
    readonly boundaryPoints: Int16Array;
    readonly level: number;
    readonly profileIndex: number;
}

export interface RiverMouthFeature {
    readonly mouthId: HydrologyFeatureId;
    readonly riverId: HydrologyFeatureId;
    readonly targetBodyId: HydrologyBodyId;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly level: number;
}

export interface HydrologyBodyRef {
    readonly bodyId: HydrologyBodyId;
    readonly kind: "ocean" | "lake" | "river";
    readonly profileIndex: number;
}

export interface HydrologyRegion {
    readonly key: HydrologyRegionKey;
    readonly revision: number;
    readonly validBounds: HydrologyRegionLocalBounds;
    readonly boundaryPorts: readonly HydrologyPort[];
    readonly rivers: readonly RiverFeatureSegment[];
    readonly lakes: readonly LakeFeature[];
    readonly mouths: readonly RiverMouthFeature[];
    readonly bodies: readonly HydrologyBodyRef[];
}

function assertId(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]*:[a-f0-9]{32}$|^hydrology:ocean:v1$/.test(value)) {
        throw new TypeError(`${name} must be a stable hydrology ID`);
    }
}

function assertUint16(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new RangeError(`${name} must be a Uint16 value`);
    }
}

function assertUint8(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError(`${name} must be a Uint8 value`);
    }
}

function assertQuantizedCoordinate(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > HYDROLOGY_REGION_SIZE * HYDROLOGY_COORDINATE_SCALE) {
        throw new RangeError(`${name} lies outside the hydrology region coordinate domain`);
    }
}

function assertEndpoint(value: RiverEndpoint): void {
    if (!value || !["source", "confluence", "boundary", "mouth"].includes(value.kind)
        || typeof value.connectionId !== "string"
        || Object.getOwnPropertyNames(value).some(name => name !== "kind" && name !== "connectionId")) {
        throw new TypeError("river segment contains an invalid endpoint");
    }
}

function assertProfileArrays(segment: RiverFeatureSegment): void {
    if (!(segment.controlPoints instanceof Int16Array) || segment.controlPoints.length < 4
        || segment.controlPoints.length % 2 !== 0) {
        throw new TypeError("river controlPoints must contain at least two Int16 coordinate pairs");
    }
    const pointCount = segment.controlPoints.length / 2;
    if (!(segment.widthProfile instanceof Uint8Array) || segment.widthProfile.length !== pointCount
        || !(segment.levelProfile instanceof Uint16Array) || segment.levelProfile.length !== pointCount) {
        throw new TypeError("river profiles must contain one value per control point");
    }
    for (let index = 0; index < segment.controlPoints.length; index += 2) {
        assertQuantizedCoordinate("river x", segment.controlPoints[index]);
        assertQuantizedCoordinate("river y", segment.controlPoints[index + 1]);
    }
    for (let index = 1; index < segment.levelProfile.length; index += 1) {
        if (segment.levelProfile[index] > segment.levelProfile[index - 1]) {
            throw new TypeError("river level profile must not rise downstream");
        }
    }
    if (segment.widthProfile.some(width => width === 0)) {
        throw new TypeError("river width profile must remain positive");
    }
}

export function assertHydrologyRegion(value: unknown): asserts value is HydrologyRegion {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region must be an object");
    const region = value as HydrologyRegion;
    const allowed = new Set([
        "key", "revision", "validBounds", "boundaryPorts", "rivers", "lakes", "mouths", "bodies"
    ]);
    if (Object.getOwnPropertyNames(region).some(name => !allowed.has(name))) {
        throw new TypeError("hydrology region contains unknown or derived fields");
    }
    assertHydrologyRegionKey(region.key);
    if (region.revision !== HYDROLOGY_REGION_REVISION) {
        throw new TypeError(`base hydrology region revision must be ${HYDROLOGY_REGION_REVISION}`);
    }
    assertHydrologyRegionLocalBounds(region.validBounds);
    if (!Array.isArray(region.boundaryPorts) || region.boundaryPorts.length > HYDROLOGY_MAX_REGION_PORTS
        || !Array.isArray(region.rivers) || region.rivers.length > HYDROLOGY_MAX_REGION_RIVERS
        || !Array.isArray(region.lakes) || region.lakes.length > HYDROLOGY_MAX_REGION_LAKES
        || !Array.isArray(region.mouths) || region.mouths.length > HYDROLOGY_MAX_REGION_MOUTHS
        || !Array.isArray(region.bodies) || region.bodies.length > HYDROLOGY_MAX_REGION_BODIES) {
        throw new RangeError("hydrology region exceeds a frozen feature budget");
    }

    const bodies = new Map<HydrologyBodyId, HydrologyBodyRef>();
    for (const body of region.bodies) {
        assertId("hydrology bodyId", body?.bodyId);
        if (bodies.has(body.bodyId) || !["ocean", "lake", "river"].includes(body.kind)) {
            throw new TypeError("hydrology region contains a duplicate or invalid body");
        }
        assertUint8("hydrology body profileIndex", body.profileIndex);
        if ((body.kind === "ocean") !== (body.bodyId === OCEAN_BODY_ID)) {
            throw new TypeError("reserved ocean body identity is inconsistent");
        }
        bodies.set(body.bodyId, body);
    }

    const portIds = new Set<string>();
    const portConnections = new Map<string, HydrologyPort>();
    const portConnectionCounts = new Map<string, number>();
    for (const port of region.boundaryPorts) {
        assertId("hydrology portId", port?.portId);
        assertId("hydrology port connectionId", port.connectionId);
        assertId("hydrology port edgeId", port.edgeId);
        assertId("hydrology port riverId", port.riverId);
        assertId("hydrology port bodyId", port.bodyId);
        if (portIds.has(port.portId) || !["west", "east", "north", "south"].includes(port.side)
            || (port.flow !== "in" && port.flow !== "out")) {
            throw new TypeError("hydrology region contains a duplicate or invalid boundary port");
        }
        assertQuantizedCoordinate("hydrology port x", port.x);
        assertQuantizedCoordinate("hydrology port y", port.y);
        if ((port.side === "west" && port.x !== region.validBounds.minX * HYDROLOGY_COORDINATE_SCALE)
            || (port.side === "east" && port.x !== region.validBounds.maxXExclusive * HYDROLOGY_COORDINATE_SCALE)
            || (port.side === "north" && port.y !== region.validBounds.minY * HYDROLOGY_COORDINATE_SCALE)
            || (port.side === "south" && port.y !== region.validBounds.maxYExclusive * HYDROLOGY_COORDINATE_SCALE)) {
            throw new TypeError("hydrology port does not lie on its declared region boundary");
        }
        if (!Number.isInteger(port.flowX) || port.flowX < -127 || port.flowX > 127
            || !Number.isInteger(port.flowY) || port.flowY < -127 || port.flowY > 127) {
            throw new RangeError("hydrology port flow must use signed normalized bytes");
        }
        assertUint8("hydrology port width", port.width);
        assertUint16("hydrology port level", port.level);
        if (!Number.isInteger(port.dischargeClass) || port.dischargeClass < 0
            || port.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
            throw new RangeError("hydrology port discharge class is invalid");
        }
        const riverBody = bodies.get(port.riverId);
        if (!riverBody || riverBody.kind !== "river" || port.bodyId !== port.riverId) {
            throw new TypeError("hydrology port does not reference its river body");
        }
        const previous = portConnections.get(port.connectionId);
        if (previous && (previous.edgeId !== port.edgeId || previous.riverId !== port.riverId
            || previous.level !== port.level || previous.width !== port.width
            || previous.dischargeClass !== port.dischargeClass || previous.flow === port.flow
            || previous.flowX !== port.flowX || previous.flowY !== port.flowY)) {
            throw new TypeError("matching hydrology ports disagree on their connection contract");
        }
        portConnections.set(port.connectionId, port);
        portConnectionCounts.set(port.connectionId, (portConnectionCounts.get(port.connectionId) ?? 0) + 1);
        portIds.add(port.portId);
    }

    const segmentIds = new Set<string>();
    const boundaryEndpointCounts = new Map<string, number>();
    const mouthEndpoints = new Map<string, {
        riverId: string;
        x: number;
        y: number;
        width: number;
        level: number;
    }>();
    let controlPointCount = 0;
    for (const segment of region.rivers) {
        assertId("riverId", segment?.riverId);
        assertId("river segmentId", segment.segmentId);
        assertId("river edgeId", segment.edgeId);
        if (segmentIds.has(segment.segmentId) || bodies.get(segment.riverId)?.kind !== "river"
            || !Number.isInteger(segment.dischargeClass) || segment.dischargeClass < 0
            || segment.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
            throw new TypeError("hydrology region contains a duplicate or invalid river segment");
        }
        assertProfileArrays(segment);
        assertEndpoint(segment.entry);
        assertEndpoint(segment.exit);
        if (segment.entry.kind === "mouth" || segment.exit.kind === "source") {
            throw new TypeError("river segment endpoint direction is topologically invalid");
        }
        if (segment.entry.kind === "boundary" && !portConnections.has(segment.entry.connectionId)
            || segment.exit.kind === "boundary" && !portConnections.has(segment.exit.connectionId)) {
            throw new TypeError("river boundary endpoint does not reference a serialized port");
        }
        for (const endpoint of [segment.entry, segment.exit]) {
            if (endpoint.kind === "boundary") {
                boundaryEndpointCounts.set(
                    endpoint.connectionId,
                    (boundaryEndpointCounts.get(endpoint.connectionId) ?? 0) + 1
                );
            }
        }
        if (segment.exit.kind === "mouth") {
            if (mouthEndpoints.has(segment.exit.connectionId)) {
                throw new TypeError("multiple river segments claim the same mouth endpoint");
            }
            mouthEndpoints.set(segment.exit.connectionId, {
                riverId: segment.riverId,
                x: segment.controlPoints[segment.controlPoints.length - 2],
                y: segment.controlPoints[segment.controlPoints.length - 1],
                width: segment.widthProfile[segment.widthProfile.length - 1],
                level: segment.levelProfile[segment.levelProfile.length - 1]
            });
        }
        controlPointCount += segment.controlPoints.length / 2;
        segmentIds.add(segment.segmentId);
    }
    if (controlPointCount > HYDROLOGY_MAX_REGION_CONTROL_POINTS) {
        throw new RangeError("hydrology region exceeds the frozen control-point budget");
    }
    for (const [connectionId, portCount] of portConnectionCounts) {
        if (boundaryEndpointCounts.get(connectionId) !== portCount) {
            throw new TypeError("hydrology boundary ports and segment endpoints are not one-to-one");
        }
    }

    const lakeIds = new Set<string>();
    for (const lake of region.lakes) {
        assertId("lakeId", lake?.lakeId);
        assertId("lake bodyId", lake.bodyId);
        if (lakeIds.has(lake.lakeId) || bodies.get(lake.bodyId)?.kind !== "lake"
            || !(lake.boundaryPoints instanceof Int16Array) || lake.boundaryPoints.length < 6
            || lake.boundaryPoints.length % 2 !== 0) {
            throw new TypeError("hydrology region contains a duplicate or invalid lake");
        }
        for (let index = 0; index < lake.boundaryPoints.length; index += 2) {
            assertQuantizedCoordinate("lake x", lake.boundaryPoints[index]);
            assertQuantizedCoordinate("lake y", lake.boundaryPoints[index + 1]);
        }
        assertUint16("lake level", lake.level);
        assertUint8("lake profileIndex", lake.profileIndex);
        lakeIds.add(lake.lakeId);
    }

    const mouthIds = new Set<string>();
    for (const mouth of region.mouths) {
        assertId("river mouthId", mouth?.mouthId);
        assertId("river mouth riverId", mouth.riverId);
        assertId("river mouth targetBodyId", mouth.targetBodyId);
        if (mouthIds.has(mouth.mouthId) || bodies.get(mouth.riverId)?.kind !== "river"
            || !bodies.has(mouth.targetBodyId) || mouth.targetBodyId === mouth.riverId) {
            throw new TypeError("hydrology region contains a duplicate or invalid river mouth");
        }
        assertQuantizedCoordinate("river mouth x", mouth.x);
        assertQuantizedCoordinate("river mouth y", mouth.y);
        assertUint8("river mouth width", mouth.width);
        assertUint16("river mouth level", mouth.level);
        const endpoint = mouthEndpoints.get(mouth.mouthId);
        if (!endpoint || endpoint.riverId !== mouth.riverId || endpoint.x !== mouth.x || endpoint.y !== mouth.y
            || endpoint.width !== mouth.width || endpoint.level !== mouth.level) {
            throw new TypeError("river mouth does not match its terminal segment endpoint");
        }
        mouthIds.add(mouth.mouthId);
    }
    if (mouthIds.size !== mouthEndpoints.size) {
        throw new TypeError("hydrology region contains a mouth endpoint without a mouth feature");
    }
}

export function assertMatchingHydrologyPorts(first: HydrologyPort, second: HydrologyPort): void {
    if (!first || !second || first.portId === second.portId
        || first.connectionId !== second.connectionId || first.edgeId !== second.edgeId
        || first.riverId !== second.riverId || first.bodyId !== second.bodyId
        || first.width !== second.width || first.level !== second.level
        || first.dischargeClass !== second.dischargeClass
        || first.flowX !== second.flowX || first.flowY !== second.flowY
        || first.flow === second.flow) {
        throw new TypeError("hydrology boundary ports do not form one matching graph crossing");
    }
}

export function hydrologyRegionTransferables(region: HydrologyRegion): Transferable[] {
    assertHydrologyRegion(region);
    const buffers = new Set<ArrayBuffer>();
    for (const river of region.rivers) {
        for (const array of [river.controlPoints, river.widthProfile, river.levelProfile]) {
            if (!(array.buffer instanceof ArrayBuffer)) {
                throw new TypeError("hydrology river arrays must use transferable ArrayBuffer storage");
            }
            buffers.add(array.buffer);
        }
    }
    for (const lake of region.lakes) {
        if (!(lake.boundaryPoints.buffer instanceof ArrayBuffer)) {
            throw new TypeError("hydrology lake arrays must use transferable ArrayBuffer storage");
        }
        buffers.add(lake.boundaryPoints.buffer);
    }
    return [...buffers];
}

export function hydrologyRegionVectorBytes(region: HydrologyRegion): number {
    assertHydrologyRegion(region);
    let bytes = 0;
    for (const river of region.rivers) {
        bytes += river.controlPoints.byteLength + river.widthProfile.byteLength + river.levelProfile.byteLength;
    }
    for (const lake of region.lakes) bytes += lake.boundaryPoints.byteLength;
    return bytes;
}

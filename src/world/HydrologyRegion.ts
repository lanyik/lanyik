import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { HYDROLOGY_REGION_FORMAT_VERSION } from "./WorldDescriptorV2";
import { chunkOrigin } from "./WorldGrid";

export const HYDROLOGY_REGION_REVISION = 0;
export const HYDROLOGY_POINT_QUANTIZATION = 64;
export const MAX_HYDROLOGY_REGION_PORTS = 1_024;
export const MAX_HYDROLOGY_REGION_RIVERS = 1_024;
export const MAX_HYDROLOGY_REGION_LAKES = 256;
export const MAX_HYDROLOGY_REGION_MOUTHS = 512;
export const MAX_HYDROLOGY_REGION_BODIES = 1_024;
export const MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS = 64;

export const HYDROLOGY_BOUNDARY_MIN_X = 1;
export const HYDROLOGY_BOUNDARY_MAX_X = 2;
export const HYDROLOGY_BOUNDARY_MIN_Y = 4;
export const HYDROLOGY_BOUNDARY_MAX_Y = 8;

export const OCEAN_HYDROLOGY_PROFILE = 0;
export const LAKE_HYDROLOGY_PROFILE = 1;
export const RIVER_HYDROLOGY_PROFILE = 2;

const ALL_BOUNDARY_BITS = HYDROLOGY_BOUNDARY_MIN_X
    | HYDROLOGY_BOUNDARY_MAX_X
    | HYDROLOGY_BOUNDARY_MIN_Y
    | HYDROLOGY_BOUNDARY_MAX_Y;
const MAX_STABLE_ID_LENGTH = 256;
const MAX_WORLD_IDENTITY_LENGTH = 16_384;

export type HydrologyFeatureId = string;
export type HydrologySegmentId = string;
export type HydrologyBodyId = string;
export type HydrologyConnectionId = string;
export type HydrologyBodyKind = "ocean" | "lake" | "river";
export type HydrologyRegionTopology = "finite" | "toroidal" | "infinite";

export interface HydrologyRegionKey {
    readonly regionX: number;
    readonly regionY: number;
}

export interface HydrologyRegionValidBounds {
    readonly minX: 0;
    readonly minY: 0;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

export type RiverEndpoint =
    | Readonly<{ kind: "node"; nodeId: string }>
    | Readonly<{ kind: "port"; connectionId: HydrologyConnectionId }>
    | Readonly<{ kind: "body"; bodyId: HydrologyBodyId }>;

export interface HydrologyPort {
    readonly connectionId: HydrologyConnectionId;
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly endpoint: "entry" | "exit";
    readonly boundaryMask: number;
    readonly point: Int16Array;
    readonly canonicalTileX: number;
    readonly canonicalTileY: number;
    readonly flowDirection: Int8Array;
    readonly widthClass: number;
    readonly level: number;
    readonly dischargeClass: number;
}

export interface RiverFeatureSegment {
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly controlPoints: Int16Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly dischargeClass: number;
    readonly entry: RiverEndpoint;
    readonly exit: RiverEndpoint;
}

export interface LakeFeature {
    readonly featureId: HydrologyFeatureId;
    readonly bodyId: HydrologyBodyId;
    readonly center: Int16Array;
    readonly radius: number;
    readonly level: number;
    readonly profileIndex: number;
}

export interface RiverMouthFeature {
    readonly mouthId: HydrologyFeatureId;
    readonly riverId: HydrologyFeatureId;
    readonly segmentId: HydrologySegmentId;
    readonly targetBodyId: HydrologyBodyId;
    readonly point: Int16Array;
    readonly widthClass: number;
    readonly dischargeClass: number;
}

export interface HydrologyBodyRef {
    readonly bodyId: HydrologyBodyId;
    readonly kind: HydrologyBodyKind;
    readonly profileIndex: number;
}

export interface HydrologyRegion {
    readonly formatVersion: typeof HYDROLOGY_REGION_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly topology: HydrologyRegionTopology;
    readonly key: HydrologyRegionKey;
    readonly revision: number;
    readonly validBounds: HydrologyRegionValidBounds;
    readonly boundaryPorts: readonly HydrologyPort[];
    readonly rivers: readonly RiverFeatureSegment[];
    readonly lakes: readonly LakeFeature[];
    readonly mouths: readonly RiverMouthFeature[];
    readonly bodies: readonly HydrologyBodyRef[];
}

export interface HydrologyRegionInput extends Omit<HydrologyRegion,
    "formatVersion" | "key" | "validBounds" | "boundaryPorts" | "rivers" | "lakes" | "mouths" | "bodies"> {
    readonly key: HydrologyRegionKey;
    readonly validBounds: HydrologyRegionValidBounds;
    readonly boundaryPorts: readonly HydrologyPort[];
    readonly rivers: readonly RiverFeatureSegment[];
    readonly lakes: readonly LakeFeature[];
    readonly mouths: readonly RiverMouthFeature[];
    readonly bodies: readonly HydrologyBodyRef[];
}

function assertStableId(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_STABLE_ID_LENGTH
        || !/^[\x21-\x7e]+$/.test(value)) {
        throw new TypeError(`${name} must be a bounded printable ASCII identity`);
    }
}

function assertUint8(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new RangeError(`${name} must be a uint8 value`);
    }
}

function assertUint16(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new RangeError(`${name} must be a uint16 value`);
    }
}

function assertPoint(name: string, point: Int16Array): void {
    if (!(point instanceof Int16Array) || point.length !== 2) {
        throw new TypeError(`${name} must contain one quantized xy pair`);
    }
}

function assertEndpoint(name: string, endpoint: RiverEndpoint): void {
    if (!endpoint || typeof endpoint !== "object") throw new TypeError(`${name} is required`);
    if (endpoint.kind === "node") assertStableId(`${name} node`, endpoint.nodeId);
    else if (endpoint.kind === "port") assertStableId(`${name} connection`, endpoint.connectionId);
    else if (endpoint.kind === "body") assertStableId(`${name} body`, endpoint.bodyId);
    else throw new TypeError(`${name} kind is invalid`);
}

function assertCanonicalOrder<T>(
    name: string,
    values: readonly T[],
    identity: (value: T) => string
): void {
    let previous: string | undefined;
    for (const value of values) {
        const current = identity(value);
        if (previous !== undefined && previous >= current) {
            throw new Error(`${name} must use unique canonical identity order`);
        }
        previous = current;
    }
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

function endpointIdentity(endpoint: RiverEndpoint): string {
    if (endpoint.kind === "node") return `node:${endpoint.nodeId}`;
    if (endpoint.kind === "port") return `port:${endpoint.connectionId}`;
    return `body:${endpoint.bodyId}`;
}

function cloneEndpoint(endpoint: RiverEndpoint): RiverEndpoint {
    if (endpoint.kind === "node") return Object.freeze({ kind: "node", nodeId: endpoint.nodeId });
    if (endpoint.kind === "port") {
        return Object.freeze({ kind: "port", connectionId: endpoint.connectionId });
    }
    return Object.freeze({ kind: "body", bodyId: endpoint.bodyId });
}

function assertPort(port: Readonly<HydrologyPort>, bounds: Readonly<HydrologyRegionValidBounds>): void {
    if (!port || typeof port !== "object") throw new TypeError("hydrology port must be an object");
    assertStableId("hydrology connection", port.connectionId);
    assertStableId("hydrology port river", port.riverId);
    assertStableId("hydrology port segment", port.segmentId);
    if (port.endpoint !== "entry" && port.endpoint !== "exit") {
        throw new TypeError("hydrology port endpoint kind is invalid");
    }
    if (!Number.isInteger(port.boundaryMask) || port.boundaryMask <= 0
        || (port.boundaryMask & ~ALL_BOUNDARY_BITS) !== 0
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0
            && (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0
            && (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0) {
        throw new RangeError("hydrology port boundary mask is invalid");
    }
    assertPoint("hydrology port point", port.point);
    const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
    const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
    if (port.point[0] < 0 || port.point[0] > maximumX || port.point[1] < 0 || port.point[1] > maximumY
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_X) !== 0 && port.point[0] !== 0
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_X) !== 0 && port.point[0] !== maximumX
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MIN_Y) !== 0 && port.point[1] !== 0
        || (port.boundaryMask & HYDROLOGY_BOUNDARY_MAX_Y) !== 0 && port.point[1] !== maximumY) {
        throw new RangeError("hydrology port point does not lie on its declared boundary");
    }
    if (!Number.isSafeInteger(port.canonicalTileX) || !Number.isSafeInteger(port.canonicalTileY)) {
        throw new RangeError("hydrology port canonical point must use safe integer tiles");
    }
    if (!(port.flowDirection instanceof Int8Array) || port.flowDirection.length !== 2
        || port.flowDirection[0] < -1 || port.flowDirection[0] > 1
        || port.flowDirection[1] < -1 || port.flowDirection[1] > 1
        || (port.flowDirection[0] === 0 && port.flowDirection[1] === 0)) {
        throw new RangeError("hydrology port flow direction must be a non-zero canonical step");
    }
    assertUint8("hydrology port width class", port.widthClass);
    assertUint16("hydrology port level", port.level);
    assertUint8("hydrology port discharge class", port.dischargeClass);
    if (port.widthClass === 0) throw new RangeError("hydrology port width class must be positive");
}

function assertRiver(segment: Readonly<RiverFeatureSegment>, bounds: Readonly<HydrologyRegionValidBounds>): void {
    if (!segment || typeof segment !== "object") throw new TypeError("river segment must be an object");
    assertStableId("river identity", segment.riverId);
    assertStableId("river segment identity", segment.segmentId);
    if (!(segment.controlPoints instanceof Int16Array)
        || segment.controlPoints.length < 4 || segment.controlPoints.length % 2 !== 0
        || segment.controlPoints.length / 2 > MAX_HYDROLOGY_SEGMENT_CONTROL_POINTS) {
        throw new TypeError("river control points violate the bounded quantized layout");
    }
    const pointCount = segment.controlPoints.length / 2;
    if (!(segment.widthProfile instanceof Uint8Array) || segment.widthProfile.length !== pointCount
        || !(segment.levelProfile instanceof Uint16Array) || segment.levelProfile.length !== pointCount) {
        throw new TypeError("river profiles must match its control point count");
    }
    const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
    const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const x = segment.controlPoints[pointIndex * 2];
        const y = segment.controlPoints[pointIndex * 2 + 1];
        if (x < 0 || x > maximumX || y < 0 || y > maximumY || segment.widthProfile[pointIndex] === 0) {
            throw new RangeError("river geometry lies outside valid bounds or has zero width");
        }
        if (pointIndex > 0
            && (segment.widthProfile[pointIndex] < segment.widthProfile[pointIndex - 1]
                || segment.levelProfile[pointIndex] > segment.levelProfile[pointIndex - 1])) {
            throw new Error("river width cannot shrink and level cannot rise downstream");
        }
    }
    assertUint8("river discharge class", segment.dischargeClass);
    assertEndpoint("river entry", segment.entry);
    assertEndpoint("river exit", segment.exit);
    if (segment.entry.kind === "body") throw new Error("river entry cannot originate in a terminal body");
    if (endpointIdentity(segment.entry) === endpointIdentity(segment.exit)) {
        throw new Error("river segment endpoints must be distinct");
    }
}

function assertLake(lake: Readonly<LakeFeature>, bounds: Readonly<HydrologyRegionValidBounds>): void {
    if (!lake || typeof lake !== "object") throw new TypeError("lake feature must be an object");
    assertStableId("lake feature identity", lake.featureId);
    assertStableId("lake body identity", lake.bodyId);
    assertPoint("lake center", lake.center);
    assertUint16("lake radius", lake.radius);
    assertUint16("lake level", lake.level);
    assertUint8("lake profile", lake.profileIndex);
    if (lake.radius === 0) throw new RangeError("lake radius must be positive");
    const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
    const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
    if (lake.center[0] + lake.radius < 0 || lake.center[0] - lake.radius > maximumX
        || lake.center[1] + lake.radius < 0 || lake.center[1] - lake.radius > maximumY) {
        throw new RangeError("lake feature does not intersect its region");
    }
}

function assertMouth(mouth: Readonly<RiverMouthFeature>, bounds: Readonly<HydrologyRegionValidBounds>): void {
    if (!mouth || typeof mouth !== "object") throw new TypeError("river mouth must be an object");
    assertStableId("river mouth identity", mouth.mouthId);
    assertStableId("river mouth river", mouth.riverId);
    assertStableId("river mouth segment", mouth.segmentId);
    assertStableId("river mouth target body", mouth.targetBodyId);
    assertPoint("river mouth point", mouth.point);
    const maximumX = bounds.maxXExclusive * HYDROLOGY_POINT_QUANTIZATION;
    const maximumY = bounds.maxYExclusive * HYDROLOGY_POINT_QUANTIZATION;
    if (mouth.point[0] < 0 || mouth.point[0] > maximumX
        || mouth.point[1] < 0 || mouth.point[1] > maximumY) {
        throw new RangeError("river mouth lies outside its region");
    }
    assertUint8("river mouth width class", mouth.widthClass);
    assertUint8("river mouth discharge class", mouth.dischargeClass);
    if (mouth.widthClass === 0) throw new RangeError("river mouth width class must be positive");
}

function assertBody(body: Readonly<HydrologyBodyRef>): void {
    if (!body || typeof body !== "object") throw new TypeError("hydrology body reference must be an object");
    assertStableId("hydrology body identity", body.bodyId);
    if (body.kind !== "ocean" && body.kind !== "lake" && body.kind !== "river") {
        throw new TypeError("hydrology body kind is invalid");
    }
    assertUint8("hydrology body profile", body.profileIndex);
}

export function assertHydrologyRegion(region: Readonly<HydrologyRegion>): void {
    if (!region || typeof region !== "object" || region.formatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
        throw new TypeError("hydrology region format version is unsupported");
    }
    if (typeof region.worldIdentity !== "string" || region.worldIdentity.length === 0
        || region.worldIdentity.length > MAX_WORLD_IDENTITY_LENGTH) {
        throw new TypeError("hydrology region world identity is invalid");
    }
    if (region.topology !== "finite" && region.topology !== "toroidal" && region.topology !== "infinite") {
        throw new TypeError("hydrology region topology is invalid");
    }
    if (!region.key || !Number.isSafeInteger(region.key.regionX) || !Number.isSafeInteger(region.key.regionY)
        || region.topology !== "infinite" && (region.key.regionX < 0 || region.key.regionY < 0)) {
        throw new RangeError("hydrology region key is invalid for its topology");
    }
    chunkOrigin(region.key.regionX, region.key.regionY, HYDROLOGY_REGION_SIZE);
    if (!Number.isSafeInteger(region.revision) || region.revision < 0) {
        throw new RangeError("hydrology region revision must be a non-negative safe integer");
    }
    const bounds = region.validBounds;
    if (!bounds || bounds.minX !== 0 || bounds.minY !== 0
        || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive)
        || bounds.maxXExclusive <= 0 || bounds.maxXExclusive > HYDROLOGY_REGION_SIZE
        || bounds.maxYExclusive <= 0 || bounds.maxYExclusive > HYDROLOGY_REGION_SIZE) {
        throw new RangeError("hydrology region valid bounds are invalid");
    }
    if (!Array.isArray(region.boundaryPorts) || region.boundaryPorts.length > MAX_HYDROLOGY_REGION_PORTS
        || !Array.isArray(region.rivers) || region.rivers.length > MAX_HYDROLOGY_REGION_RIVERS
        || !Array.isArray(region.lakes) || region.lakes.length > MAX_HYDROLOGY_REGION_LAKES
        || !Array.isArray(region.mouths) || region.mouths.length > MAX_HYDROLOGY_REGION_MOUTHS
        || !Array.isArray(region.bodies) || region.bodies.length > MAX_HYDROLOGY_REGION_BODIES) {
        throw new RangeError("hydrology region feature counts exceed the frozen budgets");
    }
    for (const port of region.boundaryPorts) assertPort(port, bounds);
    for (const river of region.rivers) assertRiver(river, bounds);
    for (const lake of region.lakes) assertLake(lake, bounds);
    for (const mouth of region.mouths) assertMouth(mouth, bounds);
    for (const body of region.bodies) assertBody(body);
    assertCanonicalOrder("hydrology ports", region.boundaryPorts, port => `${port.connectionId}:${port.endpoint}`);
    assertCanonicalOrder("river segments", region.rivers, river => river.segmentId);
    assertCanonicalOrder("lake features", region.lakes, lake => lake.featureId);
    assertCanonicalOrder("river mouths", region.mouths, mouth => mouth.mouthId);
    assertCanonicalOrder("hydrology bodies", region.bodies, body => body.bodyId);

    const bodies = new Map(region.bodies.map(body => [body.bodyId, body]));
    const rivers = new Map(region.rivers.map(river => [river.segmentId, river]));
    const portsBySegmentEndpoint = new Set<string>();
    for (const port of region.boundaryPorts) {
        const segment = rivers.get(port.segmentId);
        if (!segment || segment.riverId !== port.riverId
            || bodies.get(port.riverId)?.kind !== "river") {
            throw new Error("hydrology port references an unknown river segment or body");
        }
        const endpoint = port.endpoint === "entry" ? segment.entry : segment.exit;
        if (endpoint.kind !== "port" || endpoint.connectionId !== port.connectionId) {
            throw new Error("hydrology port does not match its river endpoint");
        }
        const pointOffset = port.endpoint === "entry" ? 0 : segment.controlPoints.length - 2;
        const profileIndex = port.endpoint === "entry" ? 0 : segment.widthProfile.length - 1;
        const segmentDirectionX = Math.sign(
            segment.controlPoints[segment.controlPoints.length - 2] - segment.controlPoints[0]
        );
        const segmentDirectionY = Math.sign(
            segment.controlPoints[segment.controlPoints.length - 1] - segment.controlPoints[1]
        );
        if (port.point[0] !== segment.controlPoints[pointOffset]
            || port.point[1] !== segment.controlPoints[pointOffset + 1]
            || port.flowDirection[0] !== segmentDirectionX
            || port.flowDirection[1] !== segmentDirectionY
            || port.widthClass !== segment.widthProfile[profileIndex]
            || port.level !== segment.levelProfile[profileIndex]
            || port.dischargeClass !== segment.dischargeClass) {
            throw new Error("hydrology port geometry or flow class does not match its segment");
        }
        const endpointKey = `${port.segmentId}:${port.endpoint}`;
        if (portsBySegmentEndpoint.has(endpointKey)) {
            throw new Error("river segment endpoint has duplicate boundary ports");
        }
        portsBySegmentEndpoint.add(endpointKey);
    }
    for (const segment of region.rivers) {
        if (bodies.get(segment.riverId)?.kind !== "river") {
            throw new Error("river segment has no matching river body");
        }
        for (const [kind, endpoint] of [["entry", segment.entry], ["exit", segment.exit]] as const) {
            if (endpoint.kind === "port" && !portsBySegmentEndpoint.has(`${segment.segmentId}:${kind}`)) {
                throw new Error("river boundary endpoint has no matching port");
            }
            if (endpoint.kind === "body" && !bodies.has(endpoint.bodyId)) {
                throw new Error("river terminal endpoint references an unknown body");
            }
        }
    }
    for (const lake of region.lakes) {
        const body = bodies.get(lake.bodyId);
        if (body?.kind !== "lake" || body.profileIndex !== lake.profileIndex) {
            throw new Error("lake feature has no matching lake body");
        }
    }
    const mouthBySegment = new Set<string>();
    for (const mouth of region.mouths) {
        const segment = rivers.get(mouth.segmentId);
        if (!segment || segment.riverId !== mouth.riverId
            || segment.exit.kind !== "body" || segment.exit.bodyId !== mouth.targetBodyId
            || bodies.get(mouth.riverId)?.kind !== "river"
            || (bodies.get(mouth.targetBodyId)?.kind !== "ocean"
                && bodies.get(mouth.targetBodyId)?.kind !== "lake")
            || mouth.point[0] !== segment.controlPoints[segment.controlPoints.length - 2]
            || mouth.point[1] !== segment.controlPoints[segment.controlPoints.length - 1]
            || mouth.widthClass !== segment.widthProfile[segment.widthProfile.length - 1]
            || mouth.dischargeClass !== segment.dischargeClass
            || mouthBySegment.has(mouth.segmentId)) {
            throw new Error("river mouth does not match one terminal river segment");
        }
        mouthBySegment.add(mouth.segmentId);
    }
    for (const segment of region.rivers) {
        if (segment.exit.kind === "body" && !mouthBySegment.has(segment.segmentId)) {
            throw new Error("terminal river segment has no mouth feature");
        }
    }
}

function clonePort(port: Readonly<HydrologyPort>): HydrologyPort {
    return Object.freeze({ ...port });
}

function cloneRiver(river: Readonly<RiverFeatureSegment>): RiverFeatureSegment {
    return Object.freeze({ ...river, entry: cloneEndpoint(river.entry), exit: cloneEndpoint(river.exit) });
}

export function createHydrologyRegion(input: Readonly<HydrologyRegionInput>): HydrologyRegion {
    if (!input || typeof input !== "object") throw new TypeError("hydrology region input is required");
    const boundaryPorts = input.boundaryPorts.map(clonePort)
        .sort((first, second) => compareIdentity(
            `${first.connectionId}:${first.endpoint}`,
            `${second.connectionId}:${second.endpoint}`
        ));
    const rivers = input.rivers.map(cloneRiver)
        .sort((first, second) => compareIdentity(first.segmentId, second.segmentId));
    const lakes = input.lakes.map(lake => Object.freeze({ ...lake }))
        .sort((first, second) => compareIdentity(first.featureId, second.featureId));
    const mouths = input.mouths.map(mouth => Object.freeze({ ...mouth }))
        .sort((first, second) => compareIdentity(first.mouthId, second.mouthId));
    const bodies = input.bodies.map(body => Object.freeze({ ...body }))
        .sort((first, second) => compareIdentity(first.bodyId, second.bodyId));
    const region: HydrologyRegion = Object.freeze({
        formatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
        worldIdentity: input.worldIdentity,
        topology: input.topology,
        key: Object.freeze({ regionX: input.key.regionX, regionY: input.key.regionY }),
        revision: input.revision,
        validBounds: Object.freeze({
            minX: 0,
            minY: 0,
            maxXExclusive: input.validBounds.maxXExclusive,
            maxYExclusive: input.validBounds.maxYExclusive
        }),
        boundaryPorts: Object.freeze(boundaryPorts),
        rivers: Object.freeze(rivers),
        lakes: Object.freeze(lakes),
        mouths: Object.freeze(mouths),
        bodies: Object.freeze(bodies)
    });
    assertHydrologyRegion(region);
    return region;
}

export function hydrologyPortConnectionSignature(port: Readonly<HydrologyPort>): string {
    assertStableId("hydrology connection", port.connectionId);
    assertStableId("hydrology port river", port.riverId);
    if (!Number.isSafeInteger(port.canonicalTileX) || !Number.isSafeInteger(port.canonicalTileY)
        || !(port.flowDirection instanceof Int8Array) || port.flowDirection.length !== 2) {
        throw new TypeError("hydrology port is not valid for a connection signature");
    }
    return JSON.stringify([
        port.connectionId,
        port.riverId,
        port.canonicalTileX,
        port.canonicalTileY,
        port.flowDirection[0],
        port.flowDirection[1],
        port.widthClass,
        port.level,
        port.dischargeClass
    ]);
}

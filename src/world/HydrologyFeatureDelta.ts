import { HYDROLOGY_POINT_QUANTIZATION } from "./HydrologyRegion";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";

export const HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION = 1;
export const MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS = 256;
export const MAX_AUTHORED_LAKE_POLYGON_POINTS = 256;
export const MAX_AUTHORED_HYDROLOGY_ID_LENGTH = 256;
export const MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH = 16_384;
export const HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES = 48;

const HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC = 0x3244_4648; // HFD2, little-endian.
const SERIALIZED_OPERATION_DELETE = 0;
const SERIALIZED_OPERATION_UPSERT = 1;
const SERIALIZED_FEATURE_RIVER = 1;
const SERIALIZED_FEATURE_LAKE = 2;
const SERIALIZED_SOURCE_NONE = 0;
const SERIALIZED_SOURCE_SPRING = 1;
const SERIALIZED_SOURCE_RIVER = 2;
const SERIALIZED_OUTLET_NONE = 0;
const SERIALIZED_OUTLET_OCEAN = 1;
const SERIALIZED_OUTLET_LAKE = 2;
const SERIALIZED_OUTLET_RIVER = 3;

export type AuthoredHydrologyFeatureKind = "river" | "lake";

export type AuthoredRiverSource = Readonly<
    { readonly kind: "spring"; readonly sourceId: string }
    | { readonly kind: "river"; readonly riverId: string }
>;

export type AuthoredRiverOutlet = Readonly<
    { readonly kind: "ocean"; readonly bodyId: "ocean" }
    | { readonly kind: "lake"; readonly bodyId: string }
    | { readonly kind: "river"; readonly riverId: string }
>;

export interface AuthoredRiverFeature {
    readonly kind: "river";
    readonly featureId: string;
    readonly source: AuthoredRiverSource;
    readonly outlet: AuthoredRiverOutlet;
    readonly controlPoints: Float64Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly dischargeClass: number;
    readonly profileIndex: number;
}

export interface AuthoredLakeFeature {
    readonly kind: "lake";
    readonly featureId: string;
    readonly polygon: Float64Array;
    readonly level: number;
    readonly profileIndex: number;
}

export type AuthoredHydrologyFeature = AuthoredRiverFeature | AuthoredLakeFeature;

interface HydrologyFeatureDeltaBase {
    readonly formatVersion: typeof HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION;
    readonly worldIdentity: string;
    readonly revision: number;
    readonly featureId: string;
    readonly featureKind: AuthoredHydrologyFeatureKind;
}

export interface HydrologyFeatureUpsertDelta extends HydrologyFeatureDeltaBase {
    readonly operation: "upsert";
    readonly feature: AuthoredHydrologyFeature;
}

export interface HydrologyFeatureDeleteDelta extends HydrologyFeatureDeltaBase {
    readonly operation: "delete";
}

export type HydrologyFeatureDelta = HydrologyFeatureUpsertDelta | HydrologyFeatureDeleteDelta;

export type HydrologyFeatureDeltaInput = Omit<HydrologyFeatureUpsertDelta, "formatVersion">
    | Omit<HydrologyFeatureDeleteDelta, "formatVersion">;

interface QuantizedPoint {
    readonly x: number;
    readonly y: number;
}

function assertStableId(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0
        || value.length > MAX_AUTHORED_HYDROLOGY_ID_LENGTH
        || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError(`${name} must be a canonical stable identity`);
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

function pointAt(points: Float64Array, index: number): QuantizedPoint {
    return { x: points[index * 2], y: points[index * 2 + 1] };
}

function comparePoint(first: QuantizedPoint, second: QuantizedPoint): number {
    return first.x - second.x || first.y - second.y;
}

function assertQuantizedPoints(name: string, points: Float64Array, minimum: number, maximum: number): void {
    if (!(points instanceof Float64Array) || points.length % 2 !== 0
        || points.length / 2 < minimum || points.length / 2 > maximum) {
        throw new TypeError(`${name} does not match its bounded q64 layout`);
    }
    for (const coordinate of points) {
        if (!Number.isSafeInteger(coordinate)) {
            throw new RangeError(`${name} coordinates must be safe q64 integers`);
        }
    }
}

function orientation(first: QuantizedPoint, second: QuantizedPoint, third: QuantizedPoint): bigint {
    const firstX = BigInt(first.x);
    const firstY = BigInt(first.y);
    const secondX = BigInt(second.x);
    const secondY = BigInt(second.y);
    const thirdX = BigInt(third.x);
    const thirdY = BigInt(third.y);
    return (secondX - firstX) * (thirdY - firstY) - (secondY - firstY) * (thirdX - firstX);
}

function between(value: number, first: number, second: number): boolean {
    return value >= Math.min(first, second) && value <= Math.max(first, second);
}

function pointOnSegment(point: QuantizedPoint, first: QuantizedPoint, second: QuantizedPoint): boolean {
    return orientation(first, second, point) === 0n
        && between(point.x, first.x, second.x) && between(point.y, first.y, second.y);
}

function segmentsIntersect(
    firstStart: QuantizedPoint,
    firstEnd: QuantizedPoint,
    secondStart: QuantizedPoint,
    secondEnd: QuantizedPoint
): boolean {
    const firstOrientation = orientation(firstStart, firstEnd, secondStart);
    const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
    const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
    const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
    if ((firstOrientation > 0n && secondOrientation < 0n
            || firstOrientation < 0n && secondOrientation > 0n)
        && (thirdOrientation > 0n && fourthOrientation < 0n
            || thirdOrientation < 0n && fourthOrientation > 0n)) return true;
    return firstOrientation === 0n && pointOnSegment(secondStart, firstStart, firstEnd)
        || secondOrientation === 0n && pointOnSegment(secondEnd, firstStart, firstEnd)
        || thirdOrientation === 0n && pointOnSegment(firstStart, secondStart, secondEnd)
        || fourthOrientation === 0n && pointOnSegment(firstEnd, secondStart, secondEnd);
}

function adjacentSegmentsOverlap(
    previous: QuantizedPoint,
    current: QuantizedPoint,
    next: QuantizedPoint
): boolean {
    return orientation(previous, current, next) === 0n
        && (pointOnSegment(next, previous, current) || pointOnSegment(previous, current, next));
}

function polygonTwiceArea(points: Float64Array): bigint {
    let area = 0n;
    const pointCount = points.length / 2;
    for (let index = 0; index < pointCount; index += 1) {
        const current = pointAt(points, index);
        const next = pointAt(points, (index + 1) % pointCount);
        area += BigInt(current.x) * BigInt(next.y) - BigInt(current.y) * BigInt(next.x);
    }
    return area;
}

function assertSimpleCanonicalPolygon(points: Float64Array): void {
    const pointCount = points.length / 2;
    const identities = new Set<string>();
    let minimumIndex = 0;
    for (let index = 0; index < pointCount; index += 1) {
        const point = pointAt(points, index);
        const identity = `${point.x}:${point.y}`;
        if (identities.has(identity)) throw new Error("authored lake polygon contains a repeated vertex");
        identities.add(identity);
        if (comparePoint(point, pointAt(points, minimumIndex)) < 0) minimumIndex = index;
    }
    for (let index = 0; index < pointCount; index += 1) {
        if (adjacentSegmentsOverlap(
            pointAt(points, (index - 1 + pointCount) % pointCount),
            pointAt(points, index),
            pointAt(points, (index + 1) % pointCount)
        )) {
            throw new Error("authored lake polygon cannot contain overlapping adjacent edges");
        }
    }
    if (minimumIndex !== 0) throw new Error("authored lake polygon must start at its lexicographic minimum");
    if (polygonTwiceArea(points) <= 0n) {
        throw new Error("authored lake polygon must be non-degenerate and counter-clockwise");
    }
    for (let firstIndex = 0; firstIndex < pointCount; firstIndex += 1) {
        const firstNext = (firstIndex + 1) % pointCount;
        const firstStart = pointAt(points, firstIndex);
        const firstEnd = pointAt(points, firstNext);
        for (let secondIndex = firstIndex + 1; secondIndex < pointCount; secondIndex += 1) {
            const secondNext = (secondIndex + 1) % pointCount;
            if (secondIndex === firstIndex || secondIndex === firstNext
                || secondNext === firstIndex) continue;
            if (segmentsIntersect(firstStart, firstEnd, pointAt(points, secondIndex), pointAt(points, secondNext))) {
                throw new Error("authored lake polygon must be simple and non-self-intersecting");
            }
        }
    }
}

function assertSimpleRiverLine(points: Float64Array): void {
    const pointCount = points.length / 2;
    const identities = new Set<string>();
    for (let index = 0; index < pointCount; index += 1) {
        const point = pointAt(points, index);
        const identity = `${point.x}:${point.y}`;
        if (identities.has(identity)) throw new Error("authored river contains a repeated control point");
        identities.add(identity);
    }
    for (let index = 1; index < pointCount - 1; index += 1) {
        if (adjacentSegmentsOverlap(
            pointAt(points, index - 1),
            pointAt(points, index),
            pointAt(points, index + 1)
        )) {
            throw new Error("authored river cannot contain overlapping adjacent spans");
        }
    }
    for (let firstIndex = 0; firstIndex < pointCount - 1; firstIndex += 1) {
        const firstStart = pointAt(points, firstIndex);
        const firstEnd = pointAt(points, firstIndex + 1);
        for (let secondIndex = firstIndex + 2; secondIndex < pointCount - 1; secondIndex += 1) {
            if (segmentsIntersect(
                firstStart,
                firstEnd,
                pointAt(points, secondIndex),
                pointAt(points, secondIndex + 1)
            )) {
                throw new Error("authored river must be a simple non-self-intersecting line");
            }
        }
    }
}

function canonicalPolygon(input: Float64Array): Float64Array {
    assertQuantizedPoints(
        "authored lake polygon",
        input,
        3,
        MAX_AUTHORED_LAKE_POLYGON_POINTS
    );
    const pointCount = input.length / 2;
    const identities = new Set<string>();
    let minimumIndex = 0;
    for (let index = 0; index < pointCount; index += 1) {
        const point = pointAt(input, index);
        const identity = `${point.x}:${point.y}`;
        if (identities.has(identity)) throw new Error("authored lake polygon contains a repeated vertex");
        identities.add(identity);
        if (comparePoint(point, pointAt(input, minimumIndex)) < 0) minimumIndex = index;
    }
    const area = polygonTwiceArea(input);
    const counterClockwise = area > 0n;
    if (area === 0n) throw new Error("authored lake polygon is degenerate");
    const output = new Float64Array(input.length);
    for (let targetIndex = 0; targetIndex < pointCount; targetIndex += 1) {
        const sourceIndex = counterClockwise
            ? (minimumIndex + targetIndex) % pointCount
            : (minimumIndex - targetIndex + pointCount) % pointCount;
        output[targetIndex * 2] = input[sourceIndex * 2];
        output[targetIndex * 2 + 1] = input[sourceIndex * 2 + 1];
    }
    assertSimpleCanonicalPolygon(output);
    return output;
}

function cloneSource(source: AuthoredRiverSource): AuthoredRiverSource {
    return source.kind === "spring"
        ? Object.freeze({ kind: "spring", sourceId: source.sourceId })
        : Object.freeze({ kind: "river", riverId: source.riverId });
}

function cloneOutlet(outlet: AuthoredRiverOutlet): AuthoredRiverOutlet {
    if (outlet.kind === "river") return Object.freeze({ kind: "river", riverId: outlet.riverId });
    return Object.freeze({ kind: outlet.kind, bodyId: outlet.bodyId }) as AuthoredRiverOutlet;
}

export function assertAuthoredRiverFeature(feature: Readonly<AuthoredRiverFeature>): void {
    if (!feature || typeof feature !== "object" || feature.kind !== "river") {
        throw new TypeError("authored river feature is invalid");
    }
    assertStableId("authored river feature", feature.featureId);
    if (feature.featureId === OCEAN_BODY_ID) {
        throw new Error("authored river cannot use the reserved ocean body identity");
    }
    assertQuantizedPoints(
        "authored river control points",
        feature.controlPoints,
        2,
        MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS
    );
    const pointCount = feature.controlPoints.length / 2;
    if (!(feature.widthProfile instanceof Uint8Array) || feature.widthProfile.length !== pointCount
        || !(feature.levelProfile instanceof Uint16Array) || feature.levelProfile.length !== pointCount) {
        throw new TypeError("authored river profiles must match its control point count");
    }
    assertSimpleRiverLine(feature.controlPoints);
    if (!feature.source || typeof feature.source !== "object") {
        throw new TypeError("authored river source is required");
    }
    if (feature.source.kind === "spring") assertStableId("authored river spring", feature.source.sourceId);
    else if (feature.source.kind === "river") {
        assertStableId("authored river source river", feature.source.riverId);
        if (feature.source.riverId === feature.featureId) throw new Error("authored river cannot source from itself");
    } else throw new TypeError("authored river source kind is invalid");
    if (!feature.outlet || typeof feature.outlet !== "object") {
        throw new TypeError("authored river outlet is required");
    }
    if (feature.outlet.kind === "ocean") {
        if (feature.outlet.bodyId !== OCEAN_BODY_ID) {
            throw new Error("authored ocean outlet must use the ocean body");
        }
    } else if (feature.outlet.kind === "lake") {
        assertStableId("authored river outlet lake", feature.outlet.bodyId);
        if (feature.outlet.bodyId === OCEAN_BODY_ID) {
            throw new Error("authored lake outlet cannot use the reserved ocean body identity");
        }
    } else if (feature.outlet.kind === "river") {
        assertStableId("authored river outlet river", feature.outlet.riverId);
        if (feature.outlet.riverId === OCEAN_BODY_ID) {
            throw new Error("authored river outlet cannot use the reserved ocean body identity");
        }
        if (feature.outlet.riverId === feature.featureId) throw new Error("authored river cannot outlet to itself");
    } else throw new TypeError("authored river outlet kind is invalid");
    for (let index = 0; index < pointCount; index += 1) {
        if (feature.widthProfile[index] === 0) throw new RangeError("authored river width must be positive");
        if (index > 0) {
            const previous = pointAt(feature.controlPoints, index - 1);
            const current = pointAt(feature.controlPoints, index);
            if (previous.x === current.x && previous.y === current.y) {
                throw new Error("authored river cannot contain a zero-length span");
            }
            if (feature.widthProfile[index] < feature.widthProfile[index - 1]
                || feature.levelProfile[index] > feature.levelProfile[index - 1]) {
                throw new Error("authored river cannot narrow or rise downstream");
            }
        }
    }
    assertUint8("authored river discharge class", feature.dischargeClass);
    assertUint8("authored river profile", feature.profileIndex);
}

export function createAuthoredRiverFeature(
    input: Omit<AuthoredRiverFeature, "kind">
): AuthoredRiverFeature {
    if (!input || typeof input !== "object") throw new TypeError("authored river input is required");
    if (!input.source || typeof input.source !== "object") {
        throw new TypeError("authored river source is required");
    }
    if (!input.outlet || typeof input.outlet !== "object") {
        throw new TypeError("authored river outlet is required");
    }
    const feature: AuthoredRiverFeature = Object.freeze({
        kind: "river",
        featureId: input.featureId,
        source: cloneSource(input.source),
        outlet: cloneOutlet(input.outlet),
        controlPoints: input.controlPoints,
        widthProfile: input.widthProfile,
        levelProfile: input.levelProfile,
        dischargeClass: input.dischargeClass,
        profileIndex: input.profileIndex
    });
    assertAuthoredRiverFeature(feature);
    return feature;
}

export function assertAuthoredLakeFeature(feature: Readonly<AuthoredLakeFeature>): void {
    if (!feature || typeof feature !== "object" || feature.kind !== "lake") {
        throw new TypeError("authored lake feature is invalid");
    }
    assertStableId("authored lake feature", feature.featureId);
    if (feature.featureId === OCEAN_BODY_ID) {
        throw new Error("authored lake cannot use the reserved ocean body identity");
    }
    assertQuantizedPoints(
        "authored lake polygon",
        feature.polygon,
        3,
        MAX_AUTHORED_LAKE_POLYGON_POINTS
    );
    assertSimpleCanonicalPolygon(feature.polygon);
    assertUint16("authored lake level", feature.level);
    assertUint8("authored lake profile", feature.profileIndex);
}

export function createAuthoredLakeFeature(
    input: Omit<AuthoredLakeFeature, "kind">
): AuthoredLakeFeature {
    if (!input || typeof input !== "object") throw new TypeError("authored lake input is required");
    const feature: AuthoredLakeFeature = Object.freeze({
        kind: "lake",
        featureId: input.featureId,
        polygon: canonicalPolygon(input.polygon),
        level: input.level,
        profileIndex: input.profileIndex
    });
    assertAuthoredLakeFeature(feature);
    return feature;
}

export function authoredHydrologyPoint(tileX: number, tileY: number): Float64Array {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        throw new RangeError("authored hydrology point must use finite tile coordinates");
    }
    const quantizedX = Math.round(tileX * HYDROLOGY_POINT_QUANTIZATION);
    const quantizedY = Math.round(tileY * HYDROLOGY_POINT_QUANTIZATION);
    if (!Number.isSafeInteger(quantizedX) || !Number.isSafeInteger(quantizedY)
        || quantizedX / HYDROLOGY_POINT_QUANTIZATION !== tileX
        || quantizedY / HYDROLOGY_POINT_QUANTIZATION !== tileY) {
        throw new RangeError("authored hydrology point must lie on the safe q64 lattice");
    }
    return new Float64Array([quantizedX, quantizedY]);
}

export function assertHydrologyFeatureDelta(delta: Readonly<HydrologyFeatureDelta>): void {
    if (!delta || typeof delta !== "object"
        || delta.formatVersion !== HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION) {
        throw new TypeError("hydrology feature delta format version is unsupported");
    }
    if (typeof delta.worldIdentity !== "string" || delta.worldIdentity.length === 0
        || delta.worldIdentity.length > MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH) {
        throw new TypeError("hydrology feature delta world identity is invalid");
    }
    if (!Number.isSafeInteger(delta.revision) || delta.revision <= 0) {
        throw new RangeError("hydrology feature delta revision must be a positive safe integer");
    }
    assertStableId("hydrology delta feature", delta.featureId);
    if (delta.featureKind !== "river" && delta.featureKind !== "lake") {
        throw new TypeError("hydrology delta feature kind is invalid");
    }
    if (delta.operation === "delete") {
        if ("feature" in delta) throw new Error("hydrology tombstone cannot carry a feature payload");
        return;
    }
    if (delta.operation !== "upsert" || !delta.feature
        || delta.feature.kind !== delta.featureKind || delta.feature.featureId !== delta.featureId) {
        throw new Error("hydrology upsert identity or kind does not match its complete feature");
    }
    if (delta.feature.kind === "river") assertAuthoredRiverFeature(delta.feature);
    else assertAuthoredLakeFeature(delta.feature);
}

export function createHydrologyFeatureDelta(
    input: Readonly<HydrologyFeatureDeltaInput>
): HydrologyFeatureDelta {
    if (!input || typeof input !== "object") throw new TypeError("hydrology feature delta input is required");
    let delta: HydrologyFeatureDelta;
    if (input.operation === "upsert") {
        if (!input.feature || typeof input.feature !== "object") {
            throw new TypeError("hydrology feature delta upsert requires a complete feature");
        }
        const feature = input.feature.kind === "river"
            ? createAuthoredRiverFeature(input.feature)
            : input.feature.kind === "lake"
                ? createAuthoredLakeFeature(input.feature)
                : (() => { throw new TypeError("hydrology feature delta kind is invalid"); })();
        delta = Object.freeze({
            formatVersion: HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
            worldIdentity: input.worldIdentity,
            revision: input.revision,
            featureId: input.featureId,
            featureKind: input.featureKind,
            operation: "upsert",
            feature
        });
    } else if (input.operation === "delete") {
        delta = Object.freeze({
            formatVersion: HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION,
            worldIdentity: input.worldIdentity,
            revision: input.revision,
            featureId: input.featureId,
            featureKind: input.featureKind,
            operation: "delete"
        });
    } else throw new TypeError("hydrology feature delta operation is invalid");
    assertHydrologyFeatureDelta(delta);
    return delta;
}

interface SerializedHydrologyFeatureDeltaLayout {
    readonly worldIdentity: number;
    readonly featureId: number;
    readonly sourceId: number;
    readonly outletId: number;
    readonly points: number;
    readonly widthProfile: number;
    readonly levelProfile: number;
    readonly totalBytes: number;
}

function serializedLayout(
    worldIdentityBytes: number,
    featureIdBytes: number,
    sourceIdBytes: number,
    outletIdBytes: number,
    pointCount: number,
    riverPayload: boolean
): SerializedHydrologyFeatureDeltaLayout {
    const worldIdentity = HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES;
    const featureId = worldIdentity + worldIdentityBytes;
    const sourceId = featureId + featureIdBytes;
    const outletId = sourceId + sourceIdBytes;
    const points = outletId + outletIdBytes;
    const widthProfile = points + pointCount * 2 * BigInt64Array.BYTES_PER_ELEMENT;
    const levelProfile = widthProfile + (riverPayload ? pointCount : 0);
    const totalBytes = levelProfile
        + (riverPayload ? pointCount * Uint16Array.BYTES_PER_ELEMENT : 0);
    if (!Number.isSafeInteger(totalBytes)) {
        throw new RangeError("serialized hydrology feature delta exceeds the safe byte range");
    }
    return { worldIdentity, featureId, sourceId, outletId, points, widthProfile, levelProfile, totalBytes };
}

function encoded(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function sourceIdentity(source: AuthoredRiverSource): string {
    return source.kind === "spring" ? source.sourceId : source.riverId;
}

function outletIdentity(outlet: AuthoredRiverOutlet): string {
    return outlet.kind === "river" ? outlet.riverId : outlet.bodyId;
}

function serializedSourceKind(source: AuthoredRiverSource): number {
    return source.kind === "spring" ? SERIALIZED_SOURCE_SPRING : SERIALIZED_SOURCE_RIVER;
}

function serializedOutletKind(outlet: AuthoredRiverOutlet): number {
    return outlet.kind === "ocean" ? SERIALIZED_OUTLET_OCEAN
        : outlet.kind === "lake" ? SERIALIZED_OUTLET_LAKE : SERIALIZED_OUTLET_RIVER;
}

export function hydrologyFeatureDeltaSerializedBytes(
    delta: Readonly<HydrologyFeatureDelta>
): number {
    assertHydrologyFeatureDelta(delta);
    const worldIdentityBytes = encoded(delta.worldIdentity).byteLength;
    const featureIdBytes = encoded(delta.featureId).byteLength;
    const river = delta.operation === "upsert" && delta.feature.kind === "river"
        ? delta.feature : undefined;
    const sourceIdBytes = river ? encoded(sourceIdentity(river.source)).byteLength : 0;
    const outletIdBytes = river ? encoded(outletIdentity(river.outlet)).byteLength : 0;
    const pointCount = delta.operation === "delete" ? 0
        : (delta.feature.kind === "river" ? delta.feature.controlPoints : delta.feature.polygon).length / 2;
    return serializedLayout(
        worldIdentityBytes,
        featureIdBytes,
        sourceIdBytes,
        outletIdBytes,
        pointCount,
        river !== undefined
    ).totalBytes;
}

export function serializeHydrologyFeatureDelta(
    delta: Readonly<HydrologyFeatureDelta>
): ArrayBuffer {
    assertHydrologyFeatureDelta(delta);
    const worldIdentity = encoded(delta.worldIdentity);
    const featureId = encoded(delta.featureId);
    const river = delta.operation === "upsert" && delta.feature.kind === "river"
        ? delta.feature : undefined;
    const sourceId = river ? encoded(sourceIdentity(river.source)) : new Uint8Array(0);
    const outletId = river ? encoded(outletIdentity(river.outlet)) : new Uint8Array(0);
    const points = delta.operation === "delete" ? undefined
        : delta.feature.kind === "river" ? delta.feature.controlPoints : delta.feature.polygon;
    const pointCount = points ? points.length / 2 : 0;
    const layout = serializedLayout(
        worldIdentity.byteLength,
        featureId.byteLength,
        sourceId.byteLength,
        outletId.byteLength,
        pointCount,
        river !== undefined
    );
    const buffer = new ArrayBuffer(layout.totalBytes);
    const view = new DataView(buffer);
    view.setUint32(0, HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC, true);
    view.setUint16(4, HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION, true);
    view.setUint16(6, HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES, true);
    view.setUint8(8, delta.operation === "delete"
        ? SERIALIZED_OPERATION_DELETE : SERIALIZED_OPERATION_UPSERT);
    view.setUint8(9, delta.featureKind === "river"
        ? SERIALIZED_FEATURE_RIVER : SERIALIZED_FEATURE_LAKE);
    view.setUint8(10, river ? serializedSourceKind(river.source) : SERIALIZED_SOURCE_NONE);
    view.setUint8(11, river ? serializedOutletKind(river.outlet) : SERIALIZED_OUTLET_NONE);
    view.setBigUint64(12, BigInt(delta.revision), true);
    view.setUint32(20, worldIdentity.byteLength, true);
    view.setUint32(24, featureId.byteLength, true);
    view.setUint32(28, sourceId.byteLength, true);
    view.setUint32(32, outletId.byteLength, true);
    view.setUint16(36, pointCount, true);
    view.setUint8(38, river?.dischargeClass ?? 0);
    view.setUint8(39, delta.operation === "upsert" ? delta.feature.profileIndex : 0);
    view.setUint16(40, delta.operation === "upsert" && delta.feature.kind === "lake"
        ? delta.feature.level : 0, true);
    view.setUint16(42, 0, true);
    view.setUint32(44, layout.totalBytes, true);
    new Uint8Array(buffer, layout.worldIdentity, worldIdentity.byteLength).set(worldIdentity);
    new Uint8Array(buffer, layout.featureId, featureId.byteLength).set(featureId);
    new Uint8Array(buffer, layout.sourceId, sourceId.byteLength).set(sourceId);
    new Uint8Array(buffer, layout.outletId, outletId.byteLength).set(outletId);
    if (points) {
        for (let index = 0; index < points.length; index += 1) {
            view.setBigInt64(
                layout.points + index * BigInt64Array.BYTES_PER_ELEMENT,
                BigInt(points[index]),
                true
            );
        }
    }
    if (river) {
        new Uint8Array(buffer, layout.widthProfile, pointCount).set(river.widthProfile);
        for (let index = 0; index < pointCount; index += 1) {
            view.setUint16(
                layout.levelProfile + index * Uint16Array.BYTES_PER_ELEMENT,
                river.levelProfile[index],
                true
            );
        }
    }
    return buffer;
}

function decoded(name: string, buffer: ArrayBuffer, offset: number, length: number): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
            new Uint8Array(buffer, offset, length)
        );
    } catch {
        throw new TypeError(`serialized hydrology ${name} is not valid UTF-8`);
    }
}

function safeBigIntNumber(name: string, value: bigint): number {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || BigInt(numeric) !== value) {
        throw new RangeError(`serialized hydrology ${name} exceeds the safe integer range`);
    }
    return numeric;
}

export function deserializeHydrologyFeatureDelta(buffer: ArrayBuffer): HydrologyFeatureDelta {
    if (!(buffer instanceof ArrayBuffer)
        || buffer.byteLength < HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES) {
        throw new TypeError("serialized hydrology feature delta has an invalid byte length");
    }
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== HYDROLOGY_FEATURE_DELTA_SERIALIZED_MAGIC
        || view.getUint16(4, true) !== HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION
        || view.getUint16(6, true) !== HYDROLOGY_FEATURE_DELTA_SERIALIZED_HEADER_BYTES
        || view.getUint16(42, true) !== 0
        || view.getUint32(44, true) !== buffer.byteLength) {
        throw new TypeError("serialized hydrology feature delta header is invalid or unsupported");
    }
    const operation = view.getUint8(8);
    const featureKind = view.getUint8(9);
    const sourceKind = view.getUint8(10);
    const outletKind = view.getUint8(11);
    const worldIdentityBytes = view.getUint32(20, true);
    const featureIdBytes = view.getUint32(24, true);
    const sourceIdBytes = view.getUint32(28, true);
    const outletIdBytes = view.getUint32(32, true);
    const pointCount = view.getUint16(36, true);
    const dischargeClass = view.getUint8(38);
    const profileIndex = view.getUint8(39);
    const lakeLevel = view.getUint16(40, true);
    const isRiverUpsert = operation === SERIALIZED_OPERATION_UPSERT
        && featureKind === SERIALIZED_FEATURE_RIVER;
    const layout = serializedLayout(
        worldIdentityBytes,
        featureIdBytes,
        sourceIdBytes,
        outletIdBytes,
        pointCount,
        isRiverUpsert
    );
    if (layout.totalBytes !== buffer.byteLength || worldIdentityBytes === 0 || featureIdBytes === 0) {
        throw new TypeError("serialized hydrology feature delta byte layout is invalid");
    }
    const worldIdentity = decoded("world identity", buffer, layout.worldIdentity, worldIdentityBytes);
    const featureId = decoded("feature identity", buffer, layout.featureId, featureIdBytes);
    const revision = safeBigIntNumber("revision", view.getBigUint64(12, true));
    const kind = featureKind === SERIALIZED_FEATURE_RIVER ? "river"
        : featureKind === SERIALIZED_FEATURE_LAKE ? "lake" : undefined;
    if (!kind) throw new TypeError("serialized hydrology feature kind is invalid");

    if (operation === SERIALIZED_OPERATION_DELETE) {
        if (sourceKind !== SERIALIZED_SOURCE_NONE || outletKind !== SERIALIZED_OUTLET_NONE
            || sourceIdBytes !== 0 || outletIdBytes !== 0 || pointCount !== 0
            || dischargeClass !== 0 || profileIndex !== 0 || lakeLevel !== 0) {
            throw new Error("serialized hydrology tombstone contains non-canonical payload");
        }
        return createHydrologyFeatureDelta({
            worldIdentity,
            revision,
            featureId,
            featureKind: kind,
            operation: "delete"
        });
    }
    if (operation !== SERIALIZED_OPERATION_UPSERT) {
        throw new TypeError("serialized hydrology feature operation is invalid");
    }
    const points = new Float64Array(pointCount * 2);
    for (let index = 0; index < points.length; index += 1) {
        points[index] = safeBigIntNumber(
            "q64 coordinate",
            view.getBigInt64(layout.points + index * BigInt64Array.BYTES_PER_ELEMENT, true)
        );
    }
    if (kind === "lake") {
        if (sourceKind !== SERIALIZED_SOURCE_NONE || outletKind !== SERIALIZED_OUTLET_NONE
            || sourceIdBytes !== 0 || outletIdBytes !== 0 || dischargeClass !== 0) {
            throw new Error("serialized authored lake contains non-canonical river payload");
        }
        const feature: AuthoredLakeFeature = {
            kind: "lake",
            featureId,
            polygon: points,
            level: lakeLevel,
            profileIndex
        };
        // Loading must reject a non-canonical polygon instead of silently
        // rotating or reversing persisted bytes into a different identity.
        assertAuthoredLakeFeature(feature);
        return createHydrologyFeatureDelta({
            worldIdentity,
            revision,
            featureId,
            featureKind: kind,
            operation: "upsert",
            feature
        });
    }
    if (lakeLevel !== 0 || sourceIdBytes === 0 || outletIdBytes === 0) {
        throw new Error("serialized authored river header is non-canonical");
    }
    const sourceId = decoded("river source identity", buffer, layout.sourceId, sourceIdBytes);
    const outletId = decoded("river outlet identity", buffer, layout.outletId, outletIdBytes);
    const source: AuthoredRiverSource = sourceKind === SERIALIZED_SOURCE_SPRING
        ? { kind: "spring", sourceId }
        : sourceKind === SERIALIZED_SOURCE_RIVER
            ? { kind: "river", riverId: sourceId }
            : (() => { throw new TypeError("serialized authored river source kind is invalid"); })();
    const outlet: AuthoredRiverOutlet = outletKind === SERIALIZED_OUTLET_OCEAN
        ? { kind: "ocean", bodyId: outletId as "ocean" }
        : outletKind === SERIALIZED_OUTLET_LAKE
            ? { kind: "lake", bodyId: outletId }
            : outletKind === SERIALIZED_OUTLET_RIVER
                ? { kind: "river", riverId: outletId }
                : (() => { throw new TypeError("serialized authored river outlet kind is invalid"); })();
    const widthProfile = new Uint8Array(buffer, layout.widthProfile, pointCount).slice();
    const levelProfile = new Uint16Array(pointCount);
    for (let index = 0; index < pointCount; index += 1) {
        levelProfile[index] = view.getUint16(
            layout.levelProfile + index * Uint16Array.BYTES_PER_ELEMENT,
            true
        );
    }
    return createHydrologyFeatureDelta({
        worldIdentity,
        revision,
        featureId,
        featureKind: kind,
        operation: "upsert",
        feature: {
            kind: "river",
            featureId,
            source,
            outlet,
            controlPoints: points,
            widthProfile,
            levelProfile,
            dischargeClass,
            profileIndex
        }
    });
}

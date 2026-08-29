import { HYDROLOGY_POINT_QUANTIZATION } from "./HydrologyRegion";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";

export const HYDROLOGY_FEATURE_DELTA_FORMAT_VERSION = 1;
export const MAX_AUTHORED_HYDROLOGY_CONTROL_POINTS = 256;
export const MAX_AUTHORED_LAKE_POLYGON_POINTS = 256;
export const MAX_AUTHORED_HYDROLOGY_ID_LENGTH = 256;
export const MAX_HYDROLOGY_FEATURE_WORLD_IDENTITY_LENGTH = 16_384;

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

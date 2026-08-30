import {
    HydrologyBodyId,
    HydrologyFeatureId,
    HYDROLOGY_MAX_DISCHARGE_CLASS,
    OCEAN_BODY_ID
} from "./MacroDrainageGraph";
import { HYDROLOGY_COORDINATE_SCALE } from "./WorldSemanticFormat";

export interface HydrologyFeatureConnection {
    readonly kind: "body" | "river";
    readonly featureId: HydrologyFeatureId;
}

export type HydrologyRiverSource = Readonly<{ readonly kind: "source" }>
    | HydrologyFeatureConnection;

export interface HydrologyRiverFeatureDelta {
    readonly kind: "river";
    readonly featureId: HydrologyFeatureId;
    readonly revision: number;
    readonly source: HydrologyRiverSource;
    readonly outlet: HydrologyFeatureConnection;
    readonly controlPoints: Float64Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly dischargeClass: number;
}

export interface HydrologyLakeFeatureDelta {
    readonly kind: "lake";
    readonly featureId: HydrologyFeatureId;
    readonly revision: number;
    readonly boundaryPoints: Float64Array;
    readonly level: number;
    readonly profileIndex: number;
}

export interface HydrologyFeatureTombstone {
    readonly kind: "tombstone";
    readonly featureId: HydrologyFeatureId;
    readonly revision: number;
    readonly targetKind: "river" | "lake";
}

export type HydrologyFeatureDelta = HydrologyRiverFeatureDelta
    | HydrologyLakeFeatureDelta
    | HydrologyFeatureTombstone;

export interface HydrologyFeatureBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

const GENERATED_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-f0-9]{32}$/;

function assertFeatureId(name: string, value: unknown): asserts value is HydrologyFeatureId {
    if (typeof value !== "string" || !GENERATED_ID_PATTERN.test(value) || value === OCEAN_BODY_ID) {
        throw new TypeError(`${name} must be a non-ocean stable hydrology feature ID`);
    }
}

function assertConnectionId(name: string, value: unknown): asserts value is HydrologyBodyId {
    if (typeof value !== "string" || value !== OCEAN_BODY_ID && !GENERATED_ID_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a stable hydrology feature or ocean ID`);
    }
}

function assertPositiveRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError("hydrology feature revision must be a positive safe integer");
    }
}

function assertUint8(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError(`${name} must be a Uint8 value`);
    }
}

function assertUint16(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new RangeError(`${name} must be a Uint16 value`);
    }
}

function assertConnection(value: HydrologyFeatureConnection, ownerId: HydrologyFeatureId): void {
    if (!value || (value.kind !== "body" && value.kind !== "river")
        || Object.getOwnPropertyNames(value).some(name => name !== "kind" && name !== "featureId")) {
        throw new TypeError("hydrology feature connection is invalid");
    }
    assertConnectionId("hydrology connection featureId", value.featureId);
    if (value.featureId === ownerId) throw new TypeError("hydrology feature cannot connect to itself");
    if (value.kind === "river" && value.featureId === OCEAN_BODY_ID) {
        throw new TypeError("the reserved ocean ID cannot be used as a river connection");
    }
}

function assertSource(value: HydrologyRiverSource, ownerId: HydrologyFeatureId): void {
    if (!value || typeof value !== "object") throw new TypeError("hydrology river source is invalid");
    if (value.kind === "source") {
        if (Object.getOwnPropertyNames(value).some(name => name !== "kind")) {
            throw new TypeError("hydrology spring source contains unknown fields");
        }
        return;
    }
    assertConnection(value, ownerId);
}

function assertWorldPoints(name: string, value: Float64Array, minimumPoints: number): void {
    if (!(value instanceof Float64Array) || value.length < minimumPoints * 2 || value.length % 2 !== 0) {
        throw new TypeError(`${name} must contain at least ${minimumPoints} coordinate pairs`);
    }
    for (const coordinate of value) {
        if (!Number.isFinite(coordinate)
            || !Number.isSafeInteger(coordinate * HYDROLOGY_COORDINATE_SCALE)) {
            throw new RangeError(`${name} coordinates must be exact 1/${HYDROLOGY_COORDINATE_SCALE}-tile values`);
        }
    }
}

function assertRiver(value: HydrologyRiverFeatureDelta): void {
    const allowedFields = new Set([
        "kind",
        "featureId",
        "revision",
        "source",
        "outlet",
        "controlPoints",
        "widthProfile",
        "levelProfile",
        "dischargeClass"
    ]);
    if (Object.getOwnPropertyNames(value).some(name => !allowedFields.has(name))) {
        throw new TypeError("hydrology river delta contains unknown fields");
    }
    assertSource(value.source, value.featureId);
    assertConnection(value.outlet, value.featureId);
    assertWorldPoints("hydrology river controlPoints", value.controlPoints, 2);
    const pointCount = value.controlPoints.length / 2;
    if (!(value.widthProfile instanceof Uint8Array) || value.widthProfile.length !== pointCount
        || !(value.levelProfile instanceof Uint16Array) || value.levelProfile.length !== pointCount) {
        throw new TypeError("hydrology river profiles must contain one value per control point");
    }
    for (const width of value.widthProfile) {
        assertUint8("hydrology river width", width);
        if (width === 0) throw new RangeError("hydrology river width must remain positive");
    }
    for (let index = 0; index < value.levelProfile.length; index += 1) {
        assertUint16("hydrology river level", value.levelProfile[index]);
        if (index > 0 && value.levelProfile[index] > value.levelProfile[index - 1]) {
            throw new TypeError("hydrology river level profile must not rise downstream");
        }
    }
    if (!Number.isInteger(value.dischargeClass) || value.dischargeClass < 0
        || value.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
        throw new RangeError("hydrology river dischargeClass is invalid");
    }
}

function assertLake(value: HydrologyLakeFeatureDelta): void {
    const allowedFields = new Set([
        "kind",
        "featureId",
        "revision",
        "boundaryPoints",
        "level",
        "profileIndex"
    ]);
    if (Object.getOwnPropertyNames(value).some(name => !allowedFields.has(name))) {
        throw new TypeError("hydrology lake delta contains unknown fields");
    }
    assertWorldPoints("hydrology lake boundaryPoints", value.boundaryPoints, 3);
    assertUint16("hydrology lake level", value.level);
    assertUint8("hydrology lake profileIndex", value.profileIndex);
}

function assertTombstone(value: HydrologyFeatureTombstone): void {
    if ((value.targetKind !== "river" && value.targetKind !== "lake")
        || Object.getOwnPropertyNames(value).some(name =>
            name !== "kind" && name !== "featureId" && name !== "revision" && name !== "targetKind")) {
        throw new TypeError("hydrology feature tombstone is invalid");
    }
}

export function assertHydrologyFeatureDelta(value: unknown): asserts value is HydrologyFeatureDelta {
    if (!value || typeof value !== "object") throw new TypeError("hydrology feature delta must be an object");
    const delta = value as HydrologyFeatureDelta;
    assertFeatureId("hydrology delta featureId", delta.featureId);
    assertPositiveRevision(delta.revision);
    if (delta.kind === "river") assertRiver(delta);
    else if (delta.kind === "lake") assertLake(delta);
    else if (delta.kind === "tombstone") assertTombstone(delta);
    else throw new TypeError("hydrology feature delta kind is invalid");
}

function cloneConnection(connection: HydrologyFeatureConnection): HydrologyFeatureConnection {
    return Object.freeze({ kind: connection.kind, featureId: connection.featureId });
}

function cloneSource(source: HydrologyRiverSource): HydrologyRiverSource {
    return source.kind === "source"
        ? Object.freeze({ kind: "source" as const })
        : cloneConnection(source);
}

export function cloneHydrologyFeatureDelta(delta: HydrologyFeatureDelta): HydrologyFeatureDelta {
    assertHydrologyFeatureDelta(delta);
    let clone: HydrologyFeatureDelta;
    if (delta.kind === "river") {
        clone = Object.freeze({
            kind: "river" as const,
            featureId: delta.featureId,
            revision: delta.revision,
            source: cloneSource(delta.source),
            outlet: cloneConnection(delta.outlet),
            controlPoints: delta.controlPoints.slice(),
            widthProfile: delta.widthProfile.slice(),
            levelProfile: delta.levelProfile.slice(),
            dischargeClass: delta.dischargeClass
        });
    } else if (delta.kind === "lake") {
        clone = Object.freeze({
            kind: "lake" as const,
            featureId: delta.featureId,
            revision: delta.revision,
            boundaryPoints: delta.boundaryPoints.slice(),
            level: delta.level,
            profileIndex: delta.profileIndex
        });
    } else {
        clone = Object.freeze({
            kind: "tombstone" as const,
            featureId: delta.featureId,
            revision: delta.revision,
            targetKind: delta.targetKind
        });
    }
    assertHydrologyFeatureDelta(clone);
    return clone;
}

export function hydrologyFeatureBounds(
    feature: HydrologyRiverFeatureDelta | HydrologyLakeFeatureDelta
): Readonly<HydrologyFeatureBounds> {
    assertHydrologyFeatureDelta(feature);
    if (feature.kind !== "river" && feature.kind !== "lake") {
        throw new TypeError("hydrology tombstones do not have spatial bounds");
    }
    const points = feature.kind === "river" ? feature.controlPoints : feature.boundaryPoints;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < points.length; index += 2) {
        minX = Math.min(minX, points[index]);
        minY = Math.min(minY, points[index + 1]);
        maxX = Math.max(maxX, points[index]);
        maxY = Math.max(maxY, points[index + 1]);
    }
    return Object.freeze({ minX, minY, maxX, maxY });
}

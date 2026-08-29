import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    SURFACE_WATER_KIND_LAKE,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import {
    CompiledWaterBody,
    CompiledWaterBodyPalette,
    createCompiledWaterBodyPalette
} from "./CompiledWaterBodyPalette";
import { float16BitsToFloat32, finiteFloat16Bits } from "./HalfFloat";
import { AuthoredLakeFeature } from "./HydrologyFeatureDelta";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";
import { HYDROLOGY_POINT_QUANTIZATION, LakeFeature } from "./HydrologyRegion";
import {
    HYDROLOGY_REGION_SIZE,
    SURFACE_COMPILE_PROFILE,
    surfaceInfluenceRadiusWorld
} from "./SurfaceCompileProfile";
import {
    SurfaceContourSegment,
    createSurfaceContourRasterContext,
    quantizeSurfaceCoverage,
    rasterSurfaceContourDistances,
    surfaceHeightContours
} from "./SurfaceContours";
import { surfaceTexelCenterAxis, surfaceToWorld } from "./SurfaceLattice";
import {
    TransferableEffectiveWindow,
    TransferableHydrologyRegionSlice,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { compileOceanSurfaceField } from "./compileOceanSurfaceField";

export const MAX_SURFACE_PERIODIC_FEATURE_IMAGES = 16;

export interface LakeSurfaceCompilation {
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
}

export interface SurfaceHydrologyLogicalBounds {
    readonly minU: number;
    readonly minV: number;
    readonly maxU: number;
    readonly maxV: number;
}

interface LakeShapeBase {
    readonly bodyId: string;
    readonly stableIdentity: string;
    readonly level: number;
    readonly profileIndex: number;
    readonly bounds: SurfaceHydrologyLogicalBounds;
}

interface CircleLakeShape extends LakeShapeBase {
    readonly shapeKind: "circle";
    readonly centerU: number;
    readonly centerV: number;
    readonly radius: number;
}

interface PolygonLakeShape extends LakeShapeBase {
    readonly shapeKind: "polygon";
    readonly points: Float64Array;
}

type LakeShape = CircleLakeShape | PolygonLakeShape;

interface BodyDefinition extends CompiledWaterBody {
    readonly level: number;
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

export function surfaceHydrologyBoundsIntersect(
    first: Readonly<SurfaceHydrologyLogicalBounds>,
    second: Readonly<SurfaceHydrologyLogicalBounds>
): boolean {
    return first.minU <= second.maxU && first.maxU >= second.minU
        && first.minV <= second.maxV && first.maxV >= second.minV;
}

function translatedBounds(
    bounds: Readonly<SurfaceHydrologyLogicalBounds>,
    offsetU: number,
    offsetV: number
): SurfaceHydrologyLogicalBounds {
    return {
        minU: bounds.minU + offsetU,
        minV: bounds.minV + offsetV,
        maxU: bounds.maxU + offsetU,
        maxV: bounds.maxV + offsetV
    };
}

function periodicOffsets(
    minimum: number,
    maximum: number,
    queryMinimum: number,
    queryMaximum: number,
    period: number | undefined
): readonly number[] {
    if (period === undefined) return [0];
    const first = Math.ceil((queryMinimum - maximum) / period);
    const last = Math.floor((queryMaximum - minimum) / period);
    const offsets: number[] = [];
    for (let image = first; image <= last; image += 1) offsets.push(image * period);
    return offsets;
}

export function surfaceHydrologyProjectedOffsets(
    window: Readonly<TransferableEffectiveWindow>,
    bounds: Readonly<SurfaceHydrologyLogicalBounds>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly Readonly<{ u: number; v: number }>[] {
    const periodU = window.domain.topology === "toroidal" ? window.domain.width : undefined;
    const periodV = window.domain.topology === "toroidal" ? window.domain.height : undefined;
    const uOffsets = periodicOffsets(bounds.minU, bounds.maxU, queryBounds.minU, queryBounds.maxU, periodU);
    const vOffsets = periodicOffsets(bounds.minV, bounds.maxV, queryBounds.minV, queryBounds.maxV, periodV);
    if (uOffsets.length * vOffsets.length > MAX_SURFACE_PERIODIC_FEATURE_IMAGES) {
        throw new RangeError("surface hydrology feature exceeds its periodic image budget");
    }
    return Object.freeze(uOffsets.flatMap(u => vOffsets.map(v => Object.freeze({ u, v }))));
}

function circleShapes(
    window: Readonly<TransferableEffectiveWindow>,
    region: Readonly<TransferableHydrologyRegionSlice>,
    lake: Readonly<LakeFeature>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly CircleLakeShape[] {
    const centerU = region.key.regionX * HYDROLOGY_REGION_SIZE
        + lake.center[0] / HYDROLOGY_POINT_QUANTIZATION;
    const centerV = region.key.regionY * HYDROLOGY_REGION_SIZE
        + lake.center[1] / HYDROLOGY_POINT_QUANTIZATION;
    const radius = lake.radius / HYDROLOGY_POINT_QUANTIZATION;
    const bounds = { minU: centerU - radius, minV: centerV - radius,
        maxU: centerU + radius, maxV: centerV + radius };
    return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).map(offset => Object.freeze({
        shapeKind: "circle" as const,
        bodyId: lake.bodyId,
        stableIdentity: lake.bodyId,
        level: lake.level,
        profileIndex: lake.profileIndex,
        centerU: centerU + offset.u,
        centerV: centerV + offset.v,
        radius,
        bounds: Object.freeze(translatedBounds(bounds, offset.u, offset.v))
    })));
}

function polygonBounds(points: Float64Array): SurfaceHydrologyLogicalBounds {
    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < points.length; index += 2) {
        minU = Math.min(minU, points[index] / HYDROLOGY_POINT_QUANTIZATION);
        minV = Math.min(minV, points[index + 1] / HYDROLOGY_POINT_QUANTIZATION);
        maxU = Math.max(maxU, points[index] / HYDROLOGY_POINT_QUANTIZATION);
        maxV = Math.max(maxV, points[index + 1] / HYDROLOGY_POINT_QUANTIZATION);
    }
    return { minU, minV, maxU, maxV };
}

function polygonShapes(
    window: Readonly<TransferableEffectiveWindow>,
    lake: Readonly<AuthoredLakeFeature>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly PolygonLakeShape[] {
    const bounds = polygonBounds(lake.polygon);
    return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).map(offset => {
        const points = new Float64Array(lake.polygon.length);
        for (let index = 0; index < points.length; index += 2) {
            points[index] = lake.polygon[index] / HYDROLOGY_POINT_QUANTIZATION + offset.u;
            points[index + 1] = lake.polygon[index + 1] / HYDROLOGY_POINT_QUANTIZATION + offset.v;
        }
        return Object.freeze({
            shapeKind: "polygon" as const,
            bodyId: lake.featureId,
            stableIdentity: lake.featureId,
            level: lake.level,
            profileIndex: lake.profileIndex,
            points,
            bounds: Object.freeze(translatedBounds(bounds, offset.u, offset.v))
        });
    }));
}

function registerBody(
    bodies: Map<string, BodyDefinition>,
    bodyId: string,
    profileIndex: number,
    level: number
): void {
    const existing = bodies.get(bodyId);
    if (existing && (existing.kind !== "lake"
        || existing.profileIndex !== profileIndex || existing.level !== level)) {
        throw new Error("surface lake body slices disagree on kind, profile or level");
    }
    if (!existing) bodies.set(bodyId, { bodyId, kind: "lake", profileIndex, level });
}

function collectLakeShapes(
    window: Readonly<TransferableEffectiveWindow>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>
): Readonly<{ shapes: readonly LakeShape[]; bodies: ReadonlyMap<string, BodyDefinition> }> {
    const shapes: LakeShape[] = [];
    const bodies = new Map<string, BodyDefinition>();
    for (const region of window.hydrologyRegions) {
        const suppressed = new Set(region.suppressedBaseFeatureIds);
        const bodyById = new Map(region.bodies.map(body => [body.bodyId, body] as const));
        for (const lake of region.lakes) {
            if (suppressed.has(lake.bodyId)) continue;
            const body = bodyById.get(lake.bodyId);
            if (!body || body.kind !== "lake" || body.profileIndex !== lake.profileIndex) {
                throw new Error("surface lake slice lost its canonical body definition");
            }
            registerBody(bodies, lake.bodyId, lake.profileIndex, lake.level);
            shapes.push(...circleShapes(window, region, lake, queryBounds));
        }
    }
    for (const delta of window.authoredHydrology) {
        if (delta.feature.kind !== "lake") continue;
        registerBody(bodies, delta.feature.featureId, delta.feature.profileIndex, delta.feature.level);
        shapes.push(...polygonShapes(window, delta.feature, queryBounds));
    }
    return Object.freeze({ shapes: Object.freeze(shapes), bodies });
}

function clipSegment(
    startU: number,
    startV: number,
    endU: number,
    endV: number,
    bounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly [number, number] | undefined {
    const deltaU = endU - startU;
    const deltaV = endV - startV;
    let minimum = 0;
    let maximum = 1;
    const tests = [
        [-deltaU, startU - bounds.minU],
        [deltaU, bounds.maxU - startU],
        [-deltaV, startV - bounds.minV],
        [deltaV, bounds.maxV - startV]
    ] as const;
    for (const [direction, distance] of tests) {
        if (direction === 0) {
            if (distance < 0) return undefined;
            continue;
        }
        const amount = distance / direction;
        if (direction < 0) minimum = Math.max(minimum, amount);
        else maximum = Math.min(maximum, amount);
        if (minimum > maximum) return undefined;
    }
    return [minimum, maximum];
}

function addLogicalSegment(
    output: SurfaceContourSegment[],
    startU: number,
    startV: number,
    endU: number,
    endV: number,
    clipBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    hexSize: number
): void {
    const clipped = clipSegment(startU, startV, endU, endV, clipBounds);
    if (!clipped) return;
    const deltaU = endU - startU;
    const deltaV = endV - startV;
    const amounts = [clipped[0], clipped[1]];
    if (deltaU !== 0) {
        const clippedStartU = startU + deltaU * clipped[0];
        const clippedEndU = startU + deltaU * clipped[1];
        for (let column = Math.floor(Math.min(clippedStartU, clippedEndU)) + 1;
            column < Math.max(clippedStartU, clippedEndU); column += 1) {
            amounts.push((column - startU) / deltaU);
        }
    }
    amounts.sort((first, second) => first - second);
    for (let index = 0; index < amounts.length - 1; index += 1) {
        const first = amounts[index];
        const second = amounts[index + 1];
        if (second <= first) continue;
        output.push({
            start: surfaceToWorld(startU + deltaU * first, startV + deltaV * first, hexSize),
            end: surfaceToWorld(startU + deltaU * second, startV + deltaV * second, hexSize)
        });
    }
}

function criticalCircleAngles(
    centerU: number,
    centerV: number,
    radius: number,
    bounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly number[] {
    const full = Math.PI * 2;
    const angles = [0, full];
    const add = (angle: number): void => {
        const normalized = angle < 0 ? angle + full : angle;
        if (normalized > 0 && normalized < full) angles.push(normalized);
    };
    for (const boundary of [bounds.minU, bounds.maxU]) {
        const ratio = (boundary - centerU) / radius;
        if (ratio < -1 || ratio > 1) continue;
        const angle = Math.acos(ratio);
        add(angle);
        add(full - angle);
    }
    for (const boundary of [bounds.minV, bounds.maxV]) {
        const ratio = (boundary - centerV) / radius;
        if (ratio < -1 || ratio > 1) continue;
        const angle = Math.asin(ratio);
        add(angle);
        add(Math.PI - angle);
    }
    angles.sort((first, second) => first - second);
    return Object.freeze(angles.filter((angle, index) => index === 0 || angle - angles[index - 1] > 1e-12));
}

function circleContours(
    shape: Readonly<CircleLakeShape>,
    clipBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    hexSize: number
): readonly SurfaceContourSegment[] {
    const output: SurfaceContourSegment[] = [];
    const angles = criticalCircleAngles(shape.centerU, shape.centerV, shape.radius, clipBounds);
    for (let interval = 0; interval < angles.length - 1; interval += 1) {
        const startAngle = angles[interval];
        const endAngle = angles[interval + 1];
        const middle = (startAngle + endAngle) * 0.5;
        const middleU = shape.centerU + Math.cos(middle) * shape.radius;
        const middleV = shape.centerV + Math.sin(middle) * shape.radius;
        if (middleU < clipBounds.minU || middleU > clipBounds.maxU
            || middleV < clipBounds.minV || middleV > clipBounds.maxV) continue;
        const count = Math.max(1, Math.ceil(
            (endAngle - startAngle) * shape.radius * SURFACE_COMPILE_PROFILE.samplesPerTileInterval
        ));
        let previousU = shape.centerU + Math.cos(startAngle) * shape.radius;
        let previousV = shape.centerV + Math.sin(startAngle) * shape.radius;
        for (let step = 1; step <= count; step += 1) {
            const angle = startAngle + (endAngle - startAngle) * step / count;
            const nextU = shape.centerU + Math.cos(angle) * shape.radius;
            const nextV = shape.centerV + Math.sin(angle) * shape.radius;
            addLogicalSegment(output, previousU, previousV, nextU, nextV, clipBounds, hexSize);
            previousU = nextU;
            previousV = nextV;
        }
    }
    return Object.freeze(output);
}

function polygonContours(
    shape: Readonly<PolygonLakeShape>,
    clipBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    hexSize: number
): readonly SurfaceContourSegment[] {
    const output: SurfaceContourSegment[] = [];
    const pointCount = shape.points.length / 2;
    for (let index = 0; index < pointCount; index += 1) {
        const next = (index + 1) % pointCount;
        addLogicalSegment(
            output,
            shape.points[index * 2],
            shape.points[index * 2 + 1],
            shape.points[next * 2],
            shape.points[next * 2 + 1],
            clipBounds,
            hexSize
        );
    }
    return Object.freeze(output);
}

function pointOnLogicalSegment(
    u: number,
    v: number,
    startU: number,
    startV: number,
    endU: number,
    endV: number
): boolean {
    const cross = (u - startU) * (endV - startV) - (v - startV) * (endU - startU);
    return Math.abs(cross) <= Number.EPSILON * 32
        && u >= Math.min(startU, endU) && u <= Math.max(startU, endU)
        && v >= Math.min(startV, endV) && v <= Math.max(startV, endV);
}

function polygonContains(points: Float64Array, u: number, v: number): boolean {
    let inside = false;
    const pointCount = points.length / 2;
    for (let index = 0, previous = pointCount - 1; index < pointCount; previous = index, index += 1) {
        const currentU = points[index * 2];
        const currentV = points[index * 2 + 1];
        const previousU = points[previous * 2];
        const previousV = points[previous * 2 + 1];
        if (pointOnLogicalSegment(u, v, previousU, previousV, currentU, currentV)) return true;
        if ((currentV > v) !== (previousV > v)
            && u < (previousU - currentU) * (v - currentV) / (previousV - currentV) + currentU) {
            inside = !inside;
        }
    }
    return inside;
}

function shapeContains(shape: Readonly<LakeShape>, u: number, v: number): boolean {
    if (shape.shapeKind === "circle") {
        return (u - shape.centerU) ** 2 + (v - shape.centerV) ** 2 <= shape.radius ** 2;
    }
    return polygonContains(shape.points, u, v);
}

export function surfaceHydrologyQueryBounds(
    window: Readonly<TransferableEffectiveWindow>,
    saturation: number
): SurfaceHydrologyLogicalBounds {
    const hexSize = window.dependencyKey.metrics.hexSize;
    const firstU = surfaceTexelCenterAxis(window.renderKey.chunkX, -SURFACE_COMPILE_PROFILE.gutterTexels);
    const lastU = surfaceTexelCenterAxis(
        window.renderKey.chunkX,
        SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1
    );
    const firstV = surfaceTexelCenterAxis(window.renderKey.chunkY, -SURFACE_COMPILE_PROFILE.gutterTexels);
    const lastV = surfaceTexelCenterAxis(
        window.renderKey.chunkY,
        SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels - 1
    );
    return Object.freeze({
        minU: firstU - saturation / (1.5 * hexSize),
        maxU: lastU + saturation / (1.5 * hexSize),
        minV: firstV - saturation / (Math.sqrt(3) * hexSize) - 0.5,
        maxV: lastV + saturation / (Math.sqrt(3) * hexSize) + 0.5
    });
}

export function compileLakeSurfaceField(
    window: Readonly<TransferableEffectiveWindow>
): LakeSurfaceCompilation {
    assertTransferableEffectiveWindow(window);
    const ocean = compileOceanSurfaceField(window);
    const hexSize = window.dependencyKey.metrics.hexSize;
    const heightScale = window.dependencyKey.metrics.heightScale;
    const saturation = surfaceInfluenceRadiusWorld(hexSize);
    const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize)
        / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const bounds = surfaceHydrologyQueryBounds(window, saturation);
    const collected = collectLakeShapes(window, bounds);
    if (collected.shapes.length === 0) return ocean;
    const contourContext = createSurfaceContourRasterContext(window, hexSize);

    const groundHeight = ocean.field.groundHeight.slice();
    const materialWeights = ocean.field.materialWeights.slice();
    const waterLevel = ocean.field.waterLevel.slice();
    const waterDepth = ocean.field.waterDepth.slice();
    const shorelineDistance = ocean.field.shorelineDistance.slice();
    const flow = ocean.field.flow.slice();
    const waterCoverage = ocean.field.waterCoverage.slice();
    const waterKind = ocean.field.waterKind.slice();
    const waterProfile = ocean.field.waterProfile.slice();
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const logicalU = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const logicalV = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const unionDistance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const winnerPriority = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const winnerBody: (string | undefined)[] = new Array(COMPILED_SURFACE_TEXEL_COUNT);
    for (let texelX = -SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
        texelX += 1) {
        const u = surfaceTexelCenterAxis(window.renderKey.chunkX, texelX);
        for (let texelY = -SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY < SURFACE_COMPILE_PROFILE.textureLayerSize - SURFACE_COMPILE_PROFILE.gutterTexels;
            texelY += 1) {
            const index = surfaceFieldTexelIndex(texelX, texelY);
            logicalU[index] = u;
            logicalV[index] = surfaceTexelCenterAxis(window.renderKey.chunkY, texelY);
            unionDistance[index] = float16BitsToFloat32(shorelineDistance[index]);
            if (waterCoverage[index] > 0) winnerBody[index] = OCEAN_BODY_ID;
        }
    }

    const thresholdDistances = new Map<number, Float64Array>();
    const thresholdLevelBits = new Map<number, number>();
    const distanceForLevel = (level: number): Float64Array => {
        const cached = thresholdDistances.get(level);
        if (cached) return cached;
        const levelBits = finiteFloat16Bits("compiled lake level", level / 0xffff * heightScale);
        const quantizedLevel = float16BitsToFloat32(levelBits);
        const magnitude = rasterSurfaceContourDistances(
            contourContext,
            surfaceHeightContours(window, level, hexSize),
            saturation
        );
        for (let index = 0; index < magnitude.length; index += 1) {
            if (float16BitsToFloat32(groundHeight[index]) < quantizedLevel) magnitude[index] *= -1;
        }
        thresholdDistances.set(level, magnitude);
        thresholdLevelBits.set(level, levelBits);
        return magnitude;
    };

    for (const shape of collected.shapes) {
        if (!surfaceHydrologyBoundsIntersect(shape.bounds, bounds)) continue;
        const contours = shape.shapeKind === "circle"
            ? circleContours(shape, bounds, hexSize)
            : polygonContours(shape, bounds, hexSize);
        const shapeMagnitude = rasterSurfaceContourDistances(contourContext, contours, saturation);
        const heightDistance = distanceForLevel(shape.level);
        const levelBits = thresholdLevelBits.get(shape.level) as number;
        const quantizedLevel = float16BitsToFloat32(levelBits);
        const influenceU = saturation / (1.5 * hexSize);
        const influenceV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
        for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
            if (logicalU[index] < shape.bounds.minU - influenceU
                || logicalU[index] > shape.bounds.maxU + influenceU
                || logicalV[index] < shape.bounds.minV - influenceV
                || logicalV[index] > shape.bounds.maxV + influenceV) continue;
            const inside = shapeContains(shape, logicalU[index], logicalV[index]);
            const shapeDistance = inside ? -shapeMagnitude[index] : shapeMagnitude[index];
            const signedDistance = Math.max(shapeDistance, heightDistance[index]);
            unionDistance[index] = Math.min(unionDistance[index], signedDistance);
            const wet = signedDistance < 0;
            const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
            const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
            if (coverage === 0) continue;
            const currentBody = winnerBody[index];
            if (coverage < waterCoverage[index]
                || coverage === waterCoverage[index] && winnerPriority[index] > 1
                || coverage === waterCoverage[index] && winnerPriority[index] === 1
                    && currentBody !== undefined && currentBody <= shape.stableIdentity) continue;
            waterCoverage[index] = coverage;
            waterKind[index] = SURFACE_WATER_KIND_LAKE;
            waterProfile[index] = shape.profileIndex;
            waterLevel[index] = levelBits;
            waterDepth[index] = finiteFloat16Bits(
                "compiled lake depth",
                Math.max(0, quantizedLevel - float16BitsToFloat32(groundHeight[index]))
            );
            flow[index * 2] = 0;
            flow[index * 2 + 1] = 0;
            winnerPriority[index] = 1;
            winnerBody[index] = shape.bodyId;
        }
    }

    const usedBodies = new Map<string, CompiledWaterBody>();
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        const wet = unionDistance[index] < 0;
        const rawCoverage = quantizeSurfaceCoverage(unionDistance[index], antialiasRadius);
        const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
        waterCoverage[index] = coverage;
        shorelineDistance[index] = finiteFloat16Bits(
            "compiled lake union shoreline distance",
            Math.max(-saturation, Math.min(saturation, unionDistance[index]))
        );
        const bodyId = winnerBody[index];
        if (coverage === 0 || bodyId === undefined) {
            waterLevel[index] = 0;
            waterDepth[index] = 0;
            waterKind[index] = 0;
            waterProfile[index] = 0;
            flow[index * 2] = 0;
            flow[index * 2 + 1] = 0;
            winnerBody[index] = undefined;
            continue;
        }
        if (bodyId === OCEAN_BODY_ID) {
            usedBodies.set(bodyId, { bodyId, kind: "ocean", profileIndex: 0 });
        } else {
            const definition = collected.bodies.get(bodyId);
            if (!definition) throw new Error("compiled lake texel lost its body definition");
            usedBodies.set(bodyId, {
                bodyId,
                kind: "lake",
                profileIndex: definition.profileIndex
            });
        }
    }
    const palette = createCompiledWaterBodyPalette([...usedBodies.values()]
        .sort((first, second) => compareIdentity(first.bodyId, second.bodyId)));
    const paletteIndex = new Map(palette.entries.map((body, index) => [body.bodyId, index + 1] as const));
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        const bodyId = winnerBody[index];
        if (bodyId !== undefined) {
            const bodyIndex = paletteIndex.get(bodyId);
            if (bodyIndex === undefined) throw new Error("compiled lake palette lost a winning body");
            waterBodyIndex[index] = bodyIndex;
        }
    }
    return Object.freeze({
        field: createCompiledSurfaceField({
            groundHeight,
            materialWeights,
            waterLevel,
            waterDepth,
            shorelineDistance,
            flow,
            waterCoverage,
            waterKind,
            waterProfile,
            waterBodyIndex
        }),
        waterBodies: palette
    });
}

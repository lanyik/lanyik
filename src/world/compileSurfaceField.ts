import {
    COMPILED_SURFACE_TEXEL_COUNT,
    CompiledSurfaceField,
    SURFACE_WATER_KIND_LAKE,
    SURFACE_WATER_KIND_OCEAN,
    SURFACE_WATER_KIND_RIVER,
    createCompiledSurfaceField,
    surfaceFieldTexelIndex
} from "./CompiledSurfaceField";
import {
    CompiledWaterBody,
    CompiledWaterBodyPalette,
    createCompiledWaterBodyPalette
} from "./CompiledWaterBodyPalette";
import {
    EffectiveWindowSemanticSample,
    sampleEffectiveWindowSemantic
} from "./EffectiveWindowSampler";
import { finiteFloat16Bits, float16BitsToFloat32 } from "./HalfFloat";
import { hydrologyRiverHalfWidthTiles } from "./HydrologyGeometry";
import { AuthoredRiverFeature } from "./HydrologyFeatureDelta";
import { OCEAN_BODY_ID } from "./HydrologyIdentity";
import {
    HYDROLOGY_POINT_QUANTIZATION,
    RiverFeatureSegment,
    RiverMouthFeature
} from "./HydrologyRegion";
import { HYDROLOGY_REGION_SIZE, SURFACE_COMPILE_PROFILE, surfaceInfluenceRadiusWorld } from "./SurfaceCompileProfile";
import {
    SurfaceContourRasterContext,
    createSurfaceContourRasterContext,
    quantizeSurfaceCoverage,
    rasterSurfaceContourDistances,
    surfaceScalarContours
} from "./SurfaceContours";
import { surfaceTexelCenterAxis, surfaceToWorld } from "./SurfaceLattice";
import {
    TransferableEffectiveWindow,
    TransferableHydrologyRegionSlice,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import {
    SurfaceHydrologyLogicalBounds,
    surfaceHydrologyBoundsIntersect,
    surfaceHydrologyProjectedOffsets,
    surfaceHydrologyQueryBounds,
    compileLakeSurfaceField
} from "./compileLakeSurfaceField";

export interface SurfaceFieldCompilation {
    readonly field: CompiledSurfaceField;
    readonly waterBodies: CompiledWaterBodyPalette;
}

interface RiverSpan {
    readonly startU: number;
    readonly startV: number;
    readonly endU: number;
    readonly endV: number;
    readonly startHalfWidth: number;
    readonly endHalfWidth: number;
    readonly startLevel: number;
    readonly endLevel: number;
    readonly logicalLength: number;
    readonly remainingLogicalLength: number;
    readonly flowX: number;
    readonly flowZ: number;
}

interface RiverShape {
    readonly bodyId: string;
    readonly stableIdentity: string;
    readonly profileIndex: number;
    readonly dischargeClass: number;
    readonly bounds: SurfaceHydrologyLogicalBounds;
    readonly spans: readonly RiverSpan[];
    readonly mouthTarget?: CompiledWaterBody;
}

interface ClosestRiverSample {
    readonly edgeDistance: number;
    readonly halfWidth: number;
    readonly level: number;
    readonly distanceToEnd: number;
    readonly flowX: number;
    readonly flowZ: number;
}

interface RiverShapeInput {
    readonly bodyId: string;
    readonly stableIdentity: string;
    readonly profileIndex: number;
    readonly dischargeClass: number;
    readonly points: Float64Array;
    readonly widthProfile: Uint8Array;
    readonly levelProfile: Uint16Array;
    readonly mouthTarget?: CompiledWaterBody;
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

function registerBody(
    catalog: Map<string, CompiledWaterBody>,
    body: Readonly<CompiledWaterBody>
): void {
    const existing = catalog.get(body.bodyId);
    if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
        throw new Error("surface hydrology body definitions disagree on kind or profile");
    }
    if (!existing) catalog.set(body.bodyId, Object.freeze({ ...body }));
}

function buildBodyCatalog(
    window: Readonly<TransferableEffectiveWindow>,
    existing: Readonly<CompiledWaterBodyPalette>
): Map<string, CompiledWaterBody> {
    const catalog = new Map<string, CompiledWaterBody>();
    for (const body of existing.entries) registerBody(catalog, body);
    registerBody(catalog, { bodyId: OCEAN_BODY_ID, kind: "ocean", profileIndex: 0 });
    for (const region of window.hydrologyRegions) {
        const suppressed = new Set(region.suppressedBaseFeatureIds);
        for (const body of region.bodies) {
            if (body.bodyId !== OCEAN_BODY_ID && suppressed.has(body.bodyId)) continue;
            registerBody(catalog, body);
        }
    }
    for (const delta of window.authoredHydrology) {
        registerBody(catalog, {
            bodyId: delta.feature.featureId,
            kind: delta.feature.kind,
            profileIndex: delta.feature.profileIndex
        });
    }
    return catalog;
}

function logicalPoints(
    points: Int16Array | Float64Array,
    originU: number,
    originV: number
): Float64Array {
    const output = new Float64Array(points.length);
    for (let index = 0; index < points.length; index += 2) {
        output[index] = originU + points[index] / HYDROLOGY_POINT_QUANTIZATION;
        output[index + 1] = originV + points[index + 1] / HYDROLOGY_POINT_QUANTIZATION;
    }
    return output;
}

function riverBounds(points: Float64Array, widthProfile: Uint8Array): SurfaceHydrologyLogicalBounds {
    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let maximumHalfWidth = 0;
    for (let index = 0; index < points.length; index += 2) {
        minU = Math.min(minU, points[index]);
        minV = Math.min(minV, points[index + 1]);
        maxU = Math.max(maxU, points[index]);
        maxV = Math.max(maxV, points[index + 1]);
        maximumHalfWidth = Math.max(
            maximumHalfWidth,
            hydrologyRiverHalfWidthTiles(widthProfile[index / 2])
        );
    }
    return {
        minU: minU - maximumHalfWidth,
        minV: minV - maximumHalfWidth,
        maxU: maxU + maximumHalfWidth,
        maxV: maxV + maximumHalfWidth
    };
}

function clipRiverSegmentAmounts(
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
    const constraints = [
        [-deltaU, startU - bounds.minU],
        [deltaU, bounds.maxU - startU],
        [-deltaV, startV - bounds.minV],
        [deltaV, bounds.maxV - startV]
    ] as const;
    for (const [direction, distance] of constraints) {
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

function buildRiverSpans(
    points: Float64Array,
    widthProfile: Uint8Array,
    levelProfile: Uint16Array,
    offsetU: number,
    offsetV: number,
    hexSize: number,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>
): readonly RiverSpan[] {
    const pointCount = points.length / 2;
    const segmentLengths = new Float64Array(pointCount - 1);
    const remainingAfterSegment = new Float64Array(pointCount - 1);
    let remaining = 0;
    for (let pointIndex = pointCount - 2; pointIndex >= 0; pointIndex -= 1) {
        const length = Math.hypot(
            points[pointIndex * 2 + 2] - points[pointIndex * 2],
            points[pointIndex * 2 + 3] - points[pointIndex * 2 + 1]
        );
        segmentLengths[pointIndex] = length;
        remainingAfterSegment[pointIndex] = remaining;
        remaining += length;
    }
    const output: RiverSpan[] = [];
    for (let pointIndex = 0; pointIndex < pointCount - 1; pointIndex += 1) {
        const originalStartU = points[pointIndex * 2] + offsetU;
        const originalStartV = points[pointIndex * 2 + 1] + offsetV;
        const originalEndU = points[pointIndex * 2 + 2] + offsetU;
        const originalEndV = points[pointIndex * 2 + 3] + offsetV;
        const deltaU = originalEndU - originalStartU;
        const deltaV = originalEndV - originalStartV;
        const startWidth = hydrologyRiverHalfWidthTiles(widthProfile[pointIndex]);
        const endWidth = hydrologyRiverHalfWidthTiles(widthProfile[pointIndex + 1]);
        const maximumHalfWidth = Math.max(startWidth, endWidth);
        const clipped = clipRiverSegmentAmounts(
            originalStartU,
            originalStartV,
            originalEndU,
            originalEndV,
            {
                minU: queryBounds.minU - maximumHalfWidth,
                minV: queryBounds.minV - maximumHalfWidth,
                maxU: queryBounds.maxU + maximumHalfWidth,
                maxV: queryBounds.maxV + maximumHalfWidth
            }
        );
        if (!clipped || clipped[0] === clipped[1]) continue;
        const amounts = [clipped[0], clipped[1]];
        if (deltaU !== 0) {
            const clippedStartU = originalStartU + deltaU * clipped[0];
            const clippedEndU = originalStartU + deltaU * clipped[1];
            for (let column = Math.floor(Math.min(clippedStartU, clippedEndU)) + 1;
                column < Math.max(clippedStartU, clippedEndU); column += 1) {
                const amount = (column - originalStartU) / deltaU;
                if (amount > clipped[0] && amount < clipped[1]) amounts.push(amount);
            }
        }
        amounts.sort((first, second) => first - second);
        for (let partIndex = 0; partIndex < amounts.length - 1; partIndex += 1) {
            const first = amounts[partIndex];
            const second = amounts[partIndex + 1];
            const startU = originalStartU + deltaU * first;
            const startV = originalStartV + deltaV * first;
            const endU = originalStartU + deltaU * second;
            const endV = originalStartV + deltaV * second;
            const logicalLength = Math.hypot(endU - startU, endV - startV);
            if (logicalLength <= 0) continue;
            const worldStart = surfaceToWorld(startU, startV, hexSize);
            const worldEnd = surfaceToWorld(endU, endV, hexSize);
            const worldDeltaX = worldEnd.x - worldStart.x;
            const worldDeltaZ = worldEnd.z - worldStart.z;
            const worldLength = Math.hypot(worldDeltaX, worldDeltaZ);
            output.push(Object.freeze({
                startU,
                startV,
                endU,
                endV,
                startHalfWidth: startWidth + (endWidth - startWidth) * first,
                endHalfWidth: startWidth + (endWidth - startWidth) * second,
                startLevel: levelProfile[pointIndex]
                    + (levelProfile[pointIndex + 1] - levelProfile[pointIndex]) * first,
                endLevel: levelProfile[pointIndex]
                    + (levelProfile[pointIndex + 1] - levelProfile[pointIndex]) * second,
                logicalLength,
                remainingLogicalLength: segmentLengths[pointIndex] * (1 - second)
                    + remainingAfterSegment[pointIndex],
                flowX: worldDeltaX / worldLength,
                flowZ: worldDeltaZ / worldLength
            }));
        }
    }
    return Object.freeze(output);
}

function projectedRiverShapes(
    window: Readonly<TransferableEffectiveWindow>,
    input: Readonly<RiverShapeInput>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    hexSize: number
): readonly RiverShape[] {
    const bounds = riverBounds(input.points, input.widthProfile);
    return Object.freeze(surfaceHydrologyProjectedOffsets(window, bounds, queryBounds).flatMap(offset => {
        const spans = buildRiverSpans(
            input.points,
            input.widthProfile,
            input.levelProfile,
            offset.u,
            offset.v,
            hexSize,
            queryBounds
        );
        if (spans.length === 0) return [];
        let minU = Number.POSITIVE_INFINITY;
        let minV = Number.POSITIVE_INFINITY;
        let maxU = Number.NEGATIVE_INFINITY;
        let maxV = Number.NEGATIVE_INFINITY;
        for (const span of spans) {
            const maximumHalfWidth = Math.max(span.startHalfWidth, span.endHalfWidth);
            minU = Math.min(minU, span.startU - maximumHalfWidth, span.endU - maximumHalfWidth);
            minV = Math.min(minV, span.startV - maximumHalfWidth, span.endV - maximumHalfWidth);
            maxU = Math.max(maxU, span.startU + maximumHalfWidth, span.endU + maximumHalfWidth);
            maxV = Math.max(maxV, span.startV + maximumHalfWidth, span.endV + maximumHalfWidth);
        }
        return [Object.freeze({
            bodyId: input.bodyId,
            stableIdentity: input.stableIdentity,
            profileIndex: input.profileIndex,
            dischargeClass: input.dischargeClass,
            mouthTarget: input.mouthTarget,
            bounds: Object.freeze({ minU, minV, maxU, maxV }),
            spans: Object.freeze(spans)
        })];
    }));
}

function mouthTarget(
    catalog: ReadonlyMap<string, CompiledWaterBody>,
    targetBodyId: string | undefined
): CompiledWaterBody | undefined {
    if (targetBodyId === undefined) return undefined;
    const target = catalog.get(targetBodyId);
    if (!target || (target.kind !== "ocean" && target.kind !== "lake")) {
        throw new Error("surface river mouth target is missing or is not terminal water");
    }
    return target;
}

function baseRiverInput(
    region: Readonly<TransferableHydrologyRegionSlice>,
    river: Readonly<RiverFeatureSegment>,
    mouth: Readonly<RiverMouthFeature> | undefined,
    catalog: ReadonlyMap<string, CompiledWaterBody>
): RiverShapeInput {
    const originU = region.key.regionX * HYDROLOGY_REGION_SIZE;
    const originV = region.key.regionY * HYDROLOGY_REGION_SIZE;
    const body = catalog.get(river.riverId);
    if (!body || body.kind !== "river") {
        throw new Error("surface base river lost its body profile");
    }
    return {
        bodyId: river.riverId,
        stableIdentity: `${river.riverId}:${river.segmentId}`,
        profileIndex: body.profileIndex,
        dischargeClass: river.dischargeClass,
        points: logicalPoints(river.controlPoints, originU, originV),
        widthProfile: river.widthProfile,
        levelProfile: river.levelProfile,
        mouthTarget: mouthTarget(catalog, mouth?.targetBodyId)
    };
}

function authoredRiverInput(
    river: Readonly<AuthoredRiverFeature>,
    catalog: ReadonlyMap<string, CompiledWaterBody>
): RiverShapeInput {
    const targetBodyId = river.outlet.kind === "ocean" || river.outlet.kind === "lake"
        ? river.outlet.bodyId : undefined;
    return {
        bodyId: river.featureId,
        stableIdentity: river.featureId,
        profileIndex: river.profileIndex,
        dischargeClass: river.dischargeClass,
        points: logicalPoints(river.controlPoints, 0, 0),
        widthProfile: river.widthProfile,
        levelProfile: river.levelProfile,
        mouthTarget: mouthTarget(catalog, targetBodyId)
    };
}

function collectRiverShapes(
    window: Readonly<TransferableEffectiveWindow>,
    queryBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    hexSize: number,
    catalog: ReadonlyMap<string, CompiledWaterBody>
): readonly RiverShape[] {
    const shapes: RiverShape[] = [];
    for (const region of window.hydrologyRegions) {
        const suppressed = new Set(region.suppressedBaseFeatureIds);
        const mouthBySegment = new Map(region.mouths.map(mouth => [mouth.segmentId, mouth] as const));
        for (const river of region.rivers) {
            if (suppressed.has(river.riverId)) continue;
            const body = catalog.get(river.riverId);
            if (!body || body.kind !== "river") {
                throw new Error("surface river segment lost its canonical body definition");
            }
            shapes.push(...projectedRiverShapes(
                window,
                baseRiverInput(region, river, mouthBySegment.get(river.segmentId), catalog),
                queryBounds,
                hexSize
            ));
        }
    }
    for (const delta of window.authoredHydrology) {
        if (delta.feature.kind !== "river") continue;
        shapes.push(...projectedRiverShapes(
            window,
            authoredRiverInput(delta.feature, catalog),
            queryBounds,
            hexSize
        ));
    }
    return Object.freeze(shapes);
}

function closestRiver(shape: Readonly<RiverShape>, u: number, v: number): ClosestRiverSample {
    let bestEdgeDistance = Number.POSITIVE_INFINITY;
    let best: ClosestRiverSample | undefined;
    for (const span of shape.spans) {
        const deltaU = span.endU - span.startU;
        const deltaV = span.endV - span.startV;
        const lengthSquared = deltaU * deltaU + deltaV * deltaV;
        const amount = Math.max(0, Math.min(1,
            ((u - span.startU) * deltaU + (v - span.startV) * deltaV) / lengthSquared
        ));
        const distance = Math.hypot(
            u - (span.startU + deltaU * amount),
            v - (span.startV + deltaV * amount)
        );
        const halfWidth = span.startHalfWidth
            + (span.endHalfWidth - span.startHalfWidth) * amount;
        const edgeDistance = distance - halfWidth;
        if (edgeDistance >= bestEdgeDistance) continue;
        bestEdgeDistance = edgeDistance;
        best = {
            edgeDistance,
            halfWidth,
            level: span.startLevel + (span.endLevel - span.startLevel) * amount,
            distanceToEnd: span.logicalLength * (1 - amount) + span.remainingLogicalLength,
            flowX: span.flowX,
            flowZ: span.flowZ
        };
    }
    if (!best) throw new Error("surface river closest-point query found no span");
    return best;
}

function intersectBounds(
    first: Readonly<SurfaceHydrologyLogicalBounds>,
    second: Readonly<SurfaceHydrologyLogicalBounds>
): SurfaceHydrologyLogicalBounds | undefined {
    const bounds = {
        minU: Math.max(first.minU, second.minU),
        minV: Math.max(first.minV, second.minV),
        maxU: Math.min(first.maxU, second.maxU),
        maxV: Math.min(first.maxV, second.maxV)
    };
    return bounds.minU < bounds.maxU && bounds.minV < bounds.maxV ? bounds : undefined;
}

function signedRiverDistances(
    window: Readonly<TransferableEffectiveWindow>,
    shape: Readonly<RiverShape>,
    activeBounds: Readonly<SurfaceHydrologyLogicalBounds>,
    contourContext: Readonly<SurfaceContourRasterContext>,
    groundHeight: Uint16Array,
    logicalU: Float64Array,
    logicalV: Float64Array,
    saturation: number
): Readonly<{ distance: Float64Array; closest: readonly (ClosestRiverSample | undefined)[] }> {
    const hexSize = window.dependencyKey.metrics.hexSize;
    const heightScale = window.dependencyKey.metrics.heightScale;
    const semanticSample: EffectiveWindowSemanticSample = {
        groundHeight: 0, biome0: 0, biome1: 0, biome2: 0, biome3: 0
    };
    const bankContours = surfaceScalarContours(
        activeBounds,
        hexSize,
        (u, v) => closestRiver(shape, u, v).edgeDistance
    );
    const bedContours = surfaceScalarContours(activeBounds, hexSize, (u, v) => {
        const closest = closestRiver(shape, u, v);
        const valid = sampleEffectiveWindowSemantic(window, u, v, heightScale, semanticSample);
        if (!valid) return heightScale;
        return semanticSample.groundHeight - closest.level / 0xffff * heightScale;
    });
    const bankMagnitude = rasterSurfaceContourDistances(contourContext, bankContours, saturation);
    const bedMagnitude = rasterSurfaceContourDistances(contourContext, bedContours, saturation);
    const distance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    distance.fill(saturation);
    const closestOutput: (ClosestRiverSample | undefined)[] = new Array(COMPILED_SURFACE_TEXEL_COUNT);
    const influenceU = saturation / (1.5 * hexSize);
    const influenceV = saturation / (Math.sqrt(3) * hexSize) + 0.5;
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        if (logicalU[index] < shape.bounds.minU - influenceU
            || logicalU[index] > shape.bounds.maxU + influenceU
            || logicalV[index] < shape.bounds.minV - influenceV
            || logicalV[index] > shape.bounds.maxV + influenceV) continue;
        const closest = closestRiver(shape, logicalU[index], logicalV[index]);
        closestOutput[index] = closest;
        const bankDistance = closest.edgeDistance < 0 ? -bankMagnitude[index] : bankMagnitude[index];
        const levelBits = finiteFloat16Bits(
            "compiled river level",
            Math.round(closest.level) / 0xffff * heightScale
        );
        const bedWet = float16BitsToFloat32(groundHeight[index]) < float16BitsToFloat32(levelBits);
        const bedDistance = bedWet ? -bedMagnitude[index] : bedMagnitude[index];
        distance[index] = Math.max(bankDistance, bedDistance);
    }
    return Object.freeze({ distance, closest: Object.freeze(closestOutput) });
}

function snorm8(value: number): number {
    return Math.max(-127, Math.min(127, Math.round(value * 127)));
}

export function compileSurfaceField(
    window: Readonly<TransferableEffectiveWindow>
): SurfaceFieldCompilation {
    assertTransferableEffectiveWindow(window);
    const lakes = compileLakeSurfaceField(window);
    const hexSize = window.dependencyKey.metrics.hexSize;
    const heightScale = window.dependencyKey.metrics.heightScale;
    const saturation = surfaceInfluenceRadiusWorld(hexSize);
    const antialiasRadius = 0.5 * Math.min(1.5 * hexSize, Math.sqrt(3) * hexSize)
        / SURFACE_COMPILE_PROFILE.samplesPerTileInterval;
    const queryBounds = surfaceHydrologyQueryBounds(window, saturation);
    const bodyCatalog = buildBodyCatalog(window, lakes.waterBodies);
    const shapes = collectRiverShapes(window, queryBounds, hexSize, bodyCatalog);
    if (shapes.length === 0) return lakes;

    const groundHeight = lakes.field.groundHeight.slice();
    const materialWeights = lakes.field.materialWeights.slice();
    const waterLevel = lakes.field.waterLevel.slice();
    const waterDepth = lakes.field.waterDepth.slice();
    const shorelineDistance = lakes.field.shorelineDistance.slice();
    const flow = lakes.field.flow.slice();
    const waterCoverage = lakes.field.waterCoverage.slice();
    const waterKind = lakes.field.waterKind.slice();
    const waterProfile = lakes.field.waterProfile.slice();
    const waterBodyIndex = new Uint8Array(COMPILED_SURFACE_TEXEL_COUNT);
    const logicalU = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const logicalV = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const unionDistance = new Float64Array(COMPILED_SURFACE_TEXEL_COUNT);
    const winnerPriority = new Uint16Array(COMPILED_SURFACE_TEXEL_COUNT);
    const winnerIdentity: (string | undefined)[] = new Array(COMPILED_SURFACE_TEXEL_COUNT);
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
            if (waterCoverage[index] === 0) continue;
            const entry = lakes.waterBodies.entries[waterBodyIndexFromField(lakes, index) - 1];
            if (!entry) throw new Error("compiled lake field has an invalid body palette reference");
            winnerBody[index] = entry.bodyId;
            winnerIdentity[index] = entry.bodyId;
            winnerPriority[index] = waterKind[index] === SURFACE_WATER_KIND_LAKE ? 1 : 0;
        }
    }
    const contourContext = createSurfaceContourRasterContext(window, hexSize);
    for (const shape of shapes) {
        if (!surfaceHydrologyBoundsIntersect(shape.bounds, queryBounds)) continue;
        const activeBounds = intersectBounds(shape.bounds, queryBounds);
        if (!activeBounds) continue;
        const compiled = signedRiverDistances(
            window,
            shape,
            activeBounds,
            contourContext,
            groundHeight,
            logicalU,
            logicalV,
            saturation
        );
        const priority = 2 + shape.dischargeClass;
        for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
            const closest = compiled.closest[index];
            if (!closest) continue;
            const signedDistance = compiled.distance[index];
            unionDistance[index] = Math.min(unionDistance[index], signedDistance);
            const wet = signedDistance < 0;
            const rawCoverage = quantizeSurfaceCoverage(signedDistance, antialiasRadius);
            const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
            if (coverage === 0) continue;
            const atMouth = shape.mouthTarget !== undefined
                && closest.distanceToEnd <= closest.halfWidth * 0.5;
            const body = atMouth ? shape.mouthTarget : bodyCatalog.get(shape.bodyId);
            if (!body) throw new Error("compiled river candidate lost its body definition");
            const identity = atMouth ? body.bodyId : shape.stableIdentity;
            if (coverage < waterCoverage[index]
                || (coverage === waterCoverage[index] && priority < winnerPriority[index])
                || (coverage === waterCoverage[index] && priority === winnerPriority[index]
                    && winnerIdentity[index] !== undefined
                    && (winnerIdentity[index] as string) <= identity)) continue;
            const levelBits = finiteFloat16Bits(
                "compiled river level",
                Math.round(closest.level) / 0xffff * heightScale
            );
            const flowX = atMouth ? 0 : snorm8(closest.flowX);
            const flowZ = atMouth ? 0 : snorm8(closest.flowZ);
            if (!atMouth && flowX === 0 && flowZ === 0) {
                throw new Error("compiled river flow quantized to a zero direction");
            }
            waterCoverage[index] = coverage;
            waterKind[index] = body.kind === "river" ? SURFACE_WATER_KIND_RIVER
                : body.kind === "lake" ? SURFACE_WATER_KIND_LAKE : SURFACE_WATER_KIND_OCEAN;
            waterProfile[index] = body.profileIndex;
            waterLevel[index] = levelBits;
            waterDepth[index] = finiteFloat16Bits(
                "compiled river depth",
                Math.max(0, float16BitsToFloat32(levelBits) - float16BitsToFloat32(groundHeight[index]))
            );
            flow[index * 2] = flowX;
            flow[index * 2 + 1] = flowZ;
            winnerPriority[index] = priority;
            winnerIdentity[index] = identity;
            winnerBody[index] = body.bodyId;
        }
    }

    const usedBodies = new Map<string, CompiledWaterBody>();
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        const wet = unionDistance[index] < 0;
        const rawCoverage = quantizeSurfaceCoverage(unionDistance[index], antialiasRadius);
        const coverage = wet ? Math.max(128, rawCoverage) : Math.min(127, rawCoverage);
        waterCoverage[index] = coverage;
        shorelineDistance[index] = finiteFloat16Bits(
            "compiled hydrology union shoreline distance",
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
        const body = bodyCatalog.get(bodyId);
        if (!body) throw new Error("compiled hydrology texel lost its body definition");
        usedBodies.set(bodyId, body);
    }
    const palette = createCompiledWaterBodyPalette([...usedBodies.values()]
        .sort((first, second) => compareIdentity(first.bodyId, second.bodyId)));
    const paletteIndex = new Map(palette.entries.map((body, index) => [body.bodyId, index + 1] as const));
    for (let index = 0; index < COMPILED_SURFACE_TEXEL_COUNT; index += 1) {
        const bodyId = winnerBody[index];
        if (bodyId === undefined) continue;
        const bodyIndex = paletteIndex.get(bodyId);
        if (bodyIndex === undefined) throw new Error("compiled hydrology palette lost a winning body");
        waterBodyIndex[index] = bodyIndex;
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

function waterBodyIndexFromField(compilation: Readonly<SurfaceFieldCompilation>, index: number): number {
    const bodyIndex = compilation.field.waterBodyIndex[index];
    if (bodyIndex === 0 || bodyIndex > compilation.waterBodies.entries.length) {
        throw new Error("compiled surface field body index is outside its palette");
    }
    return bodyIndex;
}

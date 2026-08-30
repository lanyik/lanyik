import {
    assertHydrologyRegion,
    HydrologyBodyRef,
    HydrologyRegion,
    LakeFeature,
    RiverFeatureSegment
} from "./HydrologyRegion";
import {
    HydrologyRegionSpatialIndex
} from "./HydrologySpatialIndex";
import type { HydrologyIndexedFeature } from "./HydrologySpatialIndex";
import {
    HYDROLOGY_SEA_LEVEL,
    OCEAN_BODY_ID
} from "./MacroDrainageGraph";
import {
    HYDROLOGY_COORDINATE_SCALE,
    HydrologyRegionLocalBounds
} from "./WorldSemanticFormat";

export enum HydrologyWaterKind {
    None = 0,
    Ocean = 1,
    Lake = 2,
    River = 3
}

export interface DerivedHydrologyRaster {
    readonly bounds: HydrologyRegionLocalBounds;
    readonly width: number;
    readonly height: number;
    readonly coverage: Uint8Array;
    readonly kind: Uint8Array;
    readonly level: Uint16Array;
    readonly flow: Int8Array;
    readonly bodyIndex: Uint8Array;
    readonly bodies: readonly HydrologyBodyRef[];
}

export interface DerivedHydrologyRasterOptions {
    readonly bounds?: HydrologyRegionLocalBounds;
    /** X-major ground heights for exactly the requested bounds. */
    readonly macroHeight: Uint16Array;
    readonly spatialIndex?: HydrologyRegionSpatialIndex;
}

interface RiverHit {
    coverage: number;
    distance: number;
    level: number;
    flowX: number;
    flowY: number;
    segment: RiverFeatureSegment;
}

function assertBounds(bounds: HydrologyRegionLocalBounds, region: HydrologyRegion): void {
    if (!bounds || !Number.isInteger(bounds.minX) || !Number.isInteger(bounds.minY)
        || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive)
        || bounds.minX < region.validBounds.minX || bounds.minY < region.validBounds.minY
        || bounds.maxXExclusive > region.validBounds.maxXExclusive
        || bounds.maxYExclusive > region.validBounds.maxYExclusive
        || bounds.minX >= bounds.maxXExclusive || bounds.minY >= bounds.maxYExclusive) {
        throw new RangeError("derived hydrology raster bounds must lie inside region validBounds");
    }
}

function pointInLake(x: number, y: number, lake: LakeFeature): boolean {
    let inside = false;
    const points = lake.boundaryPoints;
    for (let current = 0, previous = points.length - 2; current < points.length; previous = current, current += 2) {
        const currentX = points[current];
        const currentY = points[current + 1];
        const previousX = points[previous];
        const previousY = points[previous + 1];
        const crosses = (currentY > y) !== (previousY > y)
            && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX;
        if (crosses) inside = !inside;
    }
    return inside;
}

function riverHit(x: number, y: number, segment: RiverFeatureSegment): RiverHit | undefined {
    let best: RiverHit | undefined;
    const points = segment.controlPoints;
    for (let index = 0; index < points.length - 2; index += 2) {
        const startX = points[index];
        const startY = points[index + 1];
        const endX = points[index + 2];
        const endY = points[index + 3];
        const dx = endX - startX;
        const dy = endY - startY;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) continue;
        const amount = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
        const nearestX = startX + dx * amount;
        const nearestY = startY + dy * amount;
        const distance = Math.hypot(x - nearestX, y - nearestY);
        const width = segment.widthProfile[index / 2]
            + (segment.widthProfile[index / 2 + 1] - segment.widthProfile[index / 2]) * amount;
        const coverage = Math.max(0, Math.min(255, Math.round((width / 2 + HYDROLOGY_COORDINATE_SCALE / 2 - distance)
            / HYDROLOGY_COORDINATE_SCALE * 255)));
        if (coverage === 0) continue;
        const length = Math.sqrt(lengthSquared);
        const candidate: RiverHit = {
            coverage,
            distance,
            level: Math.round(segment.levelProfile[index / 2]
                + (segment.levelProfile[index / 2 + 1] - segment.levelProfile[index / 2]) * amount),
            flowX: Math.round(dx / length * 127),
            flowY: Math.round(dy / length * 127),
            segment
        };
        if (!best || candidate.coverage > best.coverage
            || candidate.coverage === best.coverage
                && (candidate.segment.dischargeClass > best.segment.dischargeClass
                    || candidate.segment.dischargeClass === best.segment.dischargeClass
                        && candidate.segment.segmentId < best.segment.segmentId)) {
            best = candidate;
        }
    }
    return best;
}

export function deriveHydrologyRaster(
    region: HydrologyRegion,
    options: DerivedHydrologyRasterOptions
): DerivedHydrologyRaster {
    assertHydrologyRegion(region);
    if (!options || typeof options !== "object") throw new TypeError("derived hydrology raster options are required");
    const bounds = options.bounds ?? region.validBounds;
    assertBounds(bounds, region);
    const width = bounds.maxXExclusive - bounds.minX;
    const height = bounds.maxYExclusive - bounds.minY;
    const tileCount = width * height;
    if (!(options.macroHeight instanceof Uint16Array) || options.macroHeight.length !== tileCount) {
        throw new TypeError(`derived hydrology macroHeight must be a Uint16Array of length ${tileCount}`);
    }
    const spatialIndex = options.spatialIndex ?? new HydrologyRegionSpatialIndex(region);
    if (spatialIndex.region !== region) {
        throw new TypeError("hydrology spatial index belongs to a different region snapshot");
    }
    const bodyLookup = new Map(region.bodies.map((body, index) => [body.bodyId, index + 1]));
    const oceanIndex = bodyLookup.get(OCEAN_BODY_ID);
    if (!oceanIndex) throw new TypeError("hydrology region body palette does not contain the reserved ocean body");
    const coverage = new Uint8Array(tileCount);
    const kind = new Uint8Array(tileCount);
    const level = new Uint16Array(tileCount);
    const flow = new Int8Array(tileCount * 2);
    const bodyIndex = new Uint8Array(tileCount);
    const candidates: HydrologyIndexedFeature[] = [];

    for (let localX = bounds.minX; localX < bounds.maxXExclusive; localX += 1) {
        for (let localY = bounds.minY; localY < bounds.maxYExclusive; localY += 1) {
            const rasterX = localX - bounds.minX;
            const rasterY = localY - bounds.minY;
            const index = rasterX * height + rasterY;
            spatialIndex.queryTile(localX, localY, candidates);
            const pointX = (localX + 0.5) * HYDROLOGY_COORDINATE_SCALE;
            const pointY = (localY + 0.5) * HYDROLOGY_COORDINATE_SCALE;
            let bestRiver: RiverHit | undefined;
            let bestLake: LakeFeature | undefined;
            for (const candidate of candidates) {
                if (candidate.kind === "river") {
                    const hit = riverHit(pointX, pointY, candidate.feature);
                    if (hit && (!bestRiver || hit.coverage > bestRiver.coverage
                        || hit.coverage === bestRiver.coverage
                            && (hit.segment.dischargeClass > bestRiver.segment.dischargeClass
                                || hit.segment.dischargeClass === bestRiver.segment.dischargeClass
                                    && hit.segment.segmentId < bestRiver.segment.segmentId))) {
                        bestRiver = hit;
                    }
                } else if (candidate.kind === "lake" && pointInLake(pointX, pointY, candidate.feature)
                    && (!bestLake || candidate.feature.bodyId < bestLake.bodyId)) {
                    bestLake = candidate.feature;
                }
            }
            if (bestRiver) {
                const paletteIndex = bodyLookup.get(bestRiver.segment.riverId);
                if (!paletteIndex) throw new TypeError("river raster hit has no body palette entry");
                coverage[index] = bestRiver.coverage;
                kind[index] = HydrologyWaterKind.River;
                level[index] = bestRiver.level;
                flow[index * 2] = bestRiver.flowX;
                flow[index * 2 + 1] = bestRiver.flowY;
                bodyIndex[index] = paletteIndex;
            } else if (bestLake) {
                const paletteIndex = bodyLookup.get(bestLake.bodyId);
                if (!paletteIndex) throw new TypeError("lake raster hit has no body palette entry");
                coverage[index] = 255;
                kind[index] = HydrologyWaterKind.Lake;
                level[index] = bestLake.level;
                bodyIndex[index] = paletteIndex;
            } else if (options.macroHeight[index] < HYDROLOGY_SEA_LEVEL) {
                coverage[index] = 255;
                kind[index] = HydrologyWaterKind.Ocean;
                level[index] = HYDROLOGY_SEA_LEVEL;
                bodyIndex[index] = oceanIndex;
            }
        }
    }

    return Object.freeze({
        bounds: Object.freeze({ ...bounds }),
        width,
        height,
        coverage,
        kind,
        level,
        flow,
        bodyIndex,
        bodies: region.bodies
    });
}

export function derivedHydrologyRasterTransferables(raster: DerivedHydrologyRaster): Transferable[] {
    return [
        raster.coverage.buffer,
        raster.kind.buffer,
        raster.level.buffer,
        raster.flow.buffer,
        raster.bodyIndex.buffer
    ];
}

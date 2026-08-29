import {
    HydrologyBodyRef,
    HYDROLOGY_POINT_QUANTIZATION,
    HydrologyRegion,
    LakeFeature,
    OCEAN_HYDROLOGY_PROFILE,
    RiverFeatureSegment,
    RiverMouthFeature,
    assertHydrologyRegion
} from "./HydrologyRegion";

export const HYDROLOGY_SPATIAL_CELL_SIZE = 16;
export const HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES = 0.5;
export const HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES = 0.25;

export const HYDROLOGY_KIND_NONE = 0;
export const HYDROLOGY_KIND_OCEAN = 1;
export const HYDROLOGY_KIND_LAKE = 2;
export const HYDROLOGY_KIND_RIVER = 3;

export type HydrologyKind = typeof HYDROLOGY_KIND_NONE
    | typeof HYDROLOGY_KIND_OCEAN
    | typeof HYDROLOGY_KIND_LAKE
    | typeof HYDROLOGY_KIND_RIVER;

export interface HydrologySample {
    readonly coverage: number;
    readonly kind: HydrologyKind;
    readonly level: number;
    readonly depth: number;
    readonly flowX: number;
    readonly flowY: number;
    readonly profileIndex: number;
    readonly body?: HydrologyBodyRef;
}

interface SpatialBucket {
    readonly rivers: readonly number[];
    readonly lakes: readonly number[];
}

interface WaterCandidate {
    readonly coverage: number;
    readonly kind: Exclude<HydrologyKind, typeof HYDROLOGY_KIND_NONE>;
    readonly level: number;
    readonly flowX: number;
    readonly flowY: number;
    readonly body: HydrologyBodyRef;
    readonly priority: number;
    readonly stableIdentity: string;
    readonly mouth?: RiverMouthFeature;
    readonly mouthDistance?: number;
    readonly halfWidth?: number;
}

interface ClosestRiverPoint {
    readonly distance: number;
    readonly level: number;
    readonly halfWidth: number;
    readonly flowX: number;
    readonly flowY: number;
    readonly distanceToEnd: number;
}

const OCEAN_BODY_REF: HydrologyBodyRef = Object.freeze({
    bodyId: "ocean",
    kind: "ocean",
    profileIndex: OCEAN_HYDROLOGY_PROFILE
});

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function compareCandidate(first: WaterCandidate, second: WaterCandidate | undefined): boolean {
    if (!second) return true;
    return first.coverage > second.coverage
        || (first.coverage === second.coverage
            && (first.priority > second.priority
                || (first.priority === second.priority && first.stableIdentity < second.stableIdentity)));
}

function profileAt(profile: Uint8Array | Uint16Array, index: number, amount: number): number {
    return Math.round(profile[index] + (profile[index + 1] - profile[index]) * amount);
}

function closestRiverPoint(river: Readonly<RiverFeatureSegment>, x: number, y: number): ClosestRiverPoint {
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    let bestLevel = 0;
    let bestHalfWidth = 0;
    let bestFlowX = 0;
    let bestFlowY = 0;
    let bestSegmentIndex = -1;
    let bestSegmentAmount = 0;
    const pointCount = river.controlPoints.length / 2;
    for (let segmentIndex = 0; segmentIndex < pointCount - 1; segmentIndex += 1) {
        const startX = river.controlPoints[segmentIndex * 2] / HYDROLOGY_POINT_QUANTIZATION;
        const startY = river.controlPoints[segmentIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION;
        const endX = river.controlPoints[segmentIndex * 2 + 2] / HYDROLOGY_POINT_QUANTIZATION;
        const endY = river.controlPoints[segmentIndex * 2 + 3] / HYDROLOGY_POINT_QUANTIZATION;
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const lengthSquared = deltaX * deltaX + deltaY * deltaY;
        if (lengthSquared === 0) continue;
        const amount = clamp(((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared, 0, 1);
        const closestX = startX + deltaX * amount;
        const closestY = startY + deltaY * amount;
        const distanceSquared = (x - closestX) ** 2 + (y - closestY) ** 2;
        if (distanceSquared >= bestDistanceSquared) continue;
        bestDistanceSquared = distanceSquared;
        bestLevel = profileAt(river.levelProfile, segmentIndex, amount);
        bestHalfWidth = hydrologyRiverHalfWidthTiles(profileAt(river.widthProfile, segmentIndex, amount));
        bestFlowX = Math.sign(deltaX);
        bestFlowY = Math.sign(deltaY);
        bestSegmentIndex = segmentIndex;
        bestSegmentAmount = amount;
    }
    if (!Number.isFinite(bestDistanceSquared)) throw new Error("river segment has no non-zero geometry span");
    let bestDistanceToEnd = 0;
    for (let segmentIndex = bestSegmentIndex; segmentIndex < pointCount - 1; segmentIndex += 1) {
        const startX = river.controlPoints[segmentIndex * 2] / HYDROLOGY_POINT_QUANTIZATION;
        const startY = river.controlPoints[segmentIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION;
        const endX = river.controlPoints[segmentIndex * 2 + 2] / HYDROLOGY_POINT_QUANTIZATION;
        const endY = river.controlPoints[segmentIndex * 2 + 3] / HYDROLOGY_POINT_QUANTIZATION;
        const length = Math.hypot(endX - startX, endY - startY);
        bestDistanceToEnd += segmentIndex === bestSegmentIndex ? length * (1 - bestSegmentAmount) : length;
    }
    return {
        distance: Math.sqrt(bestDistanceSquared),
        level: bestLevel,
        halfWidth: bestHalfWidth,
        flowX: bestFlowX,
        flowY: bestFlowY,
        distanceToEnd: bestDistanceToEnd
    };
}

function rangeFor(minimum: number, maximum: number, count: number): readonly [number, number] {
    return [
        clamp(Math.floor(minimum / HYDROLOGY_SPATIAL_CELL_SIZE), 0, count - 1),
        clamp(Math.floor(maximum / HYDROLOGY_SPATIAL_CELL_SIZE), 0, count - 1)
    ];
}

export function hydrologyRiverHalfWidthTiles(widthClass: number): number {
    if (!Number.isInteger(widthClass) || widthClass <= 0 || widthClass > 0xff) {
        throw new RangeError("hydrology river width class must be a positive uint8 value");
    }
    return HYDROLOGY_RIVER_BASE_HALF_WIDTH_TILES
        + widthClass * HYDROLOGY_RIVER_WIDTH_CLASS_STEP_TILES;
}

export class HydrologyRegionSpatialIndex {
    public readonly region: HydrologyRegion;
    public readonly cellCountX: number;
    public readonly cellCountY: number;
    private readonly buckets: readonly SpatialBucket[];
    private readonly bodies: ReadonlyMap<string, HydrologyBodyRef>;
    private readonly mouths: ReadonlyMap<string, RiverMouthFeature>;

    constructor(region: HydrologyRegion) {
        assertHydrologyRegion(region);
        this.region = region;
        this.cellCountX = Math.ceil(region.validBounds.maxXExclusive / HYDROLOGY_SPATIAL_CELL_SIZE);
        this.cellCountY = Math.ceil(region.validBounds.maxYExclusive / HYDROLOGY_SPATIAL_CELL_SIZE);
        const mutableBuckets = Array.from(
            { length: this.cellCountX * this.cellCountY },
            () => ({ rivers: [] as number[], lakes: [] as number[] })
        );
        const addToBuckets = (
            kind: "rivers" | "lakes",
            featureIndex: number,
            minimumX: number,
            minimumY: number,
            maximumX: number,
            maximumY: number
        ): void => {
            const [minimumCellX, maximumCellX] = rangeFor(minimumX, maximumX, this.cellCountX);
            const [minimumCellY, maximumCellY] = rangeFor(minimumY, maximumY, this.cellCountY);
            for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
                for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
                    mutableBuckets[cellX * this.cellCountY + cellY][kind].push(featureIndex);
                }
            }
        };
        for (let riverIndex = 0; riverIndex < region.rivers.length; riverIndex += 1) {
            const river = region.rivers[riverIndex];
            let minimumX = Number.POSITIVE_INFINITY;
            let minimumY = Number.POSITIVE_INFINITY;
            let maximumX = Number.NEGATIVE_INFINITY;
            let maximumY = Number.NEGATIVE_INFINITY;
            let maximumHalfWidth = 0;
            for (let pointIndex = 0; pointIndex < river.widthProfile.length; pointIndex += 1) {
                minimumX = Math.min(
                    minimumX,
                    river.controlPoints[pointIndex * 2] / HYDROLOGY_POINT_QUANTIZATION
                );
                minimumY = Math.min(
                    minimumY,
                    river.controlPoints[pointIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION
                );
                maximumX = Math.max(
                    maximumX,
                    river.controlPoints[pointIndex * 2] / HYDROLOGY_POINT_QUANTIZATION
                );
                maximumY = Math.max(
                    maximumY,
                    river.controlPoints[pointIndex * 2 + 1] / HYDROLOGY_POINT_QUANTIZATION
                );
                maximumHalfWidth = Math.max(maximumHalfWidth, hydrologyRiverHalfWidthTiles(
                    river.widthProfile[pointIndex]
                ));
            }
            addToBuckets(
                "rivers",
                riverIndex,
                minimumX - maximumHalfWidth - 0.5,
                minimumY - maximumHalfWidth - 0.5,
                maximumX + maximumHalfWidth + 0.5,
                maximumY + maximumHalfWidth + 0.5
            );
        }
        for (let lakeIndex = 0; lakeIndex < region.lakes.length; lakeIndex += 1) {
            const lake = region.lakes[lakeIndex];
            const centerX = lake.center[0] / HYDROLOGY_POINT_QUANTIZATION;
            const centerY = lake.center[1] / HYDROLOGY_POINT_QUANTIZATION;
            const radius = lake.radius / HYDROLOGY_POINT_QUANTIZATION;
            addToBuckets("lakes", lakeIndex, centerX - radius - 0.5, centerY - radius - 0.5,
                centerX + radius + 0.5, centerY + radius + 0.5);
        }
        this.buckets = Object.freeze(mutableBuckets.map(bucket => Object.freeze({
            rivers: Object.freeze(bucket.rivers),
            lakes: Object.freeze(bucket.lakes)
        })));
        this.bodies = new Map(region.bodies.map(body => [body.bodyId, body]));
        this.mouths = new Map(region.mouths.map(mouth => [mouth.segmentId, mouth]));
    }

    public query(localX: number, localY: number, groundHeight: number, seaLevel: number): HydrologySample {
        if (!Number.isFinite(localX) || !Number.isFinite(localY)
            || localX < 0 || localX >= this.region.validBounds.maxXExclusive
            || localY < 0 || localY >= this.region.validBounds.maxYExclusive) {
            throw new RangeError("hydrology query point lies outside region valid bounds");
        }
        if (!Number.isInteger(groundHeight) || groundHeight < 0 || groundHeight > 0xffff
            || !Number.isInteger(seaLevel) || seaLevel < 0 || seaLevel > 0xffff) {
            throw new RangeError("hydrology query heights must be uint16 values");
        }
        const cellX = Math.floor(localX / HYDROLOGY_SPATIAL_CELL_SIZE);
        const cellY = Math.floor(localY / HYDROLOGY_SPATIAL_CELL_SIZE);
        const bucket = this.buckets[cellX * this.cellCountY + cellY];
        let best: WaterCandidate | undefined;
        if (groundHeight < seaLevel) {
            best = {
                coverage: 0xff,
                kind: HYDROLOGY_KIND_OCEAN,
                level: seaLevel,
                flowX: 0,
                flowY: 0,
                body: OCEAN_BODY_REF,
                priority: 0,
                stableIdentity: "ocean"
            };
        }
        for (const lakeIndex of bucket.lakes) {
            const lake = this.region.lakes[lakeIndex] as LakeFeature;
            if (groundHeight > lake.level) continue;
            const distance = Math.hypot(
                localX - lake.center[0] / HYDROLOGY_POINT_QUANTIZATION,
                localY - lake.center[1] / HYDROLOGY_POINT_QUANTIZATION
            );
            const coverage = clamp(Math.round((
                lake.radius / HYDROLOGY_POINT_QUANTIZATION + 0.5 - distance
            ) * 255), 0, 255);
            if (coverage === 0) continue;
            const body = this.bodies.get(lake.bodyId);
            if (!body) throw new Error("hydrology lake query lost its body reference");
            const candidate: WaterCandidate = {
                coverage,
                kind: HYDROLOGY_KIND_LAKE,
                level: lake.level,
                flowX: 0,
                flowY: 0,
                body,
                priority: 1,
                stableIdentity: lake.bodyId
            };
            if (compareCandidate(candidate, best)) best = candidate;
        }
        for (const riverIndex of bucket.rivers) {
            const river = this.region.rivers[riverIndex] as RiverFeatureSegment;
            const closest = closestRiverPoint(river, localX, localY);
            const coverage = clamp(Math.round((closest.halfWidth + 0.5 - closest.distance) * 255), 0, 255);
            if (coverage === 0) continue;
            const body = this.bodies.get(river.riverId);
            if (!body) throw new Error("hydrology river query lost its body reference");
            const candidate: WaterCandidate = {
                coverage,
                kind: HYDROLOGY_KIND_RIVER,
                level: closest.level,
                flowX: closest.flowX,
                flowY: closest.flowY,
                body,
                priority: 2 + river.dischargeClass,
                stableIdentity: `${river.riverId}:${river.segmentId}`,
                mouth: this.mouths.get(river.segmentId),
                mouthDistance: closest.distanceToEnd,
                halfWidth: closest.halfWidth
            };
            if (compareCandidate(candidate, best)) best = candidate;
        }
        if (!best) {
            return Object.freeze({
                coverage: 0,
                kind: HYDROLOGY_KIND_NONE,
                level: 0,
                depth: 0,
                flowX: 0,
                flowY: 0,
                profileIndex: 0
            });
        }
        if (best.mouth && best.mouthDistance !== undefined && best.halfWidth !== undefined
            && best.mouthDistance <= best.halfWidth * 0.5) {
            const target = this.bodies.get(best.mouth.targetBodyId);
            if (!target) throw new Error("hydrology mouth query lost its target body reference");
            best = {
                ...best,
                kind: target.kind === "ocean" ? HYDROLOGY_KIND_OCEAN : HYDROLOGY_KIND_LAKE,
                flowX: 0,
                flowY: 0,
                body: target,
                stableIdentity: target.bodyId
            };
        }
        return Object.freeze({
            coverage: best.coverage,
            kind: best.kind,
            level: best.level,
            depth: Math.max(0, best.level - groundHeight),
            flowX: best.flowX,
            flowY: best.flowY,
            profileIndex: best.body.profileIndex,
            body: best.body
        });
    }
}

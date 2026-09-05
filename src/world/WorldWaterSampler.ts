import { Land } from "../enums";
import { Point } from "../interfaces";
import { LandformDomain } from "./LandformSampler";
import {
    createRiverReach,
    forEachHexRiverReach,
    RiverReach,
    trimRiverReachStart,
    worldAxialToOffset,
    worldOffsetToAxial
} from "./hexRaster";
import { fractalNoise2D, periodicFractalNoise2D, randomAt } from "./noise";
import { WorldStyleProfile } from "./WorldStyleProfile";

export interface WorldWaterSurfaceSample {
    readonly baseTerrain: Land;
    readonly landform: {
        readonly elevation: number;
        readonly continentalness: number;
        readonly ocean: number;
        readonly valley: number;
        readonly moisture: number;
    };
}

export type WorldWaterSampleAt = (
    x: number,
    y: number
) => Readonly<WorldWaterSurfaceSample> | undefined;

interface WaterPage {
    readonly riverBits: Uint8Array;
}

interface TracedCourse {
    readonly points: readonly Point[];
}

interface RasterCourseNode {
    readonly world: Point;
    readonly nextWorld?: Point;
    readonly nextKey?: string;
    reach?: RiverReach;
    distanceToSea: number;
    visibleDistanceToSea: number;
    hasIncoming: boolean;
    flow: number;
    radius: number;
}

interface DrainageNode {
    readonly sample: Readonly<WorldWaterSurfaceSample>;
    readonly potential: number;
    nextResolved: boolean;
    nextDelta?: Point;
}

export interface WorldWaterSampler {
    readonly stats: Readonly<WorldWaterSamplerStats>;
    isRiverTile(x: number, y: number, sampleAt: WorldWaterSampleAt): boolean;
    forEachRiverTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void;
}

export interface WorldWaterSamplerStats {
    readonly cachedTilePages: number;
    readonly cachedOverviewPages: number;
    readonly tilePageBuilds: number;
    readonly tilePageHits: number;
    readonly overviewPageBuilds: number;
    readonly overviewPageHits: number;
    readonly directExtentRasterizations: number;
}

const UINT32_RANGE = 0x1_0000_0000;
const OVERVIEW_PAGE_SIZE_MULTIPLIER = 4;
const MAX_OVERVIEW_PAGE_AREA_OVERHEAD = 4;
const AXIAL_NEIGHBORS: readonly Point[] = Object.freeze([
    Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 0, y: -1 }),
    Object.freeze({ x: -1, y: 0 }),
    Object.freeze({ x: -1, y: 1 }),
    Object.freeze({ x: 0, y: 1 }),
    Object.freeze({ x: 1, y: -1 })
]);

const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const amount = clamp01((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
};
const pointKey = (point: Point): string => `${point.x},${point.y}`;
const bitArrayLength = (size: number): number => Math.ceil(size / 8);
const hasBit = (bits: Uint8Array, index: number): boolean =>
    (bits[Math.floor(index / 8)] & (1 << (index % 8))) !== 0;
const setBit = (bits: Uint8Array, index: number): void => {
    const offset = Math.floor(index / 8);
    bits[offset] |= 1 << (index % 8);
};

function mix32(value: number): number {
    let mixed = value >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

function sourceKey(seed: number, cellX: number, cellY: number, slot: number, salt: number): number {
    return mix32(
        seed
        ^ salt
        ^ Math.imul(cellX, 0x632be5ab)
        ^ Math.imul(cellY, 0x85157af5)
        ^ Math.imul(slot, 0x9e3779b1)
    );
}

function randomForSource(seed: number, key: number, salt: number): number {
    return mix32(seed ^ key ^ Math.imul(salt, 0x27d4eb2d)) / UINT32_RANGE;
}

function assertExtent(originX: number, originY: number, width: number, height: number): void {
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
        throw new RangeError("water extent origins must be safe integers");
    }
    if (!Number.isSafeInteger(width) || width <= 0
        || !Number.isSafeInteger(height) || height <= 0) {
        throw new RangeError("water extent dimensions must be positive safe integers");
    }
    if (!Number.isSafeInteger(originX + width - 1)
        || !Number.isSafeInteger(originY + height - 1)
        || !Number.isSafeInteger(width * height)) {
        throw new RangeError("water extent exceeds safe integer coordinates");
    }
}

class DrainageWorldWaterSampler implements WorldWaterSampler {
    private readonly pages = new Map<string, WaterPage>();
    private readonly overviewPages = new Map<string, WaterPage>();
    private readonly courseStep: number;
    private toroidalMask: Uint8Array | undefined;
    private tilePageBuilds = 0;
    private tilePageHits = 0;
    private overviewPageBuilds = 0;
    private overviewPageHits = 0;
    private directExtentRasterizations = 0;

    constructor(
        private readonly numericSeed: number,
        private readonly domain: LandformDomain,
        private readonly profile: Readonly<WorldStyleProfile>
    ) {
        this.courseStep = this.resolveCourseStep();
    }

    public get stats(): Readonly<WorldWaterSamplerStats> {
        return {
            cachedTilePages: this.pages.size,
            cachedOverviewPages: this.overviewPages.size,
            tilePageBuilds: this.tilePageBuilds,
            tilePageHits: this.tilePageHits,
            overviewPageBuilds: this.overviewPageBuilds,
            overviewPageHits: this.overviewPageHits,
            directExtentRasterizations: this.directExtentRasterizations
        };
    }

    public isRiverTile(x: number, y: number, sampleAt: WorldWaterSampleAt): boolean {
        if (this.domain.topology === "toroidal") {
            const mask = this.toroidalMask ??= this.buildToroidalMask(sampleAt);
            const canonicalX = positiveModulo(x, this.domain.width);
            const canonicalY = positiveModulo(y, this.domain.height);
            return hasBit(mask, canonicalX * this.domain.height + canonicalY);
        }
        const pageSize = this.profile.rivers.pageSize;
        const pageX = Math.floor(x / pageSize);
        const pageY = Math.floor(y / pageSize);
        const page = this.pageFor(this.pages, pageX, pageY, pageSize, sampleAt, false);
        const localX = x - pageX * pageSize;
        const localY = y - pageY * pageSize;
        return hasBit(page.riverBits, localX * pageSize + localY);
    }

    public forEachRiverTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void {
        assertExtent(originX, originY, width, height);
        if (this.domain.topology === "toroidal") {
            const mask = this.toroidalMask ??= this.buildToroidalMask(sampleAt);
            for (let x = originX; x < originX + width; x += 1) {
                const canonicalX = positiveModulo(x, this.domain.width);
                for (let y = originY; y < originY + height; y += 1) {
                    const canonicalY = positiveModulo(y, this.domain.height);
                    if (hasBit(mask, canonicalX * this.domain.height + canonicalY)) visit(x, y);
                }
            }
            return;
        }
        if (this.shouldUseOverviewPages(originX, originY, width, height)) {
            this.visitOverviewPages(originX, originY, width, height, sampleAt, visit);
            return;
        }
        this.directExtentRasterizations += 1;
        this.rasterizeCourses(originX, originY, width, height, sampleAt, visit);
    }

    private shouldUseOverviewPages(originX: number, originY: number, width: number, height: number): boolean {
        const pageSize = this.profile.rivers.pageSize * OVERVIEW_PAGE_SIZE_MULTIPLIER;
        const firstPageX = Math.floor(originX / pageSize);
        const lastPageX = Math.floor((originX + width - 1) / pageSize);
        const firstPageY = Math.floor(originY / pageSize);
        const lastPageY = Math.floor((originY + height - 1) / pageSize);
        const pageCount = (lastPageX - firstPageX + 1) * (lastPageY - firstPageY + 1);
        return pageCount <= this.profile.rivers.maximumCachedPages
            && pageCount * pageSize * pageSize <= width * height * MAX_OVERVIEW_PAGE_AREA_OVERHEAD;
    }

    private visitOverviewPages(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void {
        const pageSize = this.profile.rivers.pageSize * OVERVIEW_PAGE_SIZE_MULTIPLIER;
        const firstPageX = Math.floor(originX / pageSize);
        const lastPageX = Math.floor((originX + width - 1) / pageSize);
        const firstPageY = Math.floor(originY / pageSize);
        const lastPageY = Math.floor((originY + height - 1) / pageSize);
        const endX = originX + width;
        const endY = originY + height;
        for (let pageX = firstPageX; pageX <= lastPageX; pageX += 1) {
            const pageOriginX = pageX * pageSize;
            const startX = Math.max(originX, pageOriginX);
            const stopX = Math.min(endX, pageOriginX + pageSize);
            for (let pageY = firstPageY; pageY <= lastPageY; pageY += 1) {
                const pageOriginY = pageY * pageSize;
                const startY = Math.max(originY, pageOriginY);
                const stopY = Math.min(endY, pageOriginY + pageSize);
                const page = this.pageFor(
                    this.overviewPages,
                    pageX,
                    pageY,
                    pageSize,
                    sampleAt,
                    true
                );
                for (let x = startX; x < stopX; x += 1) {
                    const column = (x - pageOriginX) * pageSize;
                    for (let y = startY; y < stopY; y += 1) {
                        if (hasBit(page.riverBits, column + y - pageOriginY)) visit(x, y);
                    }
                }
            }
        }
    }

    private pageFor(
        cache: Map<string, WaterPage>,
        pageX: number,
        pageY: number,
        pageSize: number,
        sampleAt: WorldWaterSampleAt,
        overview: boolean
    ): WaterPage {
        const key = `${pageX},${pageY}`;
        let page = cache.get(key);
        if (page) {
            cache.delete(key);
            cache.set(key, page);
            if (overview) this.overviewPageHits += 1;
            else this.tilePageHits += 1;
            return page;
        }
        page = this.buildPage(pageX, pageY, pageSize, sampleAt);
        cache.set(key, page);
        if (overview) this.overviewPageBuilds += 1;
        else this.tilePageBuilds += 1;
        while (cache.size > this.profile.rivers.maximumCachedPages) {
            const oldest = cache.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            cache.delete(oldest);
        }
        return page;
    }

    private resolveCourseStep(): number {
        const requested = this.profile.rivers.courseStep;
        if (this.domain.topology !== "toroidal") return requested;
        for (let step = requested; step >= 1; step -= 1) {
            if (this.domain.width % step === 0 && this.domain.height % step === 0
                && (this.domain.width / step) % 2 === 0) return step;
        }
        return 1;
    }

    private courseToBaseWorld(point: Point): Point {
        return worldAxialToOffset({ x: point.x * this.courseStep, y: point.y * this.courseStep });
    }

    private courseWarpAt(base: Readonly<Point>, salt: number): number {
        const rivers = this.profile.rivers;
        if (this.domain.topology === "toroidal") {
            const x = positiveModulo(base.x, this.domain.width);
            const y = positiveModulo(base.y, this.domain.height);
            return periodicFractalNoise2D(
                this.numericSeed ^ salt,
                x / this.domain.width,
                y / this.domain.height,
                Math.max(1, Math.round(this.domain.width * rivers.courseWarpScale)),
                Math.max(1, Math.round(this.domain.height * rivers.courseWarpScale)),
                rivers.courseWarpOctaves
            );
        }
        return fractalNoise2D(
            this.numericSeed ^ salt,
            base.x * rivers.courseWarpScale,
            base.y * rivers.courseWarpScale,
            rivers.courseWarpOctaves
        );
    }

    private courseToWorld(point: Point): Point {
        const base = this.courseToBaseWorld(point);
        const rivers = this.profile.rivers;
        // Preserve the authored amplitude on the normal lattice. Small tori
        // shrink the lattice and its warp together; do not silently cap 3.75 at 3.5.
        const amplitude = rivers.courseWarpAmplitude * this.courseStep / rivers.courseStep;
        if (amplitude === 0) return base;
        return {
            x: base.x + Math.round((this.courseWarpAt(base, rivers.courseWarpSalt) * 2 - 1) * amplitude),
            y: base.y + Math.round(
                (this.courseWarpAt(base, rivers.courseWarpSalt ^ 0x9e3779b9) * 2 - 1) * amplitude
            )
        };
    }

    private normalizeWorld(point: Point): Point | undefined {
        if (this.domain.topology === "infinite") return point;
        if (this.domain.topology === "toroidal") {
            return {
                x: positiveModulo(point.x, this.domain.width),
                y: positiveModulo(point.y, this.domain.height)
            };
        }
        return point.x >= 0 && point.x < this.domain.width
            && point.y >= 0 && point.y < this.domain.height
            ? point
            : undefined;
    }

    private canonicalCourseKey(point: Point): string {
        const base = this.courseToBaseWorld(point);
        return pointKey(this.normalizeWorld(base) ?? base);
    }

    private sourceSuitability(sample: Readonly<WorldWaterSurfaceSample>): number {
        if (sample.baseTerrain === Land.sea || sample.baseTerrain === Land.coastal
            || sample.baseTerrain === Land.mountain || sample.baseTerrain === Land.snow) return 0;
        const rivers = this.profile.rivers;
        const elevation = smoothstep(
            rivers.sourceMinimumElevation,
            rivers.sourceMinimumElevation + rivers.sourceElevationTransition,
            sample.landform.elevation
        ) * (1 - smoothstep(
            rivers.sourceMaximumElevation - rivers.sourceElevationTransition,
            rivers.sourceMaximumElevation,
            sample.landform.elevation
        ));
        const moisture = rivers.sourceMoistureFloor
            + (1 - rivers.sourceMoistureFloor)
                * smoothstep(rivers.sourceMinimumMoisture, 1, sample.landform.moisture);
        return clamp01(elevation * moisture);
    }

    private drainagePotential(point: Point, sample: Readonly<WorldWaterSurfaceSample>): number {
        if (sample.baseTerrain === Land.sea || sample.baseTerrain === Land.coastal) return -1;
        if (sample.baseTerrain === Land.mountain || sample.baseTerrain === Land.snow) return Infinity;
        const rivers = this.profile.rivers;
        const unwrappedWorld = this.courseToWorld(point);
        const world = this.normalizeWorld(unwrappedWorld) ?? unwrappedWorld;
        const jitter = (randomAt(this.numericSeed, world.x, world.y, rivers.flowSalt) - 0.5)
            * rivers.potentialJitter;
        return sample.landform.ocean * rivers.potentialOceanWeight
            + sample.landform.elevation * rivers.potentialElevationWeight
            - sample.landform.valley * rivers.potentialValleyWeight
            - sample.landform.moisture * rivers.potentialMoistureWeight
            + jitter;
    }

    private drainageNode(
        point: Point,
        sampleAt: WorldWaterSampleAt,
        cache: Map<string, DrainageNode>
    ): DrainageNode | undefined {
        const key = this.canonicalCourseKey(point);
        const cached = cache.get(key);
        if (cached) return cached;
        const world = this.courseToWorld(point);
        const sample = sampleAt(world.x, world.y);
        if (!sample) return undefined;
        const node: DrainageNode = {
            sample,
            potential: this.drainagePotential(point, sample),
            nextResolved: false
        };
        cache.set(key, node);
        return node;
    }

    private nextCoursePoint(
        point: Point,
        node: DrainageNode,
        sampleAt: WorldWaterSampleAt,
        cache: Map<string, DrainageNode>
    ): Point | undefined {
        if (node.nextResolved) {
            return node.nextDelta
                ? { x: point.x + node.nextDelta.x, y: point.y + node.nextDelta.y }
                : undefined;
        }
        let bestDelta: Point | undefined;
        let bestPotential = node.potential;
        for (const delta of AXIAL_NEIGHBORS) {
            const candidate = { x: point.x + delta.x, y: point.y + delta.y };
            const adjacent = this.drainageNode(candidate, sampleAt, cache);
            if (adjacent && adjacent.potential < bestPotential) {
                bestDelta = delta;
                bestPotential = adjacent.potential;
            }
        }
        node.nextResolved = true;
        node.nextDelta = bestDelta;
        return bestDelta ? { x: point.x + bestDelta.x, y: point.y + bestDelta.y } : undefined;
    }

    private traceCourse(
        source: Point,
        sampleAt: WorldWaterSampleAt,
        cache: Map<string, DrainageNode>
    ): TracedCourse | undefined {
        const rivers = this.profile.rivers;
        const points: Point[] = [];
        const visited = new Set<string>();
        let current = source;
        let reachedSea = false;
        for (let index = 0; index < rivers.maximumCourseLength; index += 1) {
            const key = this.canonicalCourseKey(current);
            if (visited.has(key)) break;
            visited.add(key);
            const node = this.drainageNode(current, sampleAt, cache);
            if (!node) break;
            points.push(current);
            if (node.sample.baseTerrain === Land.sea || node.sample.baseTerrain === Land.coastal) {
                reachedSea = true;
                break;
            }
            const next = this.nextCoursePoint(current, node, sampleAt, cache);
            if (!next) break;
            current = next;
        }
        if (!reachedSea || points.length < rivers.minimumCourseLength) return undefined;
        // Extend only along real incoming drainage edges. This lengthens the
        // same course without adding sources, random walks or uphill water.
        for (let step = 0; step < rivers.upstreamExtensionSteps && points.length < rivers.maximumCourseLength; step += 1) {
            const head = points[0];
            const headKey = this.canonicalCourseKey(head);
            let upstream: Point | undefined;
            let bestPotential = -Infinity;
            for (const delta of AXIAL_NEIGHBORS) {
                const candidate = { x: head.x + delta.x, y: head.y + delta.y };
                const node = this.drainageNode(candidate, sampleAt, cache);
                if (!node || node.potential <= bestPotential || this.sourceSuitability(node.sample) === 0) continue;
                const next = this.nextCoursePoint(candidate, node, sampleAt, cache);
                if (!next || this.canonicalCourseKey(next) !== headKey) continue;
                bestPotential = node.potential;
                upstream = candidate;
            }
            if (!upstream) break;
            points.unshift(upstream);
        }
        return { points };
    }

    private sourceFor(
        regionX: number,
        regionY: number,
        slot: number,
        sampleAt: WorldWaterSampleAt,
        cache: Map<string, DrainageNode>
    ): Point | undefined {
        const rivers = this.profile.rivers;
        const key = sourceKey(this.numericSeed, regionX, regionY, slot, rivers.sourceSalt);
        const source = {
            x: regionX * rivers.sourceCellSize
                + Math.floor(randomForSource(this.numericSeed, key, 1) * rivers.sourceCellSize),
            y: regionY * rivers.sourceCellSize
                + Math.floor(randomForSource(this.numericSeed, key, 2) * rivers.sourceCellSize)
        };
        const node = this.drainageNode(source, sampleAt, cache);
        if (!node) return undefined;
        const chance = rivers.sourceSpawnChance * this.sourceSuitability(node.sample);
        return randomForSource(this.numericSeed, key, 3) < chance ? source : undefined;
    }

    private coursesForExtent(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt
    ): TracedCourse[] {
        const rivers = this.profile.rivers;
        // A toroidal mask covers the complete canonical domain, so every
        // source only needs to be enumerated once. Open pages still include
        // the maximum upstream reach so a course entering the page is stable
        // regardless of which page requested it.
        const reach = this.domain.topology === "toroidal"
            ? 0
            : rivers.maximumCourseLength * this.courseStep + Math.ceil(
                this.courseStep + rivers.courseWarpAmplitude * 2
                    + rivers.highFlowCourseRadius * rivers.mouthWidthMultiplier * 2
            );
        const corners = [
            worldOffsetToAxial({ x: originX - reach, y: originY - reach }),
            worldOffsetToAxial({ x: originX + width - 1 + reach, y: originY - reach }),
            worldOffsetToAxial({ x: originX - reach, y: originY + height - 1 + reach }),
            worldOffsetToAxial({ x: originX + width - 1 + reach, y: originY + height - 1 + reach })
        ];
        const minimumX = Math.floor(Math.min(...corners.map(point => point.x)) / this.courseStep) - 1;
        const maximumX = Math.ceil(Math.max(...corners.map(point => point.x)) / this.courseStep) + 1;
        const minimumY = Math.floor(Math.min(...corners.map(point => point.y)) / this.courseStep) - 1;
        const maximumY = Math.ceil(Math.max(...corners.map(point => point.y)) / this.courseStep) + 1;
        const firstRegionX = Math.floor(minimumX / rivers.sourceCellSize);
        const lastRegionX = Math.floor(maximumX / rivers.sourceCellSize);
        const firstRegionY = Math.floor(minimumY / rivers.sourceCellSize);
        const lastRegionY = Math.floor(maximumY / rivers.sourceCellSize);
        const sources = new Set<string>();
        const courses: TracedCourse[] = [];
        const drainage = new Map<string, DrainageNode>();
        for (let regionX = firstRegionX; regionX <= lastRegionX; regionX += 1) {
            for (let regionY = firstRegionY; regionY <= lastRegionY; regionY += 1) {
                for (let slot = 0; slot < rivers.sourcesPerCell; slot += 1) {
                    const source = this.sourceFor(regionX, regionY, slot, sampleAt, drainage);
                    if (!source) continue;
                    const key = this.canonicalCourseKey(source);
                    if (sources.has(key)) continue;
                    sources.add(key);
                    const course = this.traceCourse(source, sampleAt, drainage);
                    if (course) courses.push(course);
                }
            }
        }
        return courses;
    }

    private rasterizeCourses(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void {
        const courses = this.coursesForExtent(originX, originY, width, height, sampleAt);
        const nodes = new Map<string, RasterCourseNode>();
        for (const course of courses) {
            let nextWorld: Point | undefined;
            let nextKey: string | undefined;
            for (let index = course.points.length - 1; index >= 0; index -= 1) {
                const point = course.points[index];
                const world = this.courseToWorld(point);
                const key = this.canonicalCourseKey(point);
                const node = nodes.get(key);
                if (node) node.flow += 1;
                else nodes.set(key, {
                    world, nextWorld, nextKey, distanceToSea: 0, visibleDistanceToSea: 0,
                    hasIncoming: false, flow: 1, radius: 0
                });
                nextWorld = world;
                nextKey = key;
            }
        }
        for (const node of nodes.values()) {
            if (node.nextKey !== undefined) nodes.get(node.nextKey)!.hasIncoming = true;
        }
        // Reverse course insertion is downstream-first even across confluences.
        // Each midpoint spline's end is exactly the next spline's start. Keep
        // directions in the current unwrapped frame when a toroidal alias joins.
        for (const node of nodes.values()) {
            if (!node.nextWorld || node.nextKey === undefined) continue;
            const next = nodes.get(node.nextKey)!;
            const downstream = next.nextWorld ? {
                x: node.nextWorld.x + next.nextWorld.x - next.world.x,
                y: node.nextWorld.y + next.nextWorld.y - next.world.y
            } : undefined;
            node.reach = createRiverReach(node.world, node.nextWorld, downstream, !node.hasIncoming);
            node.distanceToSea = next.distanceToSea + node.reach.length;
        }
        const rivers = this.profile.rivers;
        // Length changes only the retained upstream extent. Trace the same
        // complete drainage graph first, so widths, bends and mouths stay fixed.
        for (const course of courses) {
            const head = nodes.get(this.canonicalCourseKey(course.points[0]))!;
            head.visibleDistanceToSea = Math.max(
                head.visibleDistanceToSea, head.distanceToSea * rivers.courseLengthRatio
            );
        }
        // Propagate source budgets downstream; confluences keep the union of
        // all contributing suffixes, never leaving a branch disconnected.
        const upstreamFirst = [...nodes.values()].reverse();
        for (const node of upstreamFirst) {
            if (node.nextKey === undefined) continue;
            const next = nodes.get(node.nextKey)!;
            next.visibleDistanceToSea = Math.max(next.visibleDistanceToSea, node.visibleDistanceToSea);
        }
        for (const node of nodes.values()) {
            const flowRadius = rivers.baseCourseRadius
                + (rivers.highFlowCourseRadius - rivers.baseCourseRadius)
                    * smoothstep(1, rivers.highFlowThreshold, node.flow);
            const mouth = 1 - smoothstep(0, rivers.mouthWideningDistance, node.distanceToSea);
            node.radius = flowRadius * (1 + (rivers.mouthWidthMultiplier - 1) * mouth);
        }
        const endX = originX + width;
        const endY = originY + height;
        const visited = new Set<number>();
        const emit = (point: Point): void => {
            const normalized = this.normalizeWorld(point);
            if (!normalized || normalized.x < originX || normalized.x >= endX
                || normalized.y < originY || normalized.y >= endY) return;
            const index = (normalized.x - originX) * height + normalized.y - originY;
            if (visited.has(index)) return;
            visited.add(index);
            visit(normalized.x, normalized.y);
        };
        // Every directed reach has one downstream edge and one width profile,
        // including confluences and toroidal copies. Rasterize it only once.
        for (const node of nodes.values()) {
            if (!node.reach || node.nextKey === undefined) continue;
            const next = nodes.get(node.nextKey)!;
            if (node.visibleDistanceToSea <= next.distanceToSea) continue;
            const trim = Math.max(0, node.distanceToSea - node.visibleDistanceToSea);
            const fraction = node.reach.length > 0 ? trim / node.reach.length : 0;
            forEachHexRiverReach(
                trimRiverReachStart(node.reach, trim),
                node.radius + (next.radius - node.radius) * fraction, next.radius, emit
            );
        }
    }

    private buildPage(
        pageX: number,
        pageY: number,
        pageSize: number,
        sampleAt: WorldWaterSampleAt
    ): WaterPage {
        const riverBits = new Uint8Array(bitArrayLength(pageSize * pageSize));
        const originX = pageX * pageSize;
        const originY = pageY * pageSize;
        this.rasterizeCourses(originX, originY, pageSize, pageSize, sampleAt, (x, y) => {
            setBit(riverBits, (x - originX) * pageSize + y - originY);
        });
        return { riverBits };
    }

    private buildToroidalMask(sampleAt: WorldWaterSampleAt): Uint8Array {
        if (this.domain.topology !== "toroidal") throw new Error("toroidal mask requires a toroidal domain");
        const domain = this.domain;
        const mask = new Uint8Array(bitArrayLength(domain.width * domain.height));
        this.rasterizeCourses(0, 0, domain.width, domain.height, sampleAt, (x, y) => {
            setBit(mask, x * domain.height + y);
        });
        return mask;
    }
}

export function createWorldWaterSampler(
    numericSeed: number,
    domain: LandformDomain,
    profile: Readonly<WorldStyleProfile>
): WorldWaterSampler {
    if (!Number.isSafeInteger(numericSeed) || numericSeed < 0 || numericSeed > 0xffff_ffff) {
        throw new RangeError("water sampler seed must be an unsigned 32-bit integer");
    }
    return new DrainageWorldWaterSampler(numericSeed, domain, profile);
}

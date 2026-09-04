import { Land } from "../enums";
import { Point } from "../interfaces";
import { LandformDomain } from "./LandformSampler";
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

interface DrainageNode {
    readonly sample: Readonly<WorldWaterSurfaceSample>;
    readonly potential: number;
    nextResolved: boolean;
    nextDelta?: Point;
}

export interface WorldWaterSampler {
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

const UINT32_RANGE = 0x1_0000_0000;
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

function offsetToAxial(point: Point): Point {
    return { x: point.x, y: point.y - (point.x - positiveModulo(point.x, 2)) / 2 };
}

function axialToOffset(point: Point): Point {
    return { x: point.x, y: point.y + (point.x - positiveModulo(point.x, 2)) / 2 };
}

function cubeRound(x: number, y: number, z: number): Point {
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    const dx = Math.abs(rx - x);
    const dy = Math.abs(ry - y);
    const dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return axialToOffset({ x: rx, y: rz });
}

function hexLine(from: Point, to: Point): Point[] {
    const first = offsetToAxial(from);
    const second = offsetToAxial(to);
    const firstY = -first.x - first.y;
    const secondY = -second.x - second.y;
    const distance = Math.max(
        Math.abs(first.x - second.x),
        Math.abs(firstY - secondY),
        Math.abs(first.y - second.y)
    );
    const result: Point[] = [];
    for (let index = 0; index <= distance; index += 1) {
        const amount = distance === 0 ? 0 : index / distance;
        result.push(cubeRound(
            first.x + (second.x - first.x) * amount,
            firstY + (secondY - firstY) * amount,
            first.y + (second.y - first.y) * amount
        ));
    }
    return result;
}

function forEachHexDisk(center: Point, radius: number, visit: (point: Point) => void): void {
    const origin = offsetToAxial(center);
    for (let dx = -radius; dx <= radius; dx += 1) {
        const minimumY = Math.max(-radius, -dx - radius);
        const maximumY = Math.min(radius, -dx + radius);
        for (let dy = minimumY; dy <= maximumY; dy += 1) {
            visit(axialToOffset({ x: origin.x + dx, y: origin.y + dy }));
        }
    }
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
    private readonly courseStep: number;
    private toroidalMask: Uint8Array | undefined;

    constructor(
        private readonly numericSeed: number,
        private readonly domain: LandformDomain,
        private readonly profile: Readonly<WorldStyleProfile>
    ) {
        this.courseStep = this.resolveCourseStep();
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
        const key = `${pageX},${pageY}`;
        let page = this.pages.get(key);
        if (page) {
            this.pages.delete(key);
            this.pages.set(key, page);
        } else {
            page = this.buildPage(pageX, pageY, sampleAt);
            this.pages.set(key, page);
            while (this.pages.size > this.profile.rivers.maximumCachedPages) {
                const oldest = this.pages.keys().next().value as string | undefined;
                if (oldest === undefined) break;
                this.pages.delete(oldest);
            }
        }
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
        this.rasterizeCourses(originX, originY, width, height, sampleAt, visit);
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
        return axialToOffset({ x: point.x * this.courseStep, y: point.y * this.courseStep });
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
        const amplitude = Math.min(rivers.courseWarpAmplitude, Math.max(0, (this.courseStep - 1) / 2));
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
        return reachedSea && points.length >= rivers.minimumCourseLength ? { points } : undefined;
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
            : rivers.maximumCourseLength * this.courseStep + Math.ceil(rivers.courseWarpAmplitude * 2);
        const corners = [
            offsetToAxial({ x: originX - reach, y: originY - reach }),
            offsetToAxial({ x: originX + width - 1 + reach, y: originY - reach }),
            offsetToAxial({ x: originX - reach, y: originY + height - 1 + reach }),
            offsetToAxial({ x: originX + width - 1 + reach, y: originY + height - 1 + reach })
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
        const flow = new Map<string, number>();
        for (const course of courses) {
            for (const point of course.points) {
                const key = this.canonicalCourseKey(point);
                flow.set(key, (flow.get(key) ?? 0) + 1);
            }
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
        for (const course of courses) {
            for (let index = 1; index < course.points.length; index += 1) {
                const fromCourse = course.points[index - 1];
                const toCourse = course.points[index];
                const amount = Math.max(
                    flow.get(this.canonicalCourseKey(fromCourse)) ?? 1,
                    flow.get(this.canonicalCourseKey(toCourse)) ?? 1
                );
                const radius = amount >= this.profile.rivers.highFlowThreshold
                    ? this.profile.rivers.highFlowCourseRadius
                    : this.profile.rivers.baseCourseRadius;
                for (const point of hexLine(this.courseToWorld(fromCourse), this.courseToWorld(toCourse))) {
                    forEachHexDisk(point, radius, emit);
                }
            }
        }
    }

    private buildPage(pageX: number, pageY: number, sampleAt: WorldWaterSampleAt): WaterPage {
        const pageSize = this.profile.rivers.pageSize;
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

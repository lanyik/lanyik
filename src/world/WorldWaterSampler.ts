import { Land } from "../enums";
import {
    getNeighbors,
    NEIGHBOR_DIRECTION_BITS,
    NeighborDirection,
    oppositeNeighborDirection
} from "../helpers/neighbors";
import { Point } from "../interfaces";
import { LandformDomain } from "./LandformSampler";
import { randomAt } from "./noise";
import { WorldStyleProfile } from "./WorldStyleProfile";

export interface WorldWaterSurfaceSample {
    readonly baseTerrain: Land;
    readonly lakePotential: number;
    readonly landform: {
        readonly elevation: number;
        readonly continentalness: number;
        readonly valley: number;
        readonly moisture: number;
    };
}

export type WorldWaterSampleAt = (
    x: number,
    y: number
) => Readonly<WorldWaterSurfaceSample> | undefined;

interface WaterPage {
    // -1 is dry; 0..63 is the explicit connected-edge mask.
    readonly riverEdges: Int8Array;
}

interface TracedWaterCourse {
    readonly points: readonly Point[];
    readonly mouth?: Point;
}

export interface WorldWaterSamplerStats {
    readonly cachedPages: number;
    readonly maximumCachedPages: number;
    readonly toroidalMaskReady: boolean;
    readonly toroidalRiverTiles: number;
}

export interface WorldWaterSampler {
    riverEdgesAt(x: number, y: number, sampleAt: WorldWaterSampleAt): number | undefined;
    isRiverTile(x: number, y: number, sampleAt: WorldWaterSampleAt): boolean;
    readonly stats: WorldWaterSamplerStats;
    clear(): void;
}

const UINT32_RANGE = 0x1_0000_0000;
const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const amount = clamp01((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
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

function isSourceTerrain(type: Land): boolean {
    return type === Land.land || type === Land.sand || type === Land.tundra;
}

class DeterministicWorldWaterSampler implements WorldWaterSampler {
    private readonly pages = new Map<string, WaterPage>();
    private toroidalMask: Int8Array | undefined;

    constructor(
        private readonly numericSeed: number,
        private readonly domain: LandformDomain,
        private readonly profile: Readonly<WorldStyleProfile>
    ) {}

    public riverEdgesAt(x: number, y: number, sampleAt: WorldWaterSampleAt): number | undefined {
        if (this.domain.topology === "toroidal") {
            const canonicalX = positiveModulo(x, this.domain.width);
            const canonicalY = positiveModulo(y, this.domain.height);
            const mask = this.toroidalMask ??= this.buildToroidalMask(sampleAt);
            const value = mask[canonicalX * this.domain.height + canonicalY];
            return value < 0 ? undefined : value;
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
        const value = page.riverEdges[localX * pageSize + localY];
        return value < 0 ? undefined : value;
    }

    public isRiverTile(x: number, y: number, sampleAt: WorldWaterSampleAt): boolean {
        return this.riverEdgesAt(x, y, sampleAt) !== undefined;
    }

    public get stats(): WorldWaterSamplerStats {
        const mask = this.toroidalMask;
        let toroidalRiverTiles = 0;
        if (mask) for (const value of mask) toroidalRiverTiles += value >= 0 ? 1 : 0;
        return Object.freeze({
            cachedPages: this.pages.size,
            maximumCachedPages: this.profile.rivers.maximumCachedPages,
            toroidalMaskReady: mask !== undefined,
            toroidalRiverTiles
        });
    }

    public clear(): void {
        this.pages.clear();
        this.toroidalMask = undefined;
    }

    private normalizePoint(point: Point): Point | undefined {
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

    private sourceSuitability(sample: Readonly<WorldWaterSurfaceSample>): number {
        if (!isSourceTerrain(sample.baseTerrain)) return 0;
        const rivers = this.profile.rivers;
        const elevationBand = smoothstep(
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
        const valley = rivers.sourceValleyFloor + (1 - rivers.sourceValleyFloor) * sample.landform.valley;
        return clamp01(elevationBand * moisture * valley);
    }

    private drainagePotential(point: Point, sample: Readonly<WorldWaterSurfaceSample>): number {
        if (sample.baseTerrain === Land.sea || sample.baseTerrain === Land.coastal) return -1;
        if (sample.baseTerrain === Land.mountain || sample.baseTerrain === Land.snow) return Infinity;
        const rivers = this.profile.rivers;
        const jitter = (randomAt(this.numericSeed, point.x, point.y, rivers.flowSalt) - 0.5)
            * rivers.potentialJitter;
        return sample.landform.continentalness * rivers.potentialContinentalWeight
            + sample.landform.elevation * rivers.potentialElevationWeight
            - sample.landform.valley * rivers.potentialValleyWeight
            - sample.landform.moisture * rivers.potentialMoistureWeight
            - sample.lakePotential * rivers.potentialLakeWeight
            + jitter;
    }

    private traceCourse(source: Point, sampleAt: WorldWaterSampleAt): TracedWaterCourse | undefined {
        const rivers = this.profile.rivers;
        const course: Point[] = [];
        let current = this.normalizePoint(source);
        let mouth: Point | undefined;
        for (let step = 0; current && step < rivers.maximumCourseLength; step += 1) {
            const sample = sampleAt(current.x, current.y);
            if (!sample) break;
            if (sample.baseTerrain === Land.sea || sample.baseTerrain === Land.coastal) {
                mouth = current;
                break;
            }
            if (!isSourceTerrain(sample.baseTerrain)) break;
            course.push(current);
            const currentPotential = this.drainagePotential(current, sample);
            let next: Point | undefined;
            let nextPotential = currentPotential;
            for (const neighbor of getNeighbors(current.x, current.y)) {
                const canonical = this.normalizePoint(neighbor);
                if (!canonical) continue;
                const adjacent = sampleAt(canonical.x, canonical.y);
                if (!adjacent) continue;
                const potential = this.drainagePotential(canonical, adjacent);
                if (potential < nextPotential) {
                    next = canonical;
                    nextPotential = potential;
                }
            }
            if (!next) break;
            current = next;
        }
        return course.length >= rivers.minimumCourseLength || (mouth && course.length >= 2)
            ? { points: course, mouth }
            : undefined;
    }

    private directionBetween(from: Point, to: Point): NeighborDirection {
        for (const neighbor of getNeighbors(from.x, from.y)) {
            const canonical = this.normalizePoint(neighbor);
            if (canonical?.x === to.x && canonical.y === to.y) return neighbor.direction;
        }
        throw new Error("water course contains non-neighboring hex cells");
    }

    private sourceForCell(
        cellX: number,
        cellY: number,
        slot: number,
        cellWidth: number,
        cellHeight: number,
        sampleAt: WorldWaterSampleAt
    ): Point | undefined {
        const rivers = this.profile.rivers;
        const key = sourceKey(this.numericSeed, cellX, cellY, slot, rivers.sourceSalt);
        const point = this.normalizePoint({
            x: Math.floor((cellX + 0.06 + randomForSource(this.numericSeed, key, 0x137) * 0.88) * cellWidth),
            y: Math.floor((cellY + 0.06 + randomForSource(this.numericSeed, key, 0x1b3) * 0.88) * cellHeight)
        });
        if (!point) return undefined;
        const sample = sampleAt(point.x, point.y);
        if (!sample) return undefined;
        const chance = rivers.sourceSpawnChance * this.sourceSuitability(sample);
        return randomForSource(this.numericSeed, key, 0x217) < chance ? point : undefined;
    }

    private visitSourceCells(
        firstCellX: number,
        lastCellX: number,
        firstCellY: number,
        lastCellY: number,
        cellWidth: number,
        cellHeight: number,
        sampleAt: WorldWaterSampleAt,
        visitEdge: (point: Point, direction: NeighborDirection) => void
    ): void {
        const rivers = this.profile.rivers;
        for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
            for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
                for (let slot = 0; slot < rivers.sourcesPerCell; slot += 1) {
                    const source = this.sourceForCell(
                        cellX, cellY, slot, cellWidth, cellHeight, sampleAt
                    );
                    if (!source) continue;
                    const course = this.traceCourse(source, sampleAt);
                    if (!course) continue;
                    for (let index = 1; index < course.points.length; index += 1) {
                        const previous = course.points[index - 1];
                        const current = course.points[index];
                        const direction = this.directionBetween(previous, current);
                        visitEdge(previous, direction);
                        visitEdge(current, oppositeNeighborDirection(direction));
                    }
                    if (course.mouth) {
                        const last = course.points[course.points.length - 1];
                        visitEdge(last, this.directionBetween(last, course.mouth));
                    }
                }
            }
        }
    }

    private buildPage(pageX: number, pageY: number, sampleAt: WorldWaterSampleAt): WaterPage {
        const rivers = this.profile.rivers;
        const pageSize = rivers.pageSize;
        const minX = pageX * pageSize;
        const minY = pageY * pageSize;
        const maxX = minX + pageSize - 1;
        const maxY = minY + pageSize - 1;
        const reach = rivers.maximumCourseLength;
        const firstCellX = Math.floor((minX - reach) / rivers.sourceCellSize);
        const lastCellX = Math.floor((maxX + reach) / rivers.sourceCellSize);
        const firstCellY = Math.floor((minY - reach) / rivers.sourceCellSize);
        const lastCellY = Math.floor((maxY + reach) / rivers.sourceCellSize);
        const riverEdges = new Int8Array(pageSize * pageSize);
        riverEdges.fill(-1);
        this.visitSourceCells(
            firstCellX,
            lastCellX,
            firstCellY,
            lastCellY,
            rivers.sourceCellSize,
            rivers.sourceCellSize,
            sampleAt,
            (point, direction) => {
                const localX = point.x - minX;
                const localY = point.y - minY;
                if (localX >= 0 && localX < pageSize && localY >= 0 && localY < pageSize) {
                    const index = localX * pageSize + localY;
                    const value = Math.max(0, riverEdges[index]);
                    riverEdges[index] = value | 1 << NEIGHBOR_DIRECTION_BITS[direction];
                }
            }
        );
        return { riverEdges };
    }

    private buildToroidalMask(sampleAt: WorldWaterSampleAt): Int8Array {
        if (this.domain.topology !== "toroidal") throw new Error("toroidal water mask requires a toroidal domain");
        const domain = this.domain;
        const rivers = this.profile.rivers;
        const columns = Math.max(1, Math.ceil(domain.width / rivers.sourceCellSize));
        const rows = Math.max(1, Math.ceil(domain.height / rivers.sourceCellSize));
        const mask = new Int8Array(domain.width * domain.height);
        mask.fill(-1);
        this.visitSourceCells(
            0,
            columns - 1,
            0,
            rows - 1,
            domain.width / columns,
            domain.height / rows,
            sampleAt,
            (point, direction) => {
                const index = point.x * domain.height + point.y;
                const value = Math.max(0, mask[index]);
                mask[index] = value | 1 << NEIGHBOR_DIRECTION_BITS[direction];
            }
        );
        return mask;
    }
}

export function createWorldWaterSampler(
    numericSeed: number,
    domain: LandformDomain,
    profile: Readonly<WorldStyleProfile>
): WorldWaterSampler {
    return new DeterministicWorldWaterSampler(numericSeed, domain, profile);
}

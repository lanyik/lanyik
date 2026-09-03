import { Land } from "../enums";
import {
    getNeighbors,
    NEIGHBOR_DIRECTION_BITS,
    NeighborDirection,
    oppositeNeighborDirection
} from "../helpers/neighbors";
import { Point } from "../interfaces";
import {
    createInfiniteWaterCurveFieldFromUint32,
    scaleInfiniteWaterCurveProfile,
    type InfiniteWaterCurveField,
    type WaterCurveBounds,
    type WaterCurvePath
} from "./InfiniteWaterCurveField";
import { LandformDomain } from "./LandformSampler";
import { WorldStyleProfile } from "./WorldStyleProfile";

export interface WorldWaterSurfaceSample {
    readonly baseTerrain: Land;
}

export type WorldWaterSampleAt = (
    x: number,
    y: number
) => Readonly<WorldWaterSurfaceSample> | undefined;

interface WaterPage {
    // -1 is dry; 0..63 is the explicit connected-edge mask.
    readonly riverEdges: Int8Array;
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
    forEachRiverTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void;
    readonly stats: WorldWaterSamplerStats;
    clear(): void;
}

const SQRT_THREE = Math.sqrt(3);
const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;

function assertRiverExtent(originX: number, originY: number, width: number, height: number): void {
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
        throw new RangeError("water extent origins must be safe integers");
    }
    if (!Number.isSafeInteger(width) || width <= 0
        || !Number.isSafeInteger(height) || height <= 0) {
        throw new RangeError("water extent dimensions must be positive safe integers");
    }
    if (!Number.isSafeInteger(originX + width - 1)
        || !Number.isSafeInteger(originY + height - 1)) {
        throw new RangeError("water extent exceeds safe integer coordinates");
    }
    if (!Number.isSafeInteger(width * height)) {
        throw new RangeError("water extent area exceeds safe integer indexing");
    }
}

function isRiverTerrain(type: Land): boolean {
    return type === Land.land || type === Land.sand || type === Land.tundra;
}

function isOpenWater(type: Land): boolean {
    return type === Land.sea || type === Land.coastal;
}

interface CubePoint {
    readonly q: number;
    readonly r: number;
    readonly s: number;
}

function roundCube(q: number, r: number, s: number): CubePoint {
    let roundedQ = Math.round(q);
    let roundedR = Math.round(r);
    let roundedS = Math.round(s);
    const qDifference = Math.abs(roundedQ - q);
    const rDifference = Math.abs(roundedR - r);
    const sDifference = Math.abs(roundedS - s);
    if (qDifference > rDifference && qDifference > sDifference) roundedQ = -roundedR - roundedS;
    else if (rDifference > sDifference) roundedR = -roundedQ - roundedS;
    else roundedS = -roundedQ - roundedR;
    return { q: roundedQ, r: roundedR, s: roundedS };
}

function cubeToOffset(point: CubePoint): Point {
    return { x: point.q, y: point.r + Math.ceil(point.q / 2) };
}

function offsetToCube(point: Point): CubePoint {
    const q = point.x;
    const r = point.y - Math.ceil(point.x / 2);
    return { q, r, s: -q - r };
}

// getHexCenter() uses an even-column half-row offset. Removing its global
// half-row translation yields ordinary axial coordinates, which can be rounded
// and line-rasterized without axis-aligned bias.
function worldPointToHex(point: { readonly x: number; readonly y: number }): Point {
    const q = point.x * (2 / 3);
    const r = -point.x / 3 + point.y / SQRT_THREE - 0.5;
    return cubeToOffset(roundCube(q, r, -q - r));
}

function hexLine(from: Point, to: Point): readonly Point[] {
    const start = offsetToCube(from);
    const end = offsetToCube(to);
    const distance = Math.max(
        Math.abs(end.q - start.q),
        Math.abs(end.r - start.r),
        Math.abs(end.s - start.s)
    );
    if (distance === 0) return [from];
    const result: Point[] = [];
    for (let index = 0; index <= distance; index += 1) {
        const amount = index / distance;
        const rounded = roundCube(
            start.q + (end.q - start.q) * amount,
            start.r + (end.r - start.r) * amount,
            start.s + (end.s - start.s) * amount
        );
        const point = cubeToOffset(rounded);
        const previous = result[result.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) result.push(point);
    }
    return result;
}

function tileExtentToWorldBounds(
    originX: number,
    originY: number,
    width: number,
    height: number
): WaterCurveBounds {
    return {
        minX: originX * 1.5 - 1,
        maxX: (originX + width - 1) * 1.5 + 1,
        minY: originY * SQRT_THREE - 1,
        maxY: (originY + height) * SQRT_THREE + 1
    };
}

class DeterministicWorldWaterSampler implements WorldWaterSampler {
    private readonly pages = new Map<string, WaterPage>();
    private readonly curveField: InfiniteWaterCurveField | undefined;
    private readonly toroidalCurveField: InfiniteWaterCurveField | undefined;
    private toroidalMask: Int8Array | undefined;

    constructor(
        numericSeed: number,
        private readonly domain: LandformDomain,
        private readonly profile: Readonly<WorldStyleProfile>
    ) {
        if (domain.topology === "toroidal") {
            const scale = Math.min(
                1,
                Math.max(domain.width, domain.height) / profile.rivers.toroidalReferenceSize
            );
            this.toroidalCurveField = createInfiniteWaterCurveFieldFromUint32(
                numericSeed,
                scaleInfiniteWaterCurveProfile(profile.rivers.curve, scale)
            );
        } else {
            this.curveField = createInfiniteWaterCurveFieldFromUint32(numericSeed, profile.rivers.curve);
        }
    }

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

    public forEachRiverTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        sampleAt: WorldWaterSampleAt,
        visit: (x: number, y: number) => void
    ): void {
        assertRiverExtent(originX, originY, width, height);
        if (typeof visit !== "function") throw new TypeError("river tile visitor must be a function");
        const endX = originX + width;
        const endY = originY + height;
        if (this.domain.topology === "toroidal") {
            const mask = this.toroidalMask ??= this.buildToroidalMask(sampleAt);
            for (let x = originX; x < endX; x += 1) {
                const canonicalX = positiveModulo(x, this.domain.width);
                for (let y = originY; y < endY; y += 1) {
                    const canonicalY = positiveModulo(y, this.domain.height);
                    if (mask[canonicalX * this.domain.height + canonicalY] >= 0) visit(x, y);
                }
            }
            return;
        }

        const visited = new Set<number>();
        this.openCurveField().forEachPathIntersecting(
            tileExtentToWorldBounds(originX, originY, width, height),
            path => this.visitPathEdges(path, sampleAt, point => {
                if (point.x < originX || point.x >= endX || point.y < originY || point.y >= endY) return;
                visited.add((point.x - originX) * height + point.y - originY);
            })
        );
        for (const index of visited) {
            visit(originX + Math.floor(index / height), originY + index % height);
        }
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

    private openCurveField(): InfiniteWaterCurveField {
        if (!this.curveField) throw new Error("open water curve field is unavailable for a toroidal domain");
        return this.curveField;
    }

    private directionBetween(from: Point, to: Point): NeighborDirection {
        for (const neighbor of getNeighbors(from.x, from.y)) {
            const canonical = this.normalizePoint(neighbor);
            if (canonical?.x === to.x && canonical.y === to.y) return neighbor.direction;
        }
        throw new Error("sampled water curve contains non-neighboring hex cells");
    }

    private visitPathEdges(
        path: WaterCurvePath,
        sampleAt: WorldWaterSampleAt,
        visit: (point: Point, direction: NeighborDirection) => void
    ): void {
        if (path.points.length < 2) return;
        let previous = worldPointToHex(path.points[0]);
        for (let index = 1; index < path.points.length; index += 1) {
            const next = worldPointToHex(path.points[index]);
            const cells = hexLine(previous, next);
            for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
                this.visitCandidateEdge(cells[cellIndex - 1], cells[cellIndex], sampleAt, visit);
            }
            previous = next;
        }
    }

    private visitCandidateEdge(
        rawFrom: Point,
        rawTo: Point,
        sampleAt: WorldWaterSampleAt,
        visit: (point: Point, direction: NeighborDirection) => void
    ): void {
        const from = this.normalizePoint(rawFrom);
        const to = this.normalizePoint(rawTo);
        if (!from || !to || (from.x === to.x && from.y === to.y)) return;
        const direction = this.directionBetween(from, to);
        const fromSample = sampleAt(from.x, from.y);
        const toSample = sampleAt(to.x, to.y);
        if (!fromSample || !toSample) return;
        const fromRiver = isRiverTerrain(fromSample.baseTerrain);
        const toRiver = isRiverTerrain(toSample.baseTerrain);
        if (fromRiver && toRiver) {
            visit(from, direction);
            visit(to, oppositeNeighborDirection(direction));
        } else if (fromRiver && isOpenWater(toSample.baseTerrain)) {
            visit(from, direction);
        } else if (toRiver && isOpenWater(fromSample.baseTerrain)) {
            visit(to, oppositeNeighborDirection(direction));
        }
    }

    private buildPage(pageX: number, pageY: number, sampleAt: WorldWaterSampleAt): WaterPage {
        const pageSize = this.profile.rivers.pageSize;
        const minX = pageX * pageSize;
        const minY = pageY * pageSize;
        const riverEdges = new Int8Array(pageSize * pageSize);
        riverEdges.fill(-1);
        this.openCurveField().forEachPathIntersecting(
            tileExtentToWorldBounds(minX, minY, pageSize, pageSize),
            path => this.visitPathEdges(path, sampleAt, (point, direction) => {
                const localX = point.x - minX;
                const localY = point.y - minY;
                if (localX < 0 || localX >= pageSize || localY < 0 || localY >= pageSize) return;
                const index = localX * pageSize + localY;
                riverEdges[index] = Math.max(0, riverEdges[index])
                    | 1 << NEIGHBOR_DIRECTION_BITS[direction];
            })
        );
        return { riverEdges };
    }

    private buildToroidalMask(sampleAt: WorldWaterSampleAt): Int8Array {
        if (this.domain.topology !== "toroidal" || !this.toroidalCurveField) {
            throw new Error("toroidal water mask requires a toroidal domain");
        }
        const domain = this.domain;
        const mask = new Int8Array(domain.width * domain.height);
        mask.fill(-1);
        this.toroidalCurveField.forEachPathOwnedBy({
            minX: 0,
            maxX: domain.width * 1.5,
            minY: 0,
            maxY: domain.height * SQRT_THREE
        }, path => this.visitPathEdges(path, sampleAt, (point, direction) => {
            const index = point.x * domain.height + point.y;
            mask[index] = Math.max(0, mask[index]) | 1 << NEIGHBOR_DIRECTION_BITS[direction];
        }));
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

import { Point } from "../interfaces";
import {
    createInfiniteWaterCurveFieldFromUint32,
    scaleInfiniteWaterCurveProfile,
    type InfiniteWaterCurveField,
    type WaterBasin,
    type WaterCurveBounds,
    type WaterCurvePath,
    type WaterCurvePoint,
    isPointInsideWaterBasin
} from "./InfiniteWaterCurveField";
import { LandformDomain } from "./LandformSampler";
import { WorldStyleProfile } from "./WorldStyleProfile";

interface WaterPage {
    // 0 is dry and 1 is a generated curve-or-basin water terrain cell.
    readonly water: Uint8Array;
}

export interface WorldWaterSamplerStats {
    readonly cachedPages: number;
    readonly maximumCachedPages: number;
    readonly toroidalMaskReady: boolean;
    readonly toroidalWaterTiles: number;
}

export interface WorldWaterSampler {
    isWaterTile(x: number, y: number): boolean;
    forEachWaterTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        visit: (x: number, y: number) => void
    ): void;
    readonly stats: WorldWaterSamplerStats;
    clear(): void;
}

const SQRT_THREE = Math.sqrt(3);
const HEX_APOTHEM = SQRT_THREE / 2;
const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;

function assertWaterExtent(originX: number, originY: number, width: number, height: number): void {
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
// half-row translation yields ordinary axial coordinates for nearest-cell
// rounding and six-neighbour line traversal.
function worldPointToHex(point: { readonly x: number; readonly y: number }): Point {
    const q = point.x * (2 / 3);
    const r = -point.x / 3 + point.y / SQRT_THREE - 0.5;
    return cubeToOffset(roundCube(q, r, -q - r));
}

function hexCenter(point: Point): { readonly x: number; readonly y: number } {
    return {
        x: point.x * 1.5,
        y: point.y * SQRT_THREE + (point.x % 2 === 0 ? SQRT_THREE / 2 : 0)
    };
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
    height: number,
    margin: number
): WaterCurveBounds {
    return {
        minX: originX * 1.5 - 1 - margin,
        maxX: (originX + width - 1) * 1.5 + 1 + margin,
        minY: originY * SQRT_THREE - 1 - margin,
        maxY: (originY + height) * SQRT_THREE + 1 + margin
    };
}

function isCenterInsideRibbon(
    center: { readonly x: number; readonly y: number },
    first: WaterCurvePoint,
    second: WaterCurvePoint
): boolean {
    const segmentX = second.x - first.x;
    const segmentY = second.y - first.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((center.x - first.x) * segmentX + (center.y - first.y) * segmentY) / lengthSquared
    ));
    const nearestX = first.x + segmentX * amount;
    const nearestY = first.y + segmentY * amount;
    const width = first.width + (second.width - first.width) * amount;
    // Expand center sampling by one apothem so the boolean terrain mask
    // represents the hex footprint rather than a zero-area center point.
    // Nearest-cell traversal below preserves connectivity at corner cases.
    return Math.hypot(center.x - nearestX, center.y - nearestY) <= width + HEX_APOTHEM;
}

class DeterministicWorldWaterSampler implements WorldWaterSampler {
    private readonly pages = new Map<string, WaterPage>();
    private readonly waterField: InfiniteWaterCurveField | undefined;
    private readonly toroidalWaterField: InfiniteWaterCurveField | undefined;
    private toroidalMask: Uint8Array | undefined;

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
            this.toroidalWaterField = createInfiniteWaterCurveFieldFromUint32(
                numericSeed,
                scaleInfiniteWaterCurveProfile(profile.rivers.curve, scale)
            );
        } else {
            this.waterField = createInfiniteWaterCurveFieldFromUint32(numericSeed, profile.rivers.curve);
        }
    }

    public isWaterTile(x: number, y: number): boolean {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            throw new RangeError("water coordinates must be safe integers");
        }
        if (this.domain.topology === "toroidal") {
            const canonicalX = positiveModulo(x, this.domain.width);
            const canonicalY = positiveModulo(y, this.domain.height);
            const mask = this.toroidalMask ??= this.buildToroidalMask();
            return mask[canonicalX * this.domain.height + canonicalY] !== 0;
        }
        if (this.domain.topology === "bounded"
            && (x < 0 || x >= this.domain.width || y < 0 || y >= this.domain.height)) return false;
        const pageSize = this.profile.rivers.pageSize;
        const pageX = Math.floor(x / pageSize);
        const pageY = Math.floor(y / pageSize);
        const key = `${pageX},${pageY}`;
        let page = this.pages.get(key);
        if (page) {
            this.pages.delete(key);
            this.pages.set(key, page);
        } else {
            page = this.buildPage(pageX, pageY);
            this.pages.set(key, page);
            while (this.pages.size > this.profile.rivers.maximumCachedPages) {
                const oldest = this.pages.keys().next().value as string | undefined;
                if (oldest === undefined) break;
                this.pages.delete(oldest);
            }
        }
        const localX = x - pageX * pageSize;
        const localY = y - pageY * pageSize;
        return page.water[localX * pageSize + localY] !== 0;
    }

    public forEachWaterTile(
        originX: number,
        originY: number,
        width: number,
        height: number,
        visit: (x: number, y: number) => void
    ): void {
        assertWaterExtent(originX, originY, width, height);
        if (typeof visit !== "function") throw new TypeError("water tile visitor must be a function");
        const endX = originX + width;
        const endY = originY + height;
        if (this.domain.topology === "toroidal") {
            const mask = this.toroidalMask ??= this.buildToroidalMask();
            for (let x = originX; x < endX; x += 1) {
                const canonicalX = positiveModulo(x, this.domain.width);
                for (let y = originY; y < endY; y += 1) {
                    const canonicalY = positiveModulo(y, this.domain.height);
                    if (mask[canonicalX * this.domain.height + canonicalY] !== 0) visit(x, y);
                }
            }
            return;
        }

        const visited = new Set<number>();
        this.visitOpenFieldTiles(originX, originY, width, height, point => {
            if (point.x < originX || point.x >= endX || point.y < originY || point.y >= endY) return;
            visited.add((point.x - originX) * height + point.y - originY);
        });
        for (const index of visited) {
            visit(originX + Math.floor(index / height), originY + index % height);
        }
    }

    public get stats(): WorldWaterSamplerStats {
        const mask = this.toroidalMask;
        let toroidalWaterTiles = 0;
        if (mask) for (const value of mask) toroidalWaterTiles += value !== 0 ? 1 : 0;
        return Object.freeze({
            cachedPages: this.pages.size,
            maximumCachedPages: this.profile.rivers.maximumCachedPages,
            toroidalMaskReady: mask !== undefined,
            toroidalWaterTiles
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

    private openWaterField(): InfiniteWaterCurveField {
        if (!this.waterField) throw new Error("open water field is unavailable for a toroidal domain");
        return this.waterField;
    }

    private visitPathTiles(path: WaterCurvePath, visit: (point: Point) => void): void {
        if (path.points.length < 2) return;
        for (let index = 1; index < path.points.length; index += 1) {
            const first = path.points[index - 1];
            const second = path.points[index];
            const centerline = hexLine(worldPointToHex(first), worldPointToHex(second));
            const radius = Math.ceil((Math.max(first.width, second.width) + 1) / SQRT_THREE);
            for (const base of centerline) {
                // The nearest-cell chain guarantees that sub-cell ribbons do
                // not acquire holes. Wider curve families additionally select
                // every neighbouring hex whose center lies inside the ribbon.
                const normalizedBase = this.normalizePoint(base);
                if (normalizedBase) visit(normalizedBase);
                for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
                        if (offsetX === 0 && offsetY === 0) continue;
                        const candidate = { x: base.x + offsetX, y: base.y + offsetY };
                        if (!isCenterInsideRibbon(hexCenter(candidate), first, second)) continue;
                        const normalized = this.normalizePoint(candidate);
                        if (normalized) visit(normalized);
                    }
                }
            }
        }
    }

    private visitBasinTiles(
        basin: WaterBasin,
        clip: Readonly<{ originX: number; originY: number; width: number; height: number }> | undefined,
        visit: (point: Point) => void
    ): void {
        const reach = basin.majorRadius * (1 + basin.waveA + basin.waveB + basin.waveC) + HEX_APOTHEM;
        let firstX = Math.floor((basin.centerX - reach) / 1.5) - 1;
        let lastX = Math.ceil((basin.centerX + reach) / 1.5) + 1;
        let firstY = Math.floor((basin.centerY - reach) / SQRT_THREE) - 2;
        let lastY = Math.ceil((basin.centerY + reach) / SQRT_THREE) + 2;
        if (clip) {
            firstX = Math.max(firstX, clip.originX);
            lastX = Math.min(lastX, clip.originX + clip.width - 1);
            firstY = Math.max(firstY, clip.originY);
            lastY = Math.min(lastY, clip.originY + clip.height - 1);
        }
        for (let x = firstX; x <= lastX; x += 1) {
            for (let y = firstY; y <= lastY; y += 1) {
                const center = hexCenter({ x, y });
                if (!isPointInsideWaterBasin(center.x, center.y, basin, HEX_APOTHEM)) continue;
                const normalized = this.normalizePoint({ x, y });
                if (normalized) visit(normalized);
            }
        }
    }

    private visitOpenFieldTiles(
        originX: number,
        originY: number,
        width: number,
        height: number,
        visit: (point: Point) => void
    ): void {
        const field = this.openWaterField();
        field.forEachPathIntersecting(
            tileExtentToWorldBounds(originX, originY, width, height, field.maximumWidth),
            path => this.visitPathTiles(path, visit)
        );
        const clip = { originX, originY, width, height };
        field.forEachBasinIntersecting(
            tileExtentToWorldBounds(originX, originY, width, height, HEX_APOTHEM),
            basin => this.visitBasinTiles(basin, clip, visit)
        );
    }

    private buildPage(pageX: number, pageY: number): WaterPage {
        const pageSize = this.profile.rivers.pageSize;
        const minX = pageX * pageSize;
        const minY = pageY * pageSize;
        const water = new Uint8Array(pageSize * pageSize);
        this.visitOpenFieldTiles(minX, minY, pageSize, pageSize, point => {
            const localX = point.x - minX;
            const localY = point.y - minY;
            if (localX < 0 || localX >= pageSize || localY < 0 || localY >= pageSize) return;
            water[localX * pageSize + localY] = 1;
        });
        return { water };
    }

    private buildToroidalMask(): Uint8Array {
        if (this.domain.topology !== "toroidal" || !this.toroidalWaterField) {
            throw new Error("toroidal water mask requires a toroidal domain");
        }
        const domain = this.domain;
        const mask = new Uint8Array(domain.width * domain.height);
        this.toroidalWaterField.forEachPathOwnedBy({
            minX: 0,
            maxX: domain.width * 1.5,
            minY: 0,
            maxY: domain.height * SQRT_THREE
        }, path => this.visitPathTiles(path, point => {
            mask[point.x * domain.height + point.y] = 1;
        }));
        this.toroidalWaterField.forEachBasinOwnedBy({
            minX: 0,
            maxX: domain.width * 1.5,
            minY: 0,
            maxY: domain.height * SQRT_THREE
        }, basin => this.visitBasinTiles(basin, undefined, point => {
            mask[point.x * domain.height + point.y] = 1;
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

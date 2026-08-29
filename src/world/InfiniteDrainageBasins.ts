import { positiveModulo } from "../helpers/topology";
import { hashSafeIntegerCoordinates } from "./DeterministicHash";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { seedToUint32 } from "./noise";

export const INFINITE_DRAINAGE_BASIN_SPAN_TILES = 512;
export const INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES = 8;
export const INFINITE_DRAINAGE_SITE_JITTER_STEPS = 8;
export const INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS = 1;
export const INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS = 2;

const SITE_X_SALT = 0x68bc_21eb;
const SITE_Y_SALT = 0x02e5_be93;
const JITTER_RANGE = INFINITE_DRAINAGE_SITE_JITTER_STEPS * 2 + 1;

export interface InfiniteDrainageBasinKey {
    readonly cellX: number;
    readonly cellY: number;
}

export interface InfiniteDrainageBasinSite extends InfiniteDrainageBasinKey {
    readonly tileX: number;
    readonly tileY: number;
}

export interface InfiniteDrainageTileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

function assertSafeCoordinate(name: string, value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}

function checkedCellOrigin(cell: number): number {
    assertSafeCoordinate("drainage basin cell", cell);
    const origin = cell * INFINITE_DRAINAGE_BASIN_SPAN_TILES;
    if (!Number.isSafeInteger(origin)) {
        throw new RangeError("drainage basin cell origin exceeds the safe tile range");
    }
    return origin;
}

function compareBasinKeys(first: InfiniteDrainageBasinKey, second: InfiniteDrainageBasinKey): number {
    return first.cellX - second.cellX || first.cellY - second.cellY;
}

function columnStagger(column: number): number {
    return positiveModulo(column, 2) === 0 ? 0.5 : 0;
}

function siteDistanceSquared(site: InfiniteDrainageBasinSite, tileX: number, tileY: number): number {
    const deltaX = site.tileX - tileX;
    const deltaY = site.tileY - tileY + columnStagger(site.tileX) - columnStagger(tileX);
    const worldX = 1.5 * deltaX;
    const worldZ = Math.sqrt(3) * deltaY;
    return worldX * worldX + worldZ * worldZ;
}

export class InfiniteDrainageBasinResolver {
    public readonly seed: string;
    public readonly numericSeed: number;

    constructor(seed: string | number) {
        if (typeof seed !== "string" && typeof seed !== "number") {
            throw new TypeError("infinite drainage basin seed must be a string or number");
        }
        if (typeof seed === "number" && !Number.isFinite(seed)) {
            throw new RangeError("numeric infinite drainage basin seed must be finite");
        }
        this.seed = String(seed);
        this.numericSeed = seedToUint32(seed);
    }

    public siteAt(cellX: number, cellY: number): InfiniteDrainageBasinSite {
        const originX = checkedCellOrigin(cellX);
        const originY = checkedCellOrigin(cellY);
        const center = INFINITE_DRAINAGE_BASIN_SPAN_TILES / 2;
        const jitterX = (
            hashSafeIntegerCoordinates(this.numericSeed, cellX, cellY, SITE_X_SALT) % JITTER_RANGE
            - INFINITE_DRAINAGE_SITE_JITTER_STEPS
        ) * INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES;
        const jitterY = (
            hashSafeIntegerCoordinates(this.numericSeed, cellX, cellY, SITE_Y_SALT) % JITTER_RANGE
            - INFINITE_DRAINAGE_SITE_JITTER_STEPS
        ) * INFINITE_DRAINAGE_SITE_JITTER_STEP_TILES;
        const tileX = originX + center + jitterX;
        const tileY = originY + center + jitterY;
        if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
            throw new RangeError("infinite drainage basin site exceeds the safe tile range");
        }
        return Object.freeze({ cellX, cellY, tileX, tileY });
    }

    public candidateSites(tileX: number, tileY: number): readonly InfiniteDrainageBasinSite[] {
        assertSafeCoordinate("infinite drainage tile x", tileX);
        assertSafeCoordinate("infinite drainage tile y", tileY);
        const homeCellX = Math.floor(tileX / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
        const homeCellY = Math.floor(tileY / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
        const sites: InfiniteDrainageBasinSite[] = [];
        for (let cellX = homeCellX - INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS;
            cellX <= homeCellX + INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS;
            cellX += 1) {
            for (let cellY = homeCellY - INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS;
                cellY <= homeCellY + INFINITE_DRAINAGE_CANDIDATE_CELL_RADIUS;
                cellY += 1) {
                sites.push(this.siteAt(cellX, cellY));
            }
        }
        return Object.freeze(sites);
    }

    public resolve(tileX: number, tileY: number): InfiniteDrainageBasinSite {
        const sites = this.candidateSites(tileX, tileY);
        let best = sites[0];
        let bestDistance = siteDistanceSquared(best, tileX, tileY);
        for (let index = 1; index < sites.length; index += 1) {
            const candidate = sites[index];
            const distance = siteDistanceSquared(candidate, tileX, tileY);
            if (distance < bestDistance
                || (distance === bestDistance && compareBasinKeys(candidate, best) < 0)) {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best;
    }

    // A 128x128 region lies wholly inside one aligned 512x512 basin cell. Its
    // possible owning sites are one cell away; enumerating each site's complete
    // Voronoi support extends the terrain dependency window to a fixed radius
    // of two cells, independent of loaded neighbors or request order.
    public dependencyBoundsForRegion(regionX: number, regionY: number): InfiniteDrainageTileBounds {
        assertSafeCoordinate("hydrology region x", regionX);
        assertSafeCoordinate("hydrology region y", regionY);
        const regionOriginX = regionX * HYDROLOGY_REGION_SIZE;
        const regionOriginY = regionY * HYDROLOGY_REGION_SIZE;
        if (!Number.isSafeInteger(regionOriginX) || !Number.isSafeInteger(regionOriginY)) {
            throw new RangeError("hydrology region origin exceeds the safe tile range");
        }
        const homeCellX = Math.floor(regionOriginX / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
        const homeCellY = Math.floor(regionOriginY / INFINITE_DRAINAGE_BASIN_SPAN_TILES);
        const minimumCellX = homeCellX - INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS;
        const minimumCellY = homeCellY - INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS;
        const maximumCellX = homeCellX + INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS + 1;
        const maximumCellY = homeCellY + INFINITE_DRAINAGE_REGION_DEPENDENCY_CELL_RADIUS + 1;
        return Object.freeze({
            minX: checkedCellOrigin(minimumCellX),
            minY: checkedCellOrigin(minimumCellY),
            maxXExclusive: checkedCellOrigin(maximumCellX),
            maxYExclusive: checkedCellOrigin(maximumCellY)
        });
    }
}

function assertInfiniteDrainagePartitionContract(): void {
    if (INFINITE_DRAINAGE_BASIN_SPAN_TILES % HYDROLOGY_REGION_SIZE !== 0) {
        throw new Error("infinite drainage basins must align to complete hydrology regions");
    }
    const maximumOwnAxis = INFINITE_DRAINAGE_BASIN_SPAN_TILES * 0.625;
    const maximumOwnDistanceSquared = (1.5 * maximumOwnAxis) ** 2
        + (Math.sqrt(3) * (maximumOwnAxis + 0.5)) ** 2;
    const minimumRemoteAxis = INFINITE_DRAINAGE_BASIN_SPAN_TILES * 1.375;
    const minimumRemoteDistance = Math.min(
        1.5 * minimumRemoteAxis,
        Math.sqrt(3) * (minimumRemoteAxis - 0.5)
    );
    if (maximumOwnDistanceSquared >= minimumRemoteDistance ** 2) {
        throw new Error("infinite drainage site jitter does not prove a finite candidate neighborhood");
    }
}

assertInfiniteDrainagePartitionContract();

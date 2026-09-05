import { getHexCenter } from "../helpers/helpers";
import { positiveModulo } from "../helpers/topology";
import { Point } from "../interfaces";
import type { WorldVegetationMapSnapshot } from "./generateVegetation";

export function vegetationRandom(x: number, y: number, salt: number): number {
    let value = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b)
        ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f)
        ^ Math.imul(salt ^ 0x165667b1, 0x85ebca77);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x100000000;
}

// One jittered candidate per world-space cell. Hexes only own instances for
// fog/editing; neither their centres nor chunk boundaries reset the pattern.
// Periodic cell counts preserve spacing across toroidal seams as well.
export class VegetationSampling {
    private readonly columns: number;
    private readonly rows: number;
    private readonly stepX: number;
    private readonly stepZ: number;
    public readonly tileCapacity: number;

    constructor(
        map: WorldVegetationMapSnapshot,
        private readonly size: number,
        spacing: number,
        private readonly jitter: number,
        private readonly salt: number
    ) {
        const periodX = map.w * size * 1.5;
        const periodZ = map.h * size * Math.sqrt(3);
        this.columns = map.wrapX ? Math.max(1, Math.floor(periodX / spacing)) : 0;
        this.rows = map.wrapY ? Math.max(1, Math.floor(periodZ / spacing)) : 0;
        this.stepX = this.columns ? periodX / this.columns : spacing;
        this.stepZ = this.rows ? periodZ / this.rows : spacing;
        this.tileCapacity = (Math.ceil(size * 2 / this.stepX) + 1)
            * (Math.ceil(size * Math.sqrt(3) / this.stepZ) + 1);
    }

    public forTile(tile: Point, visit: (x: number, z: number, seedX: number, seedZ: number) => void): void {
        const center = getHexCenter(tile.x, tile.y, this.size);
        const apothem = this.size * Math.sqrt(3) / 2;
        const minX = Math.floor((center.x - this.size) / this.stepX);
        const maxX = Math.floor((center.x + this.size) / this.stepX);
        const minZ = Math.floor((center.y - apothem) / this.stepZ);
        const maxZ = Math.floor((center.y + apothem) / this.stepZ);
        for (let cx = minX; cx <= maxX; cx += 1) for (let cz = minZ; cz <= maxZ; cz += 1) {
            const sx = this.columns ? positiveModulo(cx, this.columns) : cx;
            const sz = this.rows ? positiveModulo(cz, this.rows) : cz;
            const x = (cx + 0.5 + (vegetationRandom(sx, sz, this.salt) * 2 - 1) * this.jitter) * this.stepX;
            const z = (cz + 0.5 + (vegetationRandom(sx, sz, this.salt + 1) * 2 - 1) * this.jitter) * this.stepZ;
            const lx = Math.abs(x - center.x);
            const lz = Math.abs(z - center.y);
            if (lz >= apothem || Math.sqrt(3) * lx + lz >= Math.sqrt(3) * this.size) continue;
            visit(x, z, sx, sz);
        }
    }
}

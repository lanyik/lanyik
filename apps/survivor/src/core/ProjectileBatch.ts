import { MAX_ENEMIES, MAX_PROJECTILES } from "./GameConfig";
import type { SpatialGrid, SpatialQuery } from "./SpatialGrid";
import { segmentCylinderHit } from "./AttackGeometry";

/** Numeric collision snapshot. Outputs contain handles, never query cursors. */
export class ProjectileBatch {
    public static readonly length = 8 + MAX_ENEMIES * 6 + MAX_PROJECTILES * 10;
    public static readonly bytes = ProjectileBatch.length * Float64Array.BYTES_PER_ELEMENT + MAX_ENEMIES * MAX_PROJECTILES * Uint16Array.BYTES_PER_ELEMENT;
    public readonly data: Float64Array;
    public readonly enemyIds: Float64Array;
    public readonly enemyX: Float64Array;
    public readonly enemyZ: Float64Array;
    public readonly enemyRadius: Float64Array;
    public readonly enemyBottom: Float64Array;
    public readonly enemyTop: Float64Array;
    public readonly startY: Float64Array;
    public readonly endY: Float64Array;
    public readonly startX: Float64Array;
    public readonly startZ: Float64Array;
    public readonly endX: Float64Array;
    public readonly endZ: Float64Array;
    public readonly radius: Float64Array;
    public readonly hostile: Float64Array;
    public readonly targets: Float64Array;
    public readonly candidateCounts: Float64Array;
    public readonly candidateEnemies: Uint16Array;

    constructor(public readonly buffer = new ArrayBuffer(ProjectileBatch.bytes)) {
        if (buffer.byteLength !== ProjectileBatch.bytes) throw new Error("Invalid projectile batch size");
        this.data = new Float64Array(buffer, 0, ProjectileBatch.length);
        this.candidateEnemies = new Uint16Array(buffer, ProjectileBatch.length * 8);
        let offset = 8;
        const field = (length: number) => { const result = this.data.subarray(offset, offset + length); offset += length; return result; };
        this.enemyIds = field(MAX_ENEMIES); this.enemyX = field(MAX_ENEMIES);
        this.enemyZ = field(MAX_ENEMIES); this.enemyRadius = field(MAX_ENEMIES);
        this.enemyBottom = field(MAX_ENEMIES); this.enemyTop = field(MAX_ENEMIES);
        this.startY = field(MAX_PROJECTILES); this.endY = field(MAX_PROJECTILES);
        this.startX = field(MAX_PROJECTILES); this.startZ = field(MAX_PROJECTILES);
        this.endX = field(MAX_PROJECTILES); this.endZ = field(MAX_PROJECTILES);
        this.radius = field(MAX_PROJECTILES); this.hostile = field(MAX_PROJECTILES); this.targets = field(MAX_PROJECTILES);
        this.candidateCounts = field(MAX_PROJECTILES);
    }
    public get enemyCount(): number { return this.data[0]; }
    public set enemyCount(value: number) { this.data[0] = value; }
    public get count(): number { return this.data[1]; }
    public set count(value: number) { this.data[1] = value; }
    public setPlayer(id: number, x: number, z: number, radius: number, bottom: number, top: number): void {
        this.data[2] = id; this.data[3] = x; this.data[4] = z; this.data[5] = radius;
        this.data[6] = bottom; this.data[7] = top;
    }

    /** The authority queries its maintained index; Workers receive only candidate indices and facts. */
    public prepare(grid: SpatialGrid, query: SpatialQuery, category: number, enemyIndices: Uint16Array): void {
        if (!Number.isInteger(this.enemyCount) || this.enemyCount < 0 || this.enemyCount > MAX_ENEMIES
            || !Number.isInteger(this.count) || this.count < 0 || this.count > MAX_PROJECTILES) throw new Error("Invalid projectile batch counts");
        for (let shot = 0; shot < this.count; shot++) {
            if (this.hostile[shot]) { this.candidateCounts[shot] = 1; continue; }
            const reach = this.radius[shot] + grid.maximumRadius;
            const minX = Math.min(this.startX[shot], this.endX[shot]) - reach, maxX = Math.max(this.startX[shot], this.endX[shot]) + reach;
            const minZ = Math.min(this.startZ[shot], this.endZ[shot]) - reach, maxZ = Math.max(this.startZ[shot], this.endZ[shot]) + reach;
            grid.query(minX, minZ, maxX, maxZ, category, query);
            let count = 0;
            for (let cursor = 0; cursor < query.count; cursor++) {
                const i = enemyIndices[query.slots[cursor]];
                if (this.enemyX[i] >= minX && this.enemyX[i] <= maxX && this.enemyZ[i] >= minZ && this.enemyZ[i] <= maxZ) {
                    this.candidateEnemies[shot * MAX_ENEMIES + count++] = i;
                }
            }
            this.candidateCounts[shot] = count;
        }
    }

    public copyRangeTo(buffer: ArrayBuffer, begin: number, end: number): void {
        new Float64Array(buffer, 0, ProjectileBatch.length).set(this.data);
        const candidates = new Uint16Array(buffer, ProjectileBatch.length * 8);
        for (let shot = begin; shot < end; shot++) {
            if (this.hostile[shot]) continue;
            const start = shot * MAX_ENEMIES;
            candidates.set(this.candidateEnemies.subarray(start, start + this.candidateCounts[shot]), start);
        }
    }

}

export interface ProjectileExecutor {
    resolve(batch: ProjectileBatch): Promise<void>;
}

/** Earliest intersection, including a projectile beginning inside a target. */
export function segmentCircleHit(sx: number, sz: number, ex: number, ez: number, x: number, z: number, radius: number): number {
    const ox = sx - x, oz = sz - z, dx = ex - sx, dz = ez - sz;
    const c = ox * ox + oz * oz - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dz * dz;
    if (a === 0) return Infinity;
    const b = ox * dx + oz * dz;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return Infinity;
    const t = (-b - Math.sqrt(discriminant)) / a;
    return t >= 0 && t <= 1 ? t : Infinity;
}

/** Disjoint projectile ranges read one snapshot and write only their own outputs. */
export function resolveProjectileRange(batch: ProjectileBatch, begin = 0, end = batch.count): void {
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end > batch.count || begin > end
        || !Number.isInteger(batch.count) || batch.count < 0 || batch.count > MAX_PROJECTILES
        || !Number.isInteger(batch.enemyCount) || batch.enemyCount < 0 || batch.enemyCount > MAX_ENEMIES) throw new Error("Invalid projectile range");
    for (let shot = begin; shot < end; shot++) {
        const candidates = batch.candidateCounts[shot];
        if (!Number.isInteger(candidates) || candidates < 0 || candidates > (batch.hostile[shot] ? 1 : batch.enemyCount)) {
            throw new Error("Invalid projectile candidate count");
        }
        const sx = batch.startX[shot], sy = batch.startY[shot], sz = batch.startZ[shot], ex = batch.endX[shot], ey = batch.endY[shot], ez = batch.endZ[shot], radius = batch.radius[shot];
        let target = 0, nearest = Infinity;
        if (batch.hostile[shot]) {
            if (segmentCylinderHit(sx, sy, sz, ex, ey, ez, batch.data[3], batch.data[4], batch.data[6] - radius, batch.data[7] + radius, radius + batch.data[5]) !== Infinity) target = batch.data[2];
        } else for (let cursor = 0; cursor < candidates; cursor++) {
            const enemy = batch.candidateEnemies[shot * MAX_ENEMIES + cursor];
            if (enemy >= batch.enemyCount) throw new Error("Invalid projectile candidate index");
            const t = segmentCylinderHit(sx, sy, sz, ex, ey, ez, batch.enemyX[enemy], batch.enemyZ[enemy], batch.enemyBottom[enemy] - radius, batch.enemyTop[enemy] + radius, radius + batch.enemyRadius[enemy]);
            if (t < nearest || (t !== Infinity && t === nearest && (target === 0 || batch.enemyIds[enemy] < target))) {
                nearest = t; target = batch.enemyIds[enemy];
            }
        }
        batch.targets[shot] = target;
    }
}

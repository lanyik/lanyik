import { MAX_ENEMIES, MAX_PROJECTILES } from "./CombatConfig";

/** Numeric collision snapshot. Outputs contain handles, never query cursors. */
export class ProjectileBatch {
    public static readonly length = 6 + MAX_ENEMIES * 4 + MAX_PROJECTILES * 7;
    public static readonly bytes = ProjectileBatch.length * Float64Array.BYTES_PER_ELEMENT;
    public readonly data: Float64Array;
    public readonly enemyIds: Float64Array;
    public readonly enemyX: Float64Array;
    public readonly enemyZ: Float64Array;
    public readonly enemyRadius: Float64Array;
    public readonly startX: Float64Array;
    public readonly startZ: Float64Array;
    public readonly endX: Float64Array;
    public readonly endZ: Float64Array;
    public readonly radius: Float64Array;
    public readonly hostile: Float64Array;
    public readonly targets: Float64Array;

    constructor(public readonly buffer = new ArrayBuffer(ProjectileBatch.bytes)) {
        if (buffer.byteLength !== ProjectileBatch.bytes) throw new Error("Invalid projectile batch size");
        this.data = new Float64Array(buffer);
        let offset = 6;
        const field = (length: number) => { const result = this.data.subarray(offset, offset + length); offset += length; return result; };
        this.enemyIds = field(MAX_ENEMIES); this.enemyX = field(MAX_ENEMIES);
        this.enemyZ = field(MAX_ENEMIES); this.enemyRadius = field(MAX_ENEMIES);
        this.startX = field(MAX_PROJECTILES); this.startZ = field(MAX_PROJECTILES);
        this.endX = field(MAX_PROJECTILES); this.endZ = field(MAX_PROJECTILES);
        this.radius = field(MAX_PROJECTILES); this.hostile = field(MAX_PROJECTILES); this.targets = field(MAX_PROJECTILES);
    }
    public get enemyCount(): number { return this.data[0]; }
    public set enemyCount(value: number) { this.data[0] = value; }
    public get count(): number { return this.data[1]; }
    public set count(value: number) { this.data[1] = value; }
    public setPlayer(id: number, x: number, z: number, radius: number): void {
        this.data[2] = id; this.data[3] = x; this.data[4] = z; this.data[5] = radius;
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
        const sx = batch.startX[shot], sz = batch.startZ[shot], ex = batch.endX[shot], ez = batch.endZ[shot];
        let target = 0, nearest = Infinity;
        if (batch.hostile[shot]) {
            if (segmentCircleHit(sx, sz, ex, ez, batch.data[3], batch.data[4], batch.radius[shot] + batch.data[5]) !== Infinity) target = batch.data[2];
        } else for (let enemy = 0; enemy < batch.enemyCount; enemy++) {
            const t = segmentCircleHit(sx, sz, ex, ez, batch.enemyX[enemy], batch.enemyZ[enemy], batch.radius[shot] + batch.enemyRadius[enemy]);
            if (t < nearest || (t !== Infinity && t === nearest && (target === 0 || batch.enemyIds[enemy] < target))) {
                nearest = t; target = batch.enemyIds[enemy];
            }
        }
        batch.targets[shot] = target;
    }
}

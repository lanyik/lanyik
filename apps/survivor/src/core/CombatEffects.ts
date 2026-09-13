import { GAME_CONFIG, ticksForSeconds } from "./GameConfig";

export enum EffectKind { Pulse, Frost, Lightning, Dash, Ward, Heal, EnemyReave, EnemyJaws, EnemyFault }
export function effectArrays(create: <T extends Float32Array | Float64Array | Uint8Array>(type: {
    readonly BYTES_PER_ELEMENT: number; new(length: number): T; new(buffer: ArrayBuffer, offset: number, count: number): T
}, count: number) => T) {
    const n = GAME_CONFIG.skills.maxEffects;
    return { kind: create(Uint8Array, n), x: create(Float64Array, n), z: create(Float64Array, n),
        endX: create(Float64Array, n), endZ: create(Float64Array, n), radius: create(Float32Array, n),
        started: create(Float64Array, n), endsAt: create(Float64Array, n) };
}
export type EffectBuffer = ReturnType<typeof effectArrays> & { readonly count: number };
/** Bounded visual facts; saturation skips only new visuals, never gameplay effects. */
export class CombatEffects {
    public readonly buffer = { ...effectArrays((Type, n) => new Type(n)), count: 0 };
    private readonly sources = new Float64Array(GAME_CONFIG.skills.maxEffects);
    public add(kind: EffectKind, tick: number, x: number, z: number, radius: number, seconds: number, endX = x, endZ = z, source = 0): void {
        const b = this.buffer;
        if (b.count === GAME_CONFIG.skills.maxEffects) return;
        const i = b.count++;
        this.sources[i] = source;
        b.kind[i] = kind; b.x[i] = x; b.z[i] = z; b.endX[i] = endX; b.endZ[i] = endZ;
        b.radius[i] = radius; b.started[i] = tick; b.endsAt[i] = tick + ticksForSeconds(seconds);
    }
    public advance(tick: number): void {
        const b = this.buffer;
        let i = 0;
        while (i < b.count) {
            if (tick < b.endsAt[i]) { i++; continue; }
            this.remove(i);
        }
    }
    public cancelSource(source: number): void {
        let i = 0;
        while (i < this.buffer.count) { if (this.sources[i] === source) this.remove(i); else i++; }
    }
    private remove(i: number): void {
        const b = this.buffer, last = --b.count;
        for (const key of ["kind", "x", "z", "endX", "endZ", "radius", "started", "endsAt"] as const) b[key][i] = b[key][last];
        this.sources[i] = this.sources[last];
    }
}

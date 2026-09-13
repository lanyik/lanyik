import { ticksForSeconds } from "./GameConfig";

export const COMBAT_TEXT_CAPACITY = 256;
export const COMBAT_TEXT_SECONDS = .95;
export enum CombatTextKind { EnemyDamage, EnemyCritical, PlayerDamage, PlayerCritical, Shield, Dodge, Block, Reflection }
export function combatTextArrays(create: <T extends Float64Array | Uint8Array>(type: {
    readonly BYTES_PER_ELEMENT: number; new(length: number): T; new(buffer: ArrayBuffer, offset: number, count: number): T
}, count: number) => T) {
    return { id: create(Float64Array, COMBAT_TEXT_CAPACITY), x: create(Float64Array, COMBAT_TEXT_CAPACITY),
        z: create(Float64Array, COMBAT_TEXT_CAPACITY), value: create(Float64Array, COMBAT_TEXT_CAPACITY),
        started: create(Float64Array, COMBAT_TEXT_CAPACITY), kind: create(Uint8Array, COMBAT_TEXT_CAPACITY) };
}
export type CombatTextBuffer = ReturnType<typeof combatTextArrays> & { readonly count: number };

/** Settled hit facts survive Worker publication; nearby rapid hits on one victim share a label. */
export class CombatText {
    public readonly buffer = { ...combatTextArrays((Type, n) => new Type(n)), count: 0 };
    private readonly targets = new Float64Array(COMBAT_TEXT_CAPACITY);
    private serial = 0;
    public add(target: number, kind: CombatTextKind, value: number, x: number, z: number, tick: number): void {
        const b = this.buffer;
        for (let i = 0; i < b.count; i++) if (this.targets[i] === target && b.kind[i] === kind && tick - b.started[i] <= ticksForSeconds(.08)) {
            b.value[i] += value; return;
        }
        let i = b.count;
        if (i < COMBAT_TEXT_CAPACITY) b.count++;
        else { i = 0; for (let j = 1; j < b.count; j++) if (b.id[j] < b.id[i]) i = j; }
        this.targets[i] = target; b.id[i] = ++this.serial; b.kind[i] = kind; b.value[i] = value;
        b.x[i] = x; b.z[i] = z; b.started[i] = tick;
    }
    public advance(tick: number): void {
        const b = this.buffer;
        for (let i = 0; i < b.count;) {
            if (tick - b.started[i] < ticksForSeconds(COMBAT_TEXT_SECONDS)) { i++; continue; }
            const last = --b.count;
            for (const key of ["id", "x", "z", "value", "started", "kind"] as const) b[key][i] = b[key][last];
            this.targets[i] = this.targets[last];
        }
    }
}

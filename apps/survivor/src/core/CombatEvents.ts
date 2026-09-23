import { MAX_ENEMIES } from "./GameConfig";
import type { CombatWorld } from "./CombatWorld";

export enum CombatEventKind { Damage, Heal, Prevented, Defeat }
export enum EffectCause { Attack, Lifesteal, Reflection, Sacrifice, ShamanHeal, Burn, BarrierRecovery }
export enum Prevention { None, Dodge, Shield, Block }
export type CombatEventConsumer = (events: CombatEvents, index: number) => void;

/** Authority facts, borrowed during synchronous consumption. Never sent to the renderer. */
export class CombatEvents {
    // Two facts per shaman release plus a complete damage/reflect/death transaction.
    private static readonly capacity = 2 * MAX_ENEMIES + 4;
    private count = 0;
    private consuming = false;
    public readonly kind = new Uint8Array(CombatEvents.capacity);
    public readonly cause = new Uint8Array(CombatEvents.capacity);
    public readonly prevention = new Uint8Array(CombatEvents.capacity);
    public readonly critical = new Uint8Array(CombatEvents.capacity);
    public readonly tick = new Float64Array(CombatEvents.capacity);
    public readonly source = new Float64Array(CombatEvents.capacity);
    public readonly target = new Float64Array(CombatEvents.capacity);
    public readonly amount = new Float64Array(CombatEvents.capacity);
    public readonly x = new Float64Array(CombatEvents.capacity);
    public readonly z = new Float64Array(CombatEvents.capacity);
    public readonly player = new Uint8Array(CombatEvents.capacity);
    public readonly enemyKind = new Uint8Array(CombatEvents.capacity);
    public readonly level = new Uint32Array(CombatEvents.capacity);
    public readonly elite = new Uint8Array(CombatEvents.capacity);
    public readonly boss = new Uint8Array(CombatEvents.capacity);

    public add(e: CombatWorld, kind: CombatEventKind, cause: EffectCause, source: number, slot: number, amount: number,
        tick: number, critical = false, prevention = Prevention.None): void {
        this.assertWritable();
        const i = this.count++;
        this.kind[i] = kind; this.cause[i] = cause; this.source[i] = source; this.target[i] = e.world.ids[slot];
        this.amount[i] = amount; this.tick[i] = tick; this.critical[i] = Number(critical); this.prevention[i] = prevention;
        this.x[i] = e.position.x[slot]; this.z[i] = e.position.z[slot]; this.player[i] = Number(slot === e.player);
        this.enemyKind[i] = e.enemy.kind[slot]; this.level[i] = e.enemy.level[slot];
        this.elite[i] = e.enemy.elite[slot]; this.boss[i] = e.enemy.boss[slot];
    }

    public assertWritable(): void {
        if (this.consuming) throw new Error("Combat event consumers cannot reenter settlement");
        if (this.count === CombatEvents.capacity) throw new Error("Combat event capacity exhausted");
    }

    public drain(consume: CombatEventConsumer): void {
        if (this.consuming) throw new Error("Combat event consumption cannot reenter");
        this.consuming = true;
        try { for (let i = 0; i < this.count; i++) consume(this, i); }
        finally { this.count = 0; this.consuming = false; }
    }
}

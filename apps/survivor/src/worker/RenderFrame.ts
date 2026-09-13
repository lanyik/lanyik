import { ENTITY_CAPACITY as N, MAX_ENEMIES, MAX_PROJECTILES, MAX_EXPERIENCE_ORBS, MAX_GROUND_EQUIPMENT } from "../core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";
import type { CombatRenderState, PlayerRenderState } from "../core/CombatState";
import { effectArrays } from "../core/CombatEffects";

type NumericArray = Float64Array | Float32Array | Uint32Array | Uint8Array;
type ArrayConstructor<T> = { readonly BYTES_PER_ELEMENT: number; new(buffer: ArrayBuffer, offset: number, count: number): T };

// The same layout pass computes byte offsets and binds transferred storage.
function layout(buffer?: ArrayBuffer) {
    let offset = 0;
    const field = <T extends NumericArray>(type: ArrayConstructor<T>, count: number): T => {
        offset = Math.ceil(offset / type.BYTES_PER_ELEMENT) * type.BYTES_PER_ELEMENT;
        const start = offset; offset += count * type.BYTES_PER_ELEMENT;
        return (buffer ? new type(buffer, start, count) : undefined) as T;
    };
    const f64 = () => field(Float64Array, N), f32 = () => field(Float32Array, N), u8 = () => field(Uint8Array, N);
    const query = (capacity: number) => ({ count: 0, slots: field(Uint32Array, capacity) });
    const entities = {
        ids: f64(),
        enemies: query(MAX_ENEMIES), projectiles: query(MAX_PROJECTILES), experience: query(MAX_EXPERIENCE_ORBS), loot: query(MAX_GROUND_EQUIPMENT),
        position: { x: f64(), z: f64(), previousX: f64(), previousZ: f64(), heading: f32(), radius: f32() },
        vitals: { hitFlash: f32() },
        enemy: { kind: u8(), elite: u8(), boss: u8(), homeX: f64(), homeZ: f64(), enraged: u8() },
        status: { slowUntil: f64(), wardUntil: f64() },
        action: { kind: u8(), reach: f32(), progress: f32(), targetX: f64(), targetZ: f64() },
        projectile: { critical: u8(), faction: u8(), launchHeight: f32(), age: f32(), groundX: f64(), groundZ: f64() },
        experienceValue: f64(), item: { id: f64(), rarity: u8(), kind: u8() }
    };
    const chests = { count: 0, x: field(Float64Array, MAX_COMBAT_CHUNKS), z: field(Float64Array, MAX_COMBAT_CHUNKS), tiers: field(Uint8Array, MAX_COMBAT_CHUNKS) };
    const effects = { ...effectArrays(field), count: 0 };
    return { entities, chests, effects, bytes: offset };
}

export interface RenderPacket {
    readonly buffer: ArrayBuffer;
    readonly player: PlayerRenderState;
    readonly counts: readonly [number, number, number, number, number, number];
}

/** Two alternating transferable buffers; authoritative ECS storage never leaves its owner. */
export class RenderFrame {
    public static readonly bytes = layout().bytes;
    private readonly arrays: ReturnType<typeof layout>;
    constructor(public readonly buffer = new ArrayBuffer(RenderFrame.bytes)) {
        if (buffer.byteLength !== RenderFrame.bytes) throw new Error("Invalid render frame size");
        this.arrays = layout(buffer);
    }
    public write(source: CombatRenderState): RenderPacket {
        const { entities: target, chests, effects } = this.arrays, input = source.entities;
        target.ids.set(input.ids); target.experienceValue.set(input.experienceValue);
        for (const name of ["enemies", "projectiles", "experience", "loot"] as const) {
            target[name].slots.set(input[name].slots.subarray(0, input[name].count));
        }
        for (const name of ["position", "vitals", "enemy", "action", "projectile", "item", "status"] as const) {
            const fields = target[name] as Record<string, NumericArray>, values = input[name] as Record<string, NumericArray>;
            for (const key in fields) fields[key].set(values[key]);
        }
        chests.x.set(source.chests.x); chests.z.set(source.chests.z); chests.tiers.set(source.chests.tiers);
        for (const key of ["kind", "x", "z", "endX", "endZ", "radius", "started", "endsAt"] as const) effects[key].set(source.effects[key].subarray(0, source.effects.count));
        return { buffer: this.buffer, player: { ...source.player },
            counts: [input.enemies.count, input.projectiles.count, input.experience.count, input.loot.count, source.chests.count, source.effects.count] };
    }
    public read(packet: RenderPacket): CombatRenderState {
        const { entities, chests, effects } = this.arrays;
        const queries = [entities.enemies, entities.projectiles, entities.experience, entities.loot];
        for (let i = 0; i < queries.length; i++) {
            const count = packet.counts[i];
            if (!Number.isInteger(count) || count < 0 || count > queries[i].slots.length) throw new Error("Invalid render query count");
            queries[i].count = count;
        }
        chests.count = packet.counts[4];
        if (!Number.isInteger(chests.count) || chests.count < 0 || chests.count > MAX_COMBAT_CHUNKS) throw new Error("Invalid chest count");
        effects.count = packet.counts[5];
        if (!Number.isInteger(effects.count) || effects.count < 0 || effects.count > effects.kind.length) throw new Error("Invalid effect count");
        return { player: packet.player, entities, chests, effects };
    }
}

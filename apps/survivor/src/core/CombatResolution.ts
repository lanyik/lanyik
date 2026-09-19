import { ActorAction, CombatWorld } from "./CombatWorld";
import { CombatEventKind, EffectCause, Prevention, type CombatEventConsumer } from "./CombatEvents";
import { incomingDamage, outgoingDamage, reflectedDamage, type DerivedStats } from "./CombatStats";
import type { DeterministicRandom } from "./DeterministicRandom";
import { ENEMY_HIT_RULES, ENEMY_SPECIAL, EnemyKind } from "./EnemyDefinitions";
import { StatusKind } from "./StatusSystem";

/** Damage policy and reactive effects. Inventory, progression and visuals are event consumers. */
export class CombatResolution {
    public damageImmunity = 0;
    public shieldCooldown = 0;
    private resolving = false;
    constructor(private readonly e: CombatWorld) {}

    public advance(seconds: number): void {
        this.damageImmunity = Math.max(0, this.damageImmunity - seconds);
        this.shieldCooldown = Math.max(0, this.shieldCooldown - seconds);
    }

    public resolve(tick: number, stats: DerivedStats, random: DeterministicRandom, dashing: boolean, consume: CombatEventConsumer): void {
        if (this.resolving) throw new Error("Damage settlement cannot reenter");
        this.resolving = true;
        const e = this.e, { impacts, world, player } = e;
        try {
            // Enemy support commits before the damage phase, in action order.
            e.events.drain(consume);
            for (let i = 0; i < impacts.count && e.vitals.health[player] > 0; i++) {
                const target = world.resolve(impacts.target[i]);
                if (target < 0 || e.vitals.health[target] <= 0) continue;
                const source = impacts.source[i];
                if (target === player) {
                    if (this.damageImmunity <= 0 && !dashing) this.damagePlayer(source, impacts.damage[i], impacts.elite[i] !== 0, impacts.boss[i] !== 0, tick, stats, random);
                } else this.hitEnemy(source, target, impacts.damage[i], impacts.critical[i] !== 0, tick, stats, random, i);
                // Loot consumes the same RNG before the next hit, preserving seeded combat order.
                e.events.drain(consume);
            }
        } finally { impacts.count = 0; this.resolving = false; }
    }

    private hitEnemy(source: number, slot: number, rolled: number, critical: boolean, tick: number, stats: DerivedStats, random: DeterministicRandom, impact: number): void {
        const e = this.e, { enemy, action, position: p, player, world, vitality } = e;
        if (enemy.kind[slot] === EnemyKind.Guard && action.kind[slot] < ActorAction.Melee) {
            const dx = p.x[player] - p.x[slot], dz = p.z[player] - p.z[slot], distance = Math.hypot(dx, dz);
            if (distance === 0 || (dx * Math.sin(p.heading[slot]) + dz * Math.cos(p.heading[slot])) / distance > .5) rolled *= 1 - ENEMY_SPECIAL.guardReduction;
        }
        const elite = enemy.elite[slot] !== 0;
        const evasion = enemy.boss[slot] ? ENEMY_HIT_RULES.evasion.boss : elite ? ENEMY_HIT_RULES.evasion.elite : ENEMY_HIT_RULES.evasion.normal;
        if (!random.chance(Math.max(0, Math.min(1, stats.accuracy - evasion)))) { this.prevent(source, slot, tick, Prevention.Dodge); return; }
        const frozen = !e.status.canAct(slot, tick);
        if (frozen) rolled *= e.impacts.frozenMultiplier[impact];
        const damage = outgoingDamage(stats, rolled, e.vitals.maxHealth[slot], elite, random.chance(stats.lethalChance))
            * (1 - e.status.amount(StatusKind.Protection, slot, tick));
        const target = world.ids[slot];
        const lost = vitality.damage(source, target, damage, tick, EffectCause.Attack, critical);
        vitality.heal(source, world.ids[player], lost * stats.lifesteal * (1 + stats.regenBonus), tick, EffectCause.Lifesteal);
        vitality.defeat(source, target, tick, EffectCause.Attack);
        if (world.resolve(target) >= 0 && e.vitals.health[slot] > 0) {
            if (frozen && e.impacts.consumeFreeze[impact]) e.status.consumeFreeze(slot, tick);
            if (e.impacts.chill[impact] > 0) e.status.chill(source, target, e.impacts.chill[impact], tick + e.impacts.chillTicks[impact], tick, e.impacts.freezeTicks[impact]);
        }
    }

    private damagePlayer(source: number, base: number, elite: boolean, boss: boolean, tick: number, stats: DerivedStats, random: DeterministicRandom): void {
        const e = this.e, { player, vitality, world } = e, target = world.ids[player];
        this.damageImmunity = .55;
        if (random.chance(stats.evasion)) { this.prevent(source, player, tick, Prevention.Dodge); return; }
        if (this.shieldCooldown === 0) { this.shieldCooldown = stats.shieldRecovery; this.prevent(source, player, tick, Prevention.Shield); return; }
        const criticalChance = boss ? ENEMY_HIT_RULES.criticalChance.boss : elite ? ENEMY_HIT_RULES.criticalChance.elite : ENEMY_HIT_RULES.criticalChance.normal;
        const critical = random.chance(Math.max(0, criticalChance - stats.criticalResistance));
        const blocked = random.chance(stats.blockChance), reduced = incomingDamage(stats, base, elite, critical, blocked)
            * (1 - e.status.amount(StatusKind.Protection, player, tick));
        const damage = e.status.absorb(player, reduced, tick);
        const lost = vitality.damage(source, target, damage, tick, EffectCause.Attack, critical);
        if (lost === 0) this.prevent(source, player, tick, reduced === 0 && blocked ? Prevention.Block : Prevention.Shield);
        // Reflection bypasses on-hit modifiers and cannot recursively trigger lifesteal or reflection.
        const caster = world.resolve(source);
        if (caster >= 0 && e.vitals.health[caster] > 0) {
            vitality.damage(target, source, reflectedDamage(stats, lost, e.vitals.maxHealth[caster]), tick, EffectCause.Reflection);
            vitality.defeat(target, source, tick, EffectCause.Reflection);
        }
        vitality.defeat(source, target, tick, EffectCause.Attack);
    }

    private prevent(source: number, slot: number, tick: number, reason: Prevention): void {
        this.e.events.add(this.e, CombatEventKind.Prevented, EffectCause.Attack, source, slot, 0, tick, false, reason);
    }
}

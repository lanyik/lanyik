import { ActorAction, CombatWorld, Component, Faction } from "./CombatWorld";
import { MELEE_HALF_ARC, MAX_HOSTILE_PROJECTILES, MAX_PROJECTILES, SIMULATION_STEP_MS, ticksForSeconds } from "./GameConfig";
import { ENEMY_SPECIAL } from "./EnemyDefinitions";
import { EffectKind } from "./CombatEffects";
import { SHAMAN_CAST_SOCKET } from "./ActorSockets.generated";
import { segmentCircleHit } from "./ProjectileBatch";
import { crossesCapsule, strikeSegment } from "./EnemyStrikes";

const current = new Float64Array(4), previous = new Float64Array(4);

function advanceStrike(entities: CombatWorld, slot: number, target: number, tick: number): void {
    const { action: a, position: p, enemy: e, world, effects } = entities, kind = a.kind[slot];
    const rule = kind === ActorAction.Fault ? ENEMY_SPECIAL.fault : kind === ActorAction.Jaws ? ENEMY_SPECIAL.jaws : ENEMY_SPECIAL.reave;
    const age = tick - a.hitAt[slot], duration = ticksForSeconds(rule.duration);
    if (age < 0 || age > duration) return;
    const x = kind === ActorAction.Jaws ? a.targetX[slot] : p.x[slot], z = kind === ActorAction.Jaws ? a.targetZ[slot] : p.z[slot], heading = p.heading[slot];
    if (!(a.committed[slot] & 1)) {
        const effect = kind === ActorAction.Fault ? EffectKind.EnemyFault : kind === ActorAction.Jaws ? EffectKind.EnemyJaws : EffectKind.EnemyReave;
        effects.add(effect, a.hitAt[slot], x, z, rule.width, rule.duration + (kind === ActorAction.Fault ? .4 : .3), x + Math.sin(heading), z + Math.cos(heading), world.ids[slot]);
        a.committed[slot] |= 1;
    }
    if (a.committed[slot] & 2) return;
    const t = age / duration, before = Math.max(0, (age - 1) / duration), radius = rule.width + p.radius[target];
    let hit = false;
    for (let side = -1; side <= 1; side += 2) {
        strikeSegment(current, kind, x, z, heading, t, side); strikeSegment(previous, kind, x, z, heading, before, side);
        if (kind === ActorAction.Fault) {
            hit = segmentCircleHit(previous[0] - p.previousX[target], previous[1] - p.previousZ[target],
                current[0] - p.x[target], current[1] - p.z[target], 0, 0, radius) !== Infinity;
        } else if (kind === ActorAction.Jaws) {
            // Translate the player's sweep into the moving blade's frame; no high-speed tunnelling.
            hit = crossesCapsule(p.previousX[target] + current[0] - previous[0], p.previousZ[target] + current[1] - previous[1],
                p.x[target], p.z[target], current[0], current[1], current[2], current[3], radius);
        } else {
            hit = crossesCapsule(p.previousX[target], p.previousZ[target], p.x[target], p.z[target], current[0], current[1], current[2], current[3], radius);
        }
        if (hit || kind !== ActorAction.Jaws) break;
    }
    if (hit && entities.canSee(slot, target)) {
        a.committed[slot] |= 2;
        entities.impacts.add(world.ids[slot], world.ids[target], e.damage[slot] * rule.damage, e.elite[slot], e.boss[slot]);
    }
}

/** Physical attacks advance their real contact area; a release never implies an instant circular hit. */
export function advanceEnemyActions(entities: CombatWorld, tick: number): void {
    const { enemies, enemy: e, position: p, action: a, world, impacts, vitals: v, effects, status } = entities;
    for (let cursor = 0; cursor < enemies.count; cursor++) {
        const slot = enemies.slots[cursor], kind = a.kind[slot];
        if (kind < ActorAction.Melee || !e.active[slot]) continue;
        a.progress[slot] = tick < a.hitAt[slot]
            ? .5 * (tick - a.started[slot]) / (a.hitAt[slot] - a.started[slot])
            : .5 + .5 * (tick - a.hitAt[slot]) / (a.endsAt[slot] - a.hitAt[slot]);
        const target = world.resolve(a.target[slot]);
        if (target < 0) continue;
        if (kind === ActorAction.Heal) { a.targetX[slot] = p.x[target]; a.targetZ[slot] = p.z[target]; }
        if (kind === ActorAction.Fault || kind === ActorAction.Jaws || kind === ActorAction.Reave) {
            advanceStrike(entities, slot, target, tick); continue;
        }
        if (kind === ActorAction.Charge) {
            if (tick < a.hitAt[slot] || tick >= a.hitAt[slot] + ticksForSeconds(ENEMY_SPECIAL.charge.duration)) continue;
            const sx = p.x[slot], sz = p.z[slot];
            const travel = ENEMY_SPECIAL.charge.speed * SIMULATION_STEP_MS / 1000 * (tick < status.slowUntil[slot] ? status.slowScale[slot] : 1);
            entities.moveActor(slot, Math.sin(p.heading[slot]) * travel, Math.cos(p.heading[slot]) * travel, false);
            entities.updateSpatial(slot, Component.Enemy);
            if (!a.committed[slot] && segmentCircleHit(sx, sz, p.x[slot], p.z[slot], p.x[target], p.z[target], p.radius[slot] + p.radius[target]) !== Infinity && entities.canSee(slot, target)) {
                a.committed[slot] = 1;
                impacts.add(world.ids[slot], world.ids[target], e.damage[slot] * ENEMY_SPECIAL.charge.damage, e.elite[slot], e.boss[slot]);
            }
            continue;
        }
        if (tick < a.hitAt[slot] || a.committed[slot]) continue;
        a.committed[slot] = 1;
        const dx = p.x[target] - p.x[slot], dz = p.z[target] - p.z[slot];
        if (kind === ActorAction.Melee) {
            const distance = Math.hypot(dx, dz);
            if (distance <= a.reach[slot] && (distance === 0 || (dx * Math.sin(p.heading[slot]) + dz * Math.cos(p.heading[slot])) / distance >= Math.cos(MELEE_HALF_ARC)) && entities.canSee(slot, target)) {
                impacts.add(world.ids[slot], world.ids[target], e.damage[slot], e.elite[slot], e.boss[slot]);
            }
        } else if (kind === ActorAction.Heal) {
            const cost = v.maxHealth[slot] * ENEMY_SPECIAL.heal.sacrifice;
            if (v.faction[target] !== Faction.Enemy || v.health[target] <= 0 || v.health[target] >= v.maxHealth[target]
                || Math.hypot(dx, dz) > ENEMY_SPECIAL.heal.radius || v.health[slot] <= cost + 1 || !entities.canSee(slot, target)) continue;
            v.health[slot] -= cost;
            v.health[target] = Math.min(v.maxHealth[target], v.health[target] + Math.min(v.maxHealth[target] * ENEMY_SPECIAL.heal.fraction, e.damage[slot] * 3));
            status.wardUntil[target] = tick + ticksForSeconds(ENEMY_SPECIAL.healingWard.duration);
            effects.add(EffectKind.Heal, tick, p.x[slot], p.z[slot], 1, .8, p.x[target], p.z[target]);
        } else if (kind === ActorAction.Cast || kind === ActorAction.Volley) {
            if (!entities.canSee(slot, target)) continue;
            const curved = kind === ActorAction.Volley, count = curved ? 3 : a.variant[slot];
            if (entities.projectiles.count + count > MAX_PROJECTILES || entities.hostileProjectiles.count + count > MAX_HOSTILE_PROJECTILES) continue;
            const scale = p.radius[slot] / .3, sin = Math.sin(p.heading[slot]), cos = Math.cos(p.heading[slot]);
            const launchX = p.x[slot] + (SHAMAN_CAST_SOCKET[0] * cos + SHAMAN_CAST_SOCKET[2] * sin) * scale;
            const launchZ = p.z[slot] + (SHAMAN_CAST_SOCKET[2] * cos - SHAMAN_CAST_SOCKET[0] * sin) * scale;
            const launchY = entities.terrain.height(p.x[slot], p.z[slot]) + SHAMAN_CAST_SOCKET[1] * scale;
            if (entities.terrain.traceAttack(p.x[slot], launchY, p.z[slot], launchX, launchY, launchZ, .14) !== Infinity) continue;
            for (let bolt = 0; bolt < count; bolt++) {
                const offset = bolt - (count - 1) / 2, heading = p.heading[slot] + offset * (curved ? ENEMY_SPECIAL.volley.spread : .24);
                const speed = e.boss[slot] ? 5.5 : 4.5;
                entities.spawnProjectile(world.ids[slot], Faction.Enemy, launchX, launchZ, Math.sin(heading) * speed, Math.cos(heading) * speed,
                    e.damage[slot] * (curved ? ENEMY_SPECIAL.volley.damage : 1), a.reach[slot] / speed + .3,
                    { elite: e.elite[slot], boss: e.boss[slot], height: SHAMAN_CAST_SOCKET[1] * scale, groundX: p.x[slot], groundZ: p.z[slot],
                        turnRate: curved && offset !== 0 ? -offset * ENEMY_SPECIAL.volley.turnRate : 0,
                        velocityY: (entities.aimHeight(target) - launchY)
                            * speed / Math.max(.1, Math.hypot(p.x[target] - launchX, p.z[target] - launchZ)) });
            }
        }
    }
}

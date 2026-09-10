import { ActorAction, CombatWorld, Faction, MoveIntent } from "./CombatWorld";
import { MELEE_HALF_ARC, MAX_HOSTILE_PROJECTILES, MAX_PROJECTILES, ticksForSeconds } from "./GameConfig";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { resolveProjectileRange, segmentCircleHit, type ProjectileExecutor } from "./ProjectileBatch";
import { ENEMY_SPECIAL } from "./EnemyDefinitions";
import { EffectKind } from "./CombatEffects";

const SECONDS = COMBAT_STEP_MS / 1000;

/** Projectiles remove only their own query members and defer damage to a phase boundary. */
export function advanceProjectiles(entities: CombatWorld): void;
export function advanceProjectiles(entities: CombatWorld, executor: ProjectileExecutor): Promise<void>;
export function advanceProjectiles(entities: CombatWorld, executor?: ProjectileExecutor): void | Promise<void> {
    const { position: p, projectile: b, projectiles, enemies, player, world, projectileBatch: batch } = entities;
    if (projectiles.count === 0) return executor ? Promise.resolve() : undefined;
    batch.enemyCount = projectiles.count === entities.hostileProjectiles.count ? 0 : enemies.count;
    batch.count = projectiles.count;
    batch.setPlayer(world.ids[player], p.x[player], p.z[player], p.radius[player]);
    for (let cursor = 0; cursor < batch.enemyCount; cursor++) {
        const slot = enemies.slots[cursor];
        batch.enemyIds[cursor] = world.ids[slot]; batch.enemyX[cursor] = p.x[slot];
        batch.enemyZ[cursor] = p.z[slot]; batch.enemyRadius[cursor] = p.radius[slot];
    }
    for (let cursor = 0; cursor < projectiles.count; cursor++) {
        const slot = projectiles.slots[cursor];
        const sx = p.x[slot], sz = p.z[slot];
        p.previousX[slot] = sx; p.previousZ[slot] = sz;
        const dt = Math.min(SECONDS, Math.max(0, b.lifetime[slot]));
        const ex = p.x[slot] = sx + b.velocityX[slot] * dt;
        const ez = p.z[slot] = sz + b.velocityZ[slot] * dt;
        b.lifetime[slot] -= SECONDS;
        entities.projectileBatchIndices[slot] = cursor;
        batch.startX[cursor] = sx; batch.startZ[cursor] = sz; batch.endX[cursor] = ex; batch.endZ[cursor] = ez;
        batch.radius[cursor] = p.radius[slot]; batch.hostile[cursor] = Number(b.faction[slot] === Faction.Enemy);
    }
    if (executor) return executor.resolve(batch).then(() => commitProjectiles(entities));
    resolveProjectileRange(batch);
    commitProjectiles(entities);
}

function commitProjectiles(entities: CombatWorld): void {
    const { projectiles, projectile: b, impacts, projectileBatch: batch } = entities;
    let cursor = 0;
    while (cursor < projectiles.count) {
        const slot = projectiles.slots[cursor], target = batch.targets[entities.projectileBatchIndices[slot]];
        if (target !== 0) impacts.add(b.source[slot], target, b.damage[slot], b.elite[slot], b.boss[slot]);
        if (target !== 0 || b.lifetime[slot] <= 0) { entities.remove(slot); continue; }
        cursor++;
    }
}

export function moveEnemies(entities: CombatWorld, tick: number): void {
    const { enemies, enemy: e, position: p, action: a, world, player, status } = entities;
    for (let cursor = 0; cursor < enemies.count; cursor++) {
        const slot = enemies.slots[cursor], intent = e.intent[slot];
        if (intent === MoveIntent.None) continue;
        let dx = (intent === MoveIntent.Return ? e.homeX[slot] : p.x[player]) - p.x[slot];
        let dz = (intent === MoveIntent.Return ? e.homeZ[slot] : p.z[player]) - p.z[slot];
        const distance = Math.hypot(dx, dz);
        if (distance === 0 && intent !== MoveIntent.Retreat) continue;
        if (distance === 0) { dx = Math.sin(world.ids[slot]); dz = Math.cos(world.ids[slot]); }
        else { dx /= distance; dz /= distance; }
        if (intent === MoveIntent.Retreat) { dx = -dx; dz = -dz; }
        const speed = e.speed[slot] * (tick < status.slowUntil[slot] ? status.slowScale[slot] : 1);
        const stop = intent === MoveIntent.Chase || intent === MoveIntent.Flank ? a.reach[slot] * .9 : 0;
        if (intent === MoveIntent.Circle) {
            const direction = world.ids[slot] % 2 ? 1 : -1, radial = Math.max(-.5, Math.min(.5, distance - 1.8));
            const forwardX = dx, forwardZ = dz;
            dx = forwardX * radial - forwardZ * direction; dz = forwardZ * radial + forwardX * direction;
            const norm = Math.hypot(dx, dz); dx /= norm; dz /= norm;
        }
        const travel = intent === MoveIntent.Retreat || intent === MoveIntent.Circle ? speed * e.intentSeconds[slot]
            : Math.min(Math.max(0, distance - stop), speed * e.intentSeconds[slot]);
        const weave = intent === MoveIntent.Flank ? (world.ids[slot] % 2 ? .4 : -.4) : 0;
        const scale = travel / Math.sqrt(1 + weave * weave);
        p.x[slot] += (dx - dz * weave) * scale; p.z[slot] += (dz + dx * weave) * scale;
        p.heading[slot] = Math.atan2(dx, dz);
        if (travel > 0) a.kind[slot] = ActorAction.Moving;
        if (!e.active[slot]) { p.previousX[slot] = p.x[slot]; p.previousZ[slot] = p.z[slot]; }
    }
}

/** A committed attack releases once at hitAt; recovery cannot emit a second hit. */
export function advanceEnemyActions(entities: CombatWorld, tick: number): void {
    const { enemies, enemy: e, position: p, action: a, world, impacts, vitals: v, effects, status } = entities;
    for (let cursor = 0; cursor < enemies.count; cursor++) {
        const slot = enemies.slots[cursor], kind = a.kind[slot];
        if (kind < ActorAction.Melee || !e.active[slot]) continue;
        a.progress[slot] = tick < a.hitAt[slot]
            ? .5 * (tick - a.started[slot]) / (a.hitAt[slot] - a.started[slot])
            : .5 + .5 * (tick - a.hitAt[slot]) / (a.endsAt[slot] - a.hitAt[slot]);
        if (kind === ActorAction.Charge) {
            if (tick < a.hitAt[slot] || tick >= a.hitAt[slot] + ticksForSeconds(ENEMY_SPECIAL.charge.duration)) continue;
            const target = world.resolve(a.target[slot]), sx = p.x[slot], sz = p.z[slot];
            const travel = ENEMY_SPECIAL.charge.speed * SECONDS * (tick < status.slowUntil[slot] ? status.slowScale[slot] : 1);
            p.x[slot] += Math.sin(p.heading[slot]) * travel; p.z[slot] += Math.cos(p.heading[slot]) * travel;
            if (!a.committed[slot] && target >= 0 && segmentCircleHit(sx, sz, p.x[slot], p.z[slot], p.x[target], p.z[target], p.radius[slot] + p.radius[target]) !== Infinity) {
                a.committed[slot] = 1;
                impacts.add(world.ids[slot], world.ids[target], e.damage[slot] * ENEMY_SPECIAL.charge.damage, e.elite[slot], e.boss[slot]);
            }
            continue;
        }
        if (tick < a.hitAt[slot] || a.committed[slot]) continue;
        a.committed[slot] = 1;
        const target = world.resolve(a.target[slot]);
        if (target < 0) continue;
        const dx = p.x[target] - p.x[slot], dz = p.z[target] - p.z[slot];
        if (kind === ActorAction.Melee) {
            const distance = Math.hypot(dx, dz);
            if (distance <= a.reach[slot] && (distance === 0 || (dx * Math.sin(p.heading[slot]) + dz * Math.cos(p.heading[slot])) / distance >= Math.cos(MELEE_HALF_ARC))) {
                impacts.add(world.ids[slot], world.ids[target], e.damage[slot], e.elite[slot], e.boss[slot]);
            }
        } else if (kind === ActorAction.Heal) {
            if (v.faction[target] !== Faction.Enemy || v.health[target] <= 0 || Math.hypot(dx, dz) > ENEMY_SPECIAL.heal.radius) continue;
            v.health[target] = Math.min(v.maxHealth[target], v.health[target] + Math.min(v.maxHealth[target] * ENEMY_SPECIAL.heal.fraction, e.damage[slot] * 3));
            effects.add(EffectKind.Heal, tick, p.x[target], p.z[target], 1.1, .8);
        } else if (kind === ActorAction.Nova) {
            if (Math.hypot(dx, dz) <= ENEMY_SPECIAL.nova.radius + p.radius[target]) impacts.add(world.ids[slot], world.ids[target], e.damage[slot] * ENEMY_SPECIAL.nova.damage, e.elite[slot], e.boss[slot]);
            effects.add(EffectKind.EnemyNova, tick, p.x[slot], p.z[slot], ENEMY_SPECIAL.nova.radius, .7);
        } else if (kind === ActorAction.Cast) {
            const count = a.variant[slot];
            // A volley reserves all its slots; pressure never changes its pattern halfway through.
            if (entities.projectiles.count + count > MAX_PROJECTILES || entities.hostileProjectiles.count + count > MAX_HOSTILE_PROJECTILES) continue;
            for (let bolt = 0; bolt < count; bolt++) {
                const heading = p.heading[slot] + (bolt - (count - 1) / 2) * .24;
                const x = Math.sin(heading), z = Math.cos(heading), speed = e.boss[slot] ? 5.5 : 4.5;
                entities.spawnProjectile(world.ids[slot], Faction.Enemy,
                    p.x[slot] + x * p.radius[slot], p.z[slot] + z * p.radius[slot],
                    x * speed, z * speed, e.damage[slot], a.reach[slot] / speed + .3, false, e.elite[slot], e.boss[slot]);
            }
        }
    }
}

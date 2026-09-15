import { ActorAction, CombatWorld, Component, Faction, MoveIntent } from "./CombatWorld";
import { GAME_CONFIG } from "./GameConfig";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { resolveProjectileRange, type ProjectileExecutor } from "./ProjectileBatch";
import { ENEMY_DEFINITIONS, ENEMY_SPECIAL } from "./EnemyDefinitions";
import { segmentCylinderHit } from "./AttackGeometry";
export { advanceEnemyActions } from "./EnemyActions";

const SECONDS = COMBAT_STEP_MS / 1000;

/** Projectiles remove only their own query members and defer damage to a phase boundary. */
export function advanceProjectiles(entities: CombatWorld): void;
export function advanceProjectiles(entities: CombatWorld, executor: ProjectileExecutor): Promise<void>;
export function advanceProjectiles(entities: CombatWorld, executor?: ProjectileExecutor): void | Promise<void> {
    const { position: p, projectile: b, projectiles, enemies, player, world, projectileBatch: batch } = entities;
    if (projectiles.count === 0) return executor ? Promise.resolve() : undefined;
    batch.enemyCount = projectiles.count === entities.hostileProjectiles.count ? 0 : enemies.count;
    batch.count = projectiles.count;
    const playerGround = entities.terrain.height(p.x[player], p.z[player]);
    batch.setPlayer(world.ids[player], p.x[player], p.z[player], p.radius[player], playerGround, playerGround + entities.bodyHeight(player));
    for (let cursor = 0; cursor < batch.enemyCount; cursor++) {
        const slot = enemies.slots[cursor];
        batch.enemyIds[cursor] = world.ids[slot]; batch.enemyX[cursor] = p.x[slot];
        batch.enemyZ[cursor] = p.z[slot]; batch.enemyRadius[cursor] = p.radius[slot];
        batch.enemyBottom[cursor] = entities.terrain.height(p.x[slot], p.z[slot]);
        batch.enemyTop[cursor] = batch.enemyBottom[cursor] + entities.bodyHeight(slot);
        entities.projectileEnemyIndices[slot] = cursor;
    }
    for (let cursor = 0; cursor < projectiles.count; cursor++) {
        const slot = projectiles.slots[cursor];
        const sx = p.x[slot], sz = p.z[slot];
        p.previousX[slot] = sx; p.previousZ[slot] = sz; b.previousY[slot] = b.y[slot];
        const dt = Math.min(SECONDS, Math.max(0, b.lifetime[slot]));
        if (b.turnRate[slot] && b.age[slot] < ENEMY_SPECIAL.volley.turnSeconds) {
            const angle = b.turnRate[slot] * Math.min(dt, ENEMY_SPECIAL.volley.turnSeconds - b.age[slot]);
            const cos = Math.cos(angle), sin = Math.sin(angle), vx = b.velocityX[slot], vz = b.velocityZ[slot];
            b.velocityX[slot] = vx * cos + vz * sin; b.velocityZ[slot] = vz * cos - vx * sin;
            p.heading[slot] = Math.atan2(b.velocityX[slot], b.velocityZ[slot]);
        }
        const ex = p.x[slot] = sx + b.velocityX[slot] * dt;
        const ez = p.z[slot] = sz + b.velocityZ[slot] * dt;
        b.y[slot] += b.velocityY[slot] * dt;
        b.lifetime[slot] -= SECONDS;
        b.age[slot] += dt;
        entities.projectileBatchIndices[slot] = cursor;
        batch.startX[cursor] = sx; batch.startZ[cursor] = sz; batch.endX[cursor] = ex; batch.endZ[cursor] = ez;
        batch.radius[cursor] = p.radius[slot]; batch.hostile[cursor] = Number(b.faction[slot] === Faction.Enemy);
        batch.startY[cursor] = b.previousY[slot]; batch.endY[cursor] = b.y[slot];
    }
    batch.prepare(entities.spatial, entities.projectileCandidates, Component.Enemy, entities.projectileEnemyIndices);
    if (executor) return executor.resolve(batch).then(() => commitProjectiles(entities));
    resolveProjectileRange(batch);
    commitProjectiles(entities);
}

function commitProjectiles(entities: CombatWorld): void {
    const { projectiles, projectile: b, impacts, projectileBatch: batch, position: p, terrain } = entities;
    let cursor = 0;
    while (cursor < projectiles.count) {
        const slot = projectiles.slots[cursor], target = batch.targets[entities.projectileBatchIndices[slot]];
        const victim = entities.world.resolve(target), radius = p.radius[slot];
        let end = 1;
        if (victim >= 0) {
            const bottom = terrain.height(p.x[victim], p.z[victim]);
            end = segmentCylinderHit(p.previousX[slot], b.previousY[slot], p.previousZ[slot], p.x[slot], b.y[slot], p.z[slot],
                p.x[victim], p.z[victim], bottom - radius, bottom + entities.bodyHeight(victim) + radius, p.radius[victim] + radius);
            // Reconstructing the clipped endpoint can round just before a shared surface contact.
            end = Math.min(1, end + Number.EPSILON * 32);
        }
        const blocked = terrain.traceAttack(p.previousX[slot], b.previousY[slot], p.previousZ[slot],
            p.previousX[slot] + (p.x[slot] - p.previousX[slot]) * end, b.previousY[slot] + (b.y[slot] - b.previousY[slot]) * end,
            p.previousZ[slot] + (p.z[slot] - p.previousZ[slot]) * end, radius) !== Infinity;
        if (target !== 0 && !blocked) impacts.add(b.source[slot], target, b.damage[slot], b.elite[slot], b.boss[slot], b.critical[slot]);
        if (target !== 0 || blocked || b.lifetime[slot] <= 0) { entities.remove(slot); continue; }
        cursor++;
    }
}

export function moveEnemies(entities: CombatWorld, tick: number): void {
    const { enemies, enemy: e, position: p, action: a, world, player, status } = entities;
    for (let cursor = 0; cursor < enemies.count; cursor++) {
        const slot = enemies.slots[cursor], intent = e.intent[slot];
        if (intent === MoveIntent.None) continue;
        let dx = (intent === MoveIntent.Patrol ? e.patrolX[slot] : intent === MoveIntent.Return ? e.homeX[slot] : p.x[player]) - p.x[slot];
        let dz = (intent === MoveIntent.Patrol ? e.patrolZ[slot] : intent === MoveIntent.Return ? e.homeZ[slot] : p.z[player]) - p.z[slot];
        const distance = Math.hypot(dx, dz);
        if (distance === 0 && intent !== MoveIntent.Retreat) continue;
        if (distance === 0) { dx = Math.sin(world.ids[slot]); dz = Math.cos(world.ids[slot]); }
        else { dx /= distance; dz /= distance; }
        if (intent === MoveIntent.Retreat) { dx = -dx; dz = -dz; }
        const speed = e.speed[slot] * (intent === MoveIntent.Patrol ? GAME_CONFIG.enemies.patrolSpeed : 1)
            * (tick < status.slowUntil[slot] ? status.slowScale[slot] : 1);
        const stop = intent === MoveIntent.Chase || intent === MoveIntent.Flank ? a.reach[slot] * .9 : 0;
        if (intent === MoveIntent.Circle) {
            const preferred = ENEMY_DEFINITIONS[e.kind[slot]].ranged ? a.reach[slot] * .8 : 1.8;
            const direction = world.ids[slot] % 2 ? 1 : -1, radial = Math.max(-.5, Math.min(.5, distance - preferred));
            const forwardX = dx, forwardZ = dz;
            dx = forwardX * radial - forwardZ * direction; dz = forwardZ * radial + forwardX * direction;
            const norm = Math.hypot(dx, dz); dx /= norm; dz /= norm;
        }
        const travel = intent === MoveIntent.Retreat || intent === MoveIntent.Circle ? speed * SECONDS
            : Math.min(Math.max(0, distance - stop), speed * SECONDS);
        const weave = intent === MoveIntent.Flank ? (world.ids[slot] % 2 ? .4 : -.4) : 0;
        const scale = travel / Math.sqrt(1 + weave * weave);
        const startX = p.x[slot], startZ = p.z[slot];
        let moved = entities.moveActor(slot, (dx - dz * weave) * scale, (dz + dx * weave) * scale);
        // Bounded local steering around trunks. Charges keep their committed heading.
        if (!moved && travel > 0) {
            const side = world.ids[slot] % 2 ? 1 : -1;
            for (let attempt = 0; attempt < 2; attempt++) {
                const direction = attempt === 0 ? side : -side;
                moved = entities.moveActor(slot, (dx * .5 - dz * .866 * direction) * travel, (dz * .5 + dx * .866 * direction) * travel, false);
                if (moved) break;
            }
        }
        if (moved) p.heading[slot] = Math.atan2(p.x[slot] - startX, p.z[slot] - startZ);
        a.kind[slot] = moved ? ActorAction.Moving : ActorAction.Idle;
        entities.updateSpatial(slot, Component.Enemy);
    }
}

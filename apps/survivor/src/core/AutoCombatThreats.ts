import { ActorAction, CombatWorld, Component } from "./CombatWorld";
import { ENEMY_SPECIAL } from "./EnemyDefinitions";
import { GAME_CONFIG, MELEE_HALF_ARC, PLAYER_RADIUS, ticksForSeconds } from "./GameConfig";
import { crossesCapsule } from "./EnemyStrikes";
import { segmentCircleHit } from "./ProjectileBatch";

/** Conservative short-horizon danger estimates from already published action facts. */
export class AutoCombatThreats {
    private readonly enemies = new Uint16Array(8);
    private readonly distances = new Float64Array(8);
    private count = 0;
    constructor(private readonly entities: CombatWorld) {}

    public sense(x: number, z: number): void {
        this.count = 0;
        const e = this.entities, nearby = e.queryNearby(Component.Enemy, x, z, 10);
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i], kind = e.action.kind[slot];
            if (!e.enemy.active[slot] || kind < ActorAction.Melee || kind === ActorAction.Heal) continue;
            const distance = (e.position.x[slot] - x) ** 2 + (e.position.z[slot] - z) ** 2;
            let index = this.count;
            while (index > 0 && (distance < this.distances[index - 1]
                || (distance === this.distances[index - 1] && e.world.ids[slot] < e.world.ids[this.enemies[index - 1]]))) index--;
            if (index >= this.enemies.length) continue;
            for (let j = Math.min(this.count, this.enemies.length - 1); j > index; j--) {
                this.enemies[j] = this.enemies[j - 1]; this.distances[j] = this.distances[j - 1];
            }
            this.enemies[index] = slot; this.distances[index] = distance; this.count = Math.min(this.count + 1, this.enemies.length);
        }
    }

    public risk(x: number, z: number, tick: number, seconds: number): number {
        const e = this.entities, p = e.position, a = e.action, future = tick + ticksForSeconds(seconds);
        let risk = 0;
        for (let i = 0; i < this.count; i++) {
            const slot = this.enemies[i], kind = a.kind[slot], hit = a.hitAt[slot];
            if (hit > future || tick > a.endsAt[slot]) continue;
            const dx = x - p.x[slot], dz = z - p.z[slot], distance = Math.hypot(dx, dz), heading = p.heading[slot];
            const forward = dx * Math.sin(heading) + dz * Math.cos(heading), side = dx * Math.cos(heading) - dz * Math.sin(heading);
            let dangerous = false;
            if (kind === ActorAction.Melee) dangerous = !a.committed[slot] && distance <= a.reach[slot] + .1
                && (distance === 0 || forward / distance >= Math.cos(MELEE_HALF_ARC + .1));
            else if (kind === ActorAction.Charge && !a.committed[slot]) {
                const remaining = Math.max(0, ENEMY_SPECIAL.charge.duration - Math.max(0, tick - hit) / GAME_CONFIG.timing.simulationHz);
                dangerous = crossesCapsule(x, z, x, z, p.x[slot], p.z[slot], p.x[slot] + Math.sin(heading) * remaining * ENEMY_SPECIAL.charge.speed,
                    p.z[slot] + Math.cos(heading) * remaining * ENEMY_SPECIAL.charge.speed, p.radius[slot] + PLAYER_RADIUS + .1);
            } else if (!(a.committed[slot] & 2)) {
                if (kind === ActorAction.Reave && tick <= hit + ticksForSeconds(ENEMY_SPECIAL.reave.duration)) {
                    dangerous = distance <= ENEMY_SPECIAL.reave.radius + PLAYER_RADIUS && forward >= 0
                        && (distance === 0 || forward / distance >= Math.cos(ENEMY_SPECIAL.reave.halfArc + .15));
                } else if (kind === ActorAction.Fault && tick <= hit + ticksForSeconds(ENEMY_SPECIAL.fault.duration)) {
                    dangerous = forward >= -PLAYER_RADIUS && forward <= ENEMY_SPECIAL.fault.length + PLAYER_RADIUS
                        && Math.abs(side) <= ENEMY_SPECIAL.fault.width + PLAYER_RADIUS;
                } else if (kind === ActorAction.Jaws && tick <= hit + ticksForSeconds(ENEMY_SPECIAL.jaws.duration)) {
                    const tx = x - a.targetX[slot], tz = z - a.targetZ[slot];
                    dangerous = Math.abs(tx * Math.sin(heading) + tz * Math.cos(heading)) <= ENEMY_SPECIAL.jaws.halfLength + PLAYER_RADIUS
                        && Math.abs(tx * Math.cos(heading) - tz * Math.sin(heading)) <= ENEMY_SPECIAL.jaws.halfGap + PLAYER_RADIUS;
                } else if (kind === ActorAction.Quake) {
                    const duration = ticksForSeconds(ENEMY_SPECIAL.quake.duration), width = ENEMY_SPECIAL.quake.width + PLAYER_RADIUS;
                    const from = ENEMY_SPECIAL.quake.radius * Math.max(0, tick - hit) / duration;
                    const to = ENEMY_SPECIAL.quake.radius * Math.min(duration, Math.max(0, future - hit)) / duration;
                    dangerous = tick <= hit + duration && distance >= from - width && distance <= to + width;
                }
            }
            if (dangerous) risk += 2;
        }
        for (let i = 0; i < e.hostileProjectiles.count; i++) {
            const slot = e.hostileProjectiles.slots[i], bolt = e.projectile, horizon = Math.min(seconds, bolt.lifetime[slot]);
            const hit = segmentCircleHit(p.x[slot], p.z[slot], p.x[slot] + bolt.velocityX[slot] * horizon,
                p.z[slot] + bolt.velocityZ[slot] * horizon, x, z, PLAYER_RADIUS + p.radius[slot] + .1);
            if (hit === Infinity) continue;
            const height = bolt.y[slot] + bolt.velocityY[slot] * horizon * hit - e.terrain.height(x, z);
            if (height >= -.1 && height <= 1.5) risk++;
        }
        return risk;
    }
}

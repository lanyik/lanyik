import { ActorAction, CombatWorld, Component } from "./CombatWorld";
import { ENEMY_SPECIAL } from "./EnemyDefinitions";
import { GAME_CONFIG, MAX_HOSTILE_PROJECTILES, MELEE_HALF_ARC, PLAYER_RADIUS, ticksForSeconds } from "./GameConfig";
import { crossesCapsule, strikeSegment } from "./EnemyStrikes";
import { segmentCircleHit } from "./ProjectileBatch";
import { SHAMAN_CAST_SOCKET } from "./ActorSockets.generated";
import { segmentCylinderHit } from "./AttackGeometry";

const STEP = .1, STEPS = 24, HORIZON = STEP * STEPS, ENEMIES = 8, MARGIN = .12;
const BOLTS = MAX_HOSTILE_PROJECTILES + ENEMIES * ENEMY_SPECIAL.storm.waves * 5;
const HZ = GAME_CONFIG.timing.simulationHz;

/** Bounded forecasts of published attacks; candidate paths use ordinary movement and collision. */
export class AutoCombatThreats {
    private readonly enemies = new Uint16Array(ENEMIES);
    private readonly distances = new Float64Array(ENEMIES);
    private count = 0;
    private tick = 0;
    private readonly pathX = new Float64Array(STEPS + 1);
    private readonly pathZ = new Float64Array(STEPS + 1);
    private readonly pathHeight = new Float64Array(STEPS + 1);
    private readonly blade = new Float64Array(4);
    private readonly beforeBlade = new Float64Array(4);
    private readonly boltX = new Float64Array(BOLTS * (STEPS + 1));
    private readonly boltZ = new Float64Array(BOLTS * (STEPS + 1));
    private readonly boltY = new Float64Array(BOLTS * (STEPS + 1));
    private readonly starts = new Float64Array(BOLTS);
    private readonly ends = new Float64Array(BOLTS);
    private readonly radii = new Float64Array(BOLTS);
    private bolts = 0;
    constructor(private readonly entities: CombatWorld) {}

    public sense(tick: number): void {
        this.tick = tick; this.count = this.bolts = 0;
        const e = this.entities, p = e.position, a = e.action;
        const nearby = e.queryNearby(Component.Enemy, p.x[e.player], p.z[e.player], 14);
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i], kind = a.kind[slot];
            if (!e.enemy.active[slot] || a.endsAt[slot] < tick || !this.pending(slot)) continue;
            // A crowd's ordinary melee windups must not hide a visible special attack.
            const distance = (p.x[slot] - p.x[e.player]) ** 2 + (p.z[slot] - p.z[e.player]) ** 2
                + (kind === ActorAction.Melee ? 14 ** 2 + 1 : 0);
            let index = this.count;
            while (index > 0 && (distance < this.distances[index - 1]
                || (distance === this.distances[index - 1] && e.world.ids[slot] < e.world.ids[this.enemies[index - 1]]))) index--;
            if (index >= ENEMIES) continue;
            for (let j = Math.min(this.count, ENEMIES - 1); j > index; j--) {
                this.enemies[j] = this.enemies[j - 1]; this.distances[j] = this.distances[j - 1];
            }
            this.enemies[index] = slot; this.distances[index] = distance; this.count = Math.min(this.count + 1, ENEMIES);
        }
        for (let i = 0; i < e.hostileProjectiles.count; i++) {
            const slot = e.hostileProjectiles.slots[i], b = e.projectile;
            this.forecastBolt(p.x[slot], b.y[slot], p.z[slot], b.velocityX[slot], b.velocityY[slot], b.velocityZ[slot],
                b.turnRate[slot], b.age[slot], 0, b.lifetime[slot], p.radius[slot]);
        }
        for (let i = 0; i < this.count; i++) {
            const slot = this.enemies[i], kind = a.kind[slot];
            if (kind !== ActorAction.Cast && kind !== ActorAction.Volley && kind !== ActorAction.Storm) continue;
            if (!e.canSee(slot, e.player)) continue;
            const storm = kind === ActorAction.Storm, curved = kind === ActorAction.Volley;
            const waves = storm ? ENEMY_SPECIAL.storm.waves : 1, count = curved ? 3 : a.variant[slot];
            const scale = p.radius[slot] / .3, sin = Math.sin(p.heading[slot]), cos = Math.cos(p.heading[slot]);
            const x = p.x[slot] + (SHAMAN_CAST_SOCKET[0] * cos + SHAMAN_CAST_SOCKET[2] * sin) * scale;
            const z = p.z[slot] + (SHAMAN_CAST_SOCKET[2] * cos - SHAMAN_CAST_SOCKET[0] * sin) * scale;
            const y = e.terrain.height(p.x[slot], p.z[slot]) + SHAMAN_CAST_SOCKET[1] * scale;
            const speed = e.enemy.boss[slot] ? 5.5 : 4.5;
            const vy = (e.aimHeight(e.player) - y) * speed / Math.max(.1, Math.hypot(p.x[e.player] - x, p.z[e.player] - z));
            for (let wave = a.committed[slot]; wave < waves; wave++) {
                const start = Math.max(0, (a.hitAt[slot] + (storm ? wave * ticksForSeconds(ENEMY_SPECIAL.storm.interval) : 0) - tick) / HZ);
                for (let bolt = 0; bolt < count; bolt++) {
                    const offset = bolt - (count - 1) / 2, heading = p.heading[slot]
                        + offset * (storm ? ENEMY_SPECIAL.storm.spread : curved ? ENEMY_SPECIAL.volley.spread : .24)
                        + (storm ? (wave - 1) * .2 : 0);
                    this.forecastBolt(x, y, z, Math.sin(heading) * speed, vy, Math.cos(heading) * speed,
                        curved ? -offset * ENEMY_SPECIAL.volley.turnRate : 0, 0, start, a.reach[slot] / speed + .3, .14);
                }
            }
        }
    }

    /** Only attacks that can still release/contact inside the forecast may occupy a threat slot. */
    private pending(slot: number): boolean {
        const a = this.entities.action, kind = a.kind[slot], committed = a.committed[slot];
        if (kind < ActorAction.Melee || kind === ActorAction.Heal || a.hitAt[slot] > this.tick + HORIZON * HZ) return false;
        if (kind === ActorAction.Storm) return committed < ENEMY_SPECIAL.storm.waves
            && a.hitAt[slot] + committed * ticksForSeconds(ENEMY_SPECIAL.storm.interval) < this.tick + HORIZON * HZ;
        if (kind === ActorAction.Melee || kind === ActorAction.Cast || kind === ActorAction.Volley) return committed === 0;
        if (kind === ActorAction.Charge) return committed === 0 && this.tick < a.hitAt[slot] + ticksForSeconds(ENEMY_SPECIAL.charge.duration);
        const rule = kind === ActorAction.Quake ? ENEMY_SPECIAL.quake : kind === ActorAction.Fault ? ENEMY_SPECIAL.fault
            : kind === ActorAction.Jaws ? ENEMY_SPECIAL.jaws : ENEMY_SPECIAL.reave;
        return !(committed & 2) && this.tick <= a.hitAt[slot] + ticksForSeconds(rule.duration);
    }

    private forecastBolt(x: number, y: number, z: number, vx: number, vy: number, vz: number,
        turn: number, age: number, start: number, lifetime: number, radius: number): void {
        if (start >= HORIZON || lifetime <= 0) return;
        const bolt = this.bolts++, base = bolt * (STEPS + 1);
        let end = Math.min(HORIZON, start + lifetime), straightChecked = false;
        this.starts[bolt] = start; this.ends[bolt] = end; this.radii[bolt] = radius;
        for (let step = Math.floor(start / STEP); step < STEPS && step * STEP < end; step++) {
            const from = Math.max(start, step * STEP);
            this.boltX[base + step] = x; this.boltY[base + step] = y; this.boltZ[base + step] = z;
            const turning = turn !== 0 && age < ENEMY_SPECIAL.volley.turnSeconds - 1e-8;
            if (!turning && !straightChecked) {
                const remaining = end - from;
                const blocked = this.entities.terrain.traceAttack(x, y, z, x + vx * remaining, y + vy * remaining, z + vz * remaining, radius);
                if (blocked !== Infinity) this.ends[bolt] = end = from + remaining * blocked;
                straightChecked = true;
            }
            const to = Math.min(end, (step + 1) * STEP), dt = to - from;
            const angle = turning ? turn * Math.min(dt, ENEMY_SPECIAL.volley.turnSeconds - age) : 0;
            const cos = Math.cos(angle / 2), sin = Math.sin(angle / 2);
            const mx = vx * cos + vz * sin, mz = vz * cos - vx * sin;
            const ex = x + mx * dt, ey = y + vy * dt, ez = z + mz * dt;
            // Curves use short sweeps; their straight remainder needs just one cover trace.
            const blocked = turning ? this.entities.terrain.traceAttack(x, y, z, ex, ey, ez, radius) : Infinity;
            const fraction = blocked === Infinity ? 1 : blocked;
            x += (ex - x) * fraction; y += (ey - y) * fraction; z += (ez - z) * fraction;
            this.boltX[base + step + 1] = x; this.boltY[base + step + 1] = y; this.boltZ[base + step + 1] = z;
            if (blocked !== Infinity) { this.ends[bolt] = from + dt * fraction; break; }
            vx = mx * cos + mz * sin; vz = mz * cos - mx * sin; age += dt;
        }
    }

    /** Each attack scores once; earlier contact costs more. Zero means no forecast contact. */
    public risk(dx: number, dz: number, speed: number, travel: number, vx: number, vz: number, limit = Infinity): number {
        if (!this.count && !this.bolts) return 0;
        const e = this.entities, p = e.position;
        this.pathX[0] = p.x[e.player]; this.pathZ[0] = p.z[e.player];
        this.pathHeight.fill(NaN);
        const length = Math.hypot(dx, dz), moveUntil = length ? travel / (speed * length) : 0;
        for (let step = 1; step <= STEPS; step++) {
            const active = Math.max(0, Math.min(STEP, moveUntil - (step - 1) * STEP));
            const response = Math.exp(-36 * active), coast = Math.exp(-36 * (STEP - active));
            const tx = dx * speed, tz = dz * speed;
            let mx = tx * active + (vx - tx) * (1 - response) / 36;
            let mz = tz * active + (vz - tz) * (1 - response) / 36;
            vx = tx + (vx - tx) * response; vz = tz + (vz - tz) * response;
            mx += vx * (1 - coast) / 36; mz += vz * (1 - coast) / 36; vx *= coast; vz *= coast;
            const x = this.pathX[step - 1], z = this.pathZ[step - 1];
            const moved = e.terrain.move(x, z, mx, mz, PLAYER_RADIUS, false);
            this.pathX[step] = moved.x; this.pathZ[step] = moved.z;
            if (Math.hypot(moved.x - x - mx, moved.z - z - mz) > 1e-5) vx = vz = 0;
        }
        let risk = 0;
        for (let i = 0; i < this.count; i++) {
            risk += this.enemyRisk(this.enemies[i]);
            if (risk > limit) return risk;
        }
        for (let bolt = 0; bolt < this.bolts; bolt++) {
            const base = bolt * (STEPS + 1), start = this.starts[bolt], end = this.ends[bolt];
            for (let step = Math.floor(start / STEP); step < STEPS && step * STEP < end; step++) {
                const from = Math.max(start, step * STEP), to = Math.min(end, (step + 1) * STEP);
                if (to <= from) continue;
                // Most segments align with the shared forecast grid; only clipped endpoints
                // need interpolation. Avoid four repeated divisions/floors per bolt and step.
                const wholeStart = from === step * STEP, wholeEnd = to === (step + 1) * STEP;
                const ax = wholeStart ? this.pathX[step] : this.xAt(from), az = wholeStart ? this.pathZ[step] : this.zAt(from);
                const bx = wholeEnd ? this.pathX[step + 1] : this.xAt(to), bz = wholeEnd ? this.pathZ[step + 1] : this.zAt(to);
                const rx0 = this.boltX[base + step] - ax, rz0 = this.boltZ[base + step] - az;
                const rx1 = this.boltX[base + step + 1] - bx, rz1 = this.boltZ[base + step + 1] - bz;
                const reach = PLAYER_RADIUS + this.radii[bolt] + MARGIN;
                // A relative segment entirely outside one side of the body's bounds cannot contact it.
                // Keep equality for tangency and test both endpoints so crossings are never discarded.
                if (rx0 > reach && rx1 > reach || rx0 < -reach && rx1 < -reach
                    || rz0 > reach && rz1 > reach || rz0 < -reach && rz1 < -reach) continue;
                const radial = segmentCircleHit(rx0, rz0, rx1, rz1, 0, 0, reach);
                if (radial === Infinity) continue;
                const radius = this.radii[bolt];
                const groundA = wholeStart ? this.groundAt(step) : e.terrain.height(ax, az);
                const groundB = wholeEnd ? this.groundAt(step + 1) : e.terrain.height(bx, bz);
                const hit = segmentCylinderHit(this.boltX[base + step] - ax, this.boltY[base + step] - groundA, this.boltZ[base + step] - az,
                    this.boltX[base + step + 1] - bx, this.boltY[base + step + 1] - groundB, this.boltZ[base + step + 1] - bz,
                    0, 0, -radius, e.bodyHeight(e.player) + radius, PLAYER_RADIUS + radius + MARGIN);
                if (hit === Infinity) continue;
                risk += 1 / (.25 + from + (to - from) * hit);
                if (risk > limit) return risk;
                break;
            }
        }
        return risk;
    }

    private groundAt(step: number): number {
        return Number.isNaN(this.pathHeight[step]) ? this.pathHeight[step] = this.entities.terrain.height(this.pathX[step], this.pathZ[step]) : this.pathHeight[step];
    }
    private xAt(time: number): number { return this.at(this.pathX, time); }
    private zAt(time: number): number { return this.at(this.pathZ, time); }
    private at(path: Float64Array, time: number): number {
        const step = Math.min(STEPS - 1, Math.floor(time / STEP)), fraction = time / STEP - step;
        return path[step] + (path[step + 1] - path[step]) * fraction;
    }

    private enemyRisk(slot: number): number {
        const e = this.entities, p = e.position, a = e.action, kind = a.kind[slot], heading = p.heading[slot];
        const hit = (a.hitAt[slot] - this.tick) / HZ, sin = Math.sin(heading), cos = Math.cos(heading);
        if (kind === ActorAction.Melee) {
            if (a.committed[slot] || hit > HORIZON) return 0;
            const time = Math.max(0, hit), dx = this.xAt(time) - p.x[slot], dz = this.zAt(time) - p.z[slot], distance = Math.hypot(dx, dz);
            return distance <= a.reach[slot] + MARGIN && (distance === 0 || (dx * sin + dz * cos) / distance >= Math.cos(MELEE_HALF_ARC + .05))
                ? 2 / (.25 + time) : 0;
        }
        if (kind === ActorAction.Cast || kind === ActorAction.Volley || kind === ActorAction.Storm
            || (kind === ActorAction.Charge ? a.committed[slot] : a.committed[slot] & 2)) return 0;
        const rule = kind === ActorAction.Charge ? ENEMY_SPECIAL.charge : kind === ActorAction.Quake ? ENEMY_SPECIAL.quake
            : kind === ActorAction.Fault ? ENEMY_SPECIAL.fault : kind === ActorAction.Jaws ? ENEMY_SPECIAL.jaws : ENEMY_SPECIAL.reave;
        const duration = ticksForSeconds(rule.duration) / HZ, end = Math.min(HORIZON, hit + duration);
        const x = kind === ActorAction.Jaws ? a.targetX[slot] : p.x[slot], z = kind === ActorAction.Jaws ? a.targetZ[slot] : p.z[slot];
        for (let step = Math.max(0, Math.floor(hit / STEP)); step < STEPS && step * STEP <= end; step++) {
            const from = Math.max(0, hit, step * STEP), to = Math.min(end, (step + 1) * STEP);
            if (to < from) continue;
            const ax = this.xAt(from), az = this.zAt(from), bx = this.xAt(to), bz = this.zAt(to);
            const phase = (to - hit) / duration, before = (from - hit) / duration;
            let contact = false;
            if (kind === ActorAction.Charge) {
                const speed = ENEMY_SPECIAL.charge.speed * (this.tick < e.status.slowUntil[slot] ? e.status.slowScale[slot] : 1);
                const startTravel = Math.max(0, from - Math.max(0, hit)) * speed, endTravel = Math.max(0, to - Math.max(0, hit)) * speed;
                contact = segmentCircleHit(x + sin * startTravel - ax, z + cos * startTravel - az,
                    x + sin * endTravel - bx, z + cos * endTravel - bz, 0, 0, p.radius[slot] + PLAYER_RADIUS + MARGIN) !== Infinity;
            } else if (kind === ActorAction.Quake) {
                const first = Math.hypot(ax - x, az - z) - before * ENEMY_SPECIAL.quake.radius;
                const last = Math.hypot(bx - x, bz - z) - phase * ENEMY_SPECIAL.quake.radius;
                const width = ENEMY_SPECIAL.quake.width + PLAYER_RADIUS + MARGIN;
                contact = Math.min(first, last) <= width && Math.max(first, last) >= -width;
            } else {
                const width = (kind === ActorAction.Fault ? ENEMY_SPECIAL.fault.width : kind === ActorAction.Jaws ? ENEMY_SPECIAL.jaws.width : ENEMY_SPECIAL.reave.width) + PLAYER_RADIUS + MARGIN;
                for (let side = -1; side <= 1; side += 2) {
                    strikeSegment(this.blade, kind, x, z, heading, phase, side);
                    strikeSegment(this.beforeBlade, kind, x, z, heading, before, side);
                    if (kind === ActorAction.Fault) contact = segmentCircleHit(this.beforeBlade[0] - ax, this.beforeBlade[1] - az,
                        this.blade[0] - bx, this.blade[1] - bz, 0, 0, width) !== Infinity;
                    else if (kind === ActorAction.Jaws) contact = crossesCapsule(ax + this.blade[0] - this.beforeBlade[0], az + this.blade[1] - this.beforeBlade[1],
                        bx, bz, this.blade[0], this.blade[1], this.blade[2], this.blade[3], width);
                    else {
                        // Bound the rotating blade between samples, including its moving tip.
                        const padding = 2 * ENEMY_SPECIAL.reave.radius * Math.sin((phase - before) * ENEMY_SPECIAL.reave.halfArc / 2);
                        strikeSegment(this.blade, kind, x, z, heading, (phase + before) / 2);
                        contact = crossesCapsule(ax, az, bx, bz, this.blade[0], this.blade[1], this.blade[2], this.blade[3], width + padding);
                    }
                    if (contact || kind !== ActorAction.Jaws) break;
                }
            }
            if (contact) return 2 / (.25 + from);
        }
        return 0;
    }
}

import { ActorAction, Component, MoveIntent, type CombatWorld } from "./CombatWorld";
import { ENEMY_DEFINITIONS } from "./EnemyDefinitions";
import { ENTITY_CAPACITY, GAME_CONFIG, ticksPerUpdate } from "./GameConfig";

const CLAIMS = 48, DIRECTIONS = 12, NEIGHBORS = 8, INTERVAL = ticksPerUpdate(GAME_CONFIG.timing.activeAiHz);

/** Local steering plus body-sized reservations around the player; attacks never push other actors. */
export class EnemyCrowd {
    private readonly owners = new Float64Array(CLAIMS);
    private readonly offsetsX = new Float32Array(CLAIMS);
    private readonly offsetsZ = new Float32Array(CLAIMS);
    private readonly radii = new Float32Array(CLAIMS);
    private readonly rings = new Uint8Array(CLAIMS);
    private readonly claims = new Int8Array(ENTITY_CAPACITY).fill(-1);
    private readonly forceX = new Float32Array(ENTITY_CAPACITY);
    private readonly forceZ = new Float32Array(ENTITY_CAPACITY);
    private readonly neighbors = new Uint32Array(NEIGHBORS);
    private readonly distances = new Float64Array(NEIGHBORS);
    private admissions = 0;
    private vacancy = false;
    private playerX = 0;
    private playerZ = 0;
    public x = 0;
    public z = 0;

    constructor(private readonly entities: CombatWorld) {}

    public clear(slot: number): void {
        const claim = this.claims[slot];
        if (claim >= 0) { if (!this.rings[claim]) this.vacancy = true; this.owners[claim] = 0; }
        this.claims[slot] = -1; this.forceX[slot] = this.forceZ[slot] = 0;
    }

    public begin(): void {
        const { position: p, player, enemy: e, world } = this.entities;
        this.admissions = 4;
        if (this.vacancy) {
            this.vacancy = false;
            for (let i = 0; i < CLAIMS; i++) if (this.owners[i] && this.rings[i]) {
                const slot = world.resolve(this.owners[i]);
                if (slot >= 0) this.clear(slot);
            }
        }
        const changed = Math.hypot(p.x[player] - this.playerX, p.z[player] - this.playerZ) > .5;
        if (changed) { this.playerX = p.x[player]; this.playerZ = p.z[player]; }
        for (let i = 0; i < CLAIMS; i++) {
            if (!this.owners[i]) continue;
            const slot = world.resolve(this.owners[i]);
            if (slot < 0) { this.owners[i] = 0; continue; }
            if (!e.target[slot] || !e.active[slot] || Math.hypot(p.x[slot] - p.x[player], p.z[slot] - p.z[player]) > 6
                || changed && !this.entities.terrain.isClear(p.x[player] + this.offsetsX[i], p.z[player] + this.offsetsZ[i], p.radius[slot])) this.clear(slot);
        }
    }

    public canAttack(slot: number): boolean {
        const claim = this.claims[slot];
        if (claim < 0) return true;
        const { position: p, player } = this.entities;
        return Math.hypot(p.x[slot] - p.x[player] - this.offsetsX[claim], p.z[slot] - p.z[player] - this.offsetsZ[claim]) < .25;
    }

    public destination(slot: number): boolean {
        const { position: p, player, enemy: e } = this.entities;
        if (e.intent[slot] !== MoveIntent.Chase && e.intent[slot] !== MoveIntent.Flank) return false;
        const claim = this.claims[slot];
        if (claim < 0) return false;
        const ox = this.offsetsX[claim], oz = this.offsetsZ[claim], radius = Math.hypot(ox, oz);
        const dx = p.x[slot] - p.x[player], dz = p.z[slot] - p.z[player];
        const angle = Math.atan2(oz, ox), current = Math.atan2(dz, dx), delta = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
        // Walk around the player instead of cutting through the centre toward an opposite reservation.
        const turn = Math.hypot(dx, dz) < radius + .6 && Math.abs(delta) > .4 ? current + Math.sign(delta) * .4 : angle;
        this.x = p.x[player] + Math.cos(turn) * radius; this.z = p.z[player] + Math.sin(turn) * radius;
        return true;
    }

    public sense(slot: number, tick: number): void {
        const e = this.entities, p = e.position;
        if (!e.enemy.active[slot] || !e.enemy.target[slot]) { this.clear(slot); return; }
        if (tick % INTERVAL !== e.world.ids[slot] % INTERVAL) return;
        this.forceX[slot] = this.forceZ[slot] = 0;
        const nearby = e.queryNearby(Component.Enemy, p.x[slot], p.z[slot], p.radius[slot] + .35, true);
        let count = 0;
        this.distances.fill(Infinity);
        for (let i = 0; i < nearby.count; i++) {
            const other = nearby.slots[i];
            if (other === slot) continue;
            const distance = (p.x[slot] - p.x[other]) ** 2 + (p.z[slot] - p.z[other]) ** 2;
            let index = Math.min(count, NEIGHBORS - 1);
            if (distance > this.distances[index] || distance === this.distances[index] && e.world.ids[other] > e.world.ids[this.neighbors[index]]) continue;
            while (index > 0 && (distance < this.distances[index - 1]
                || distance === this.distances[index - 1] && e.world.ids[other] < e.world.ids[this.neighbors[index - 1]])) {
                this.distances[index] = this.distances[index - 1]; this.neighbors[index] = this.neighbors[index - 1]; index--;
            }
            this.distances[index] = distance; this.neighbors[index] = other; count = Math.min(NEIGHBORS, count + 1);
        }
        for (let i = 0; i < count; i++) {
            const other = this.neighbors[i], distance = Math.sqrt(this.distances[i]);
            const gap = p.radius[slot] + p.radius[other] + .1;
            if (distance >= gap) continue;
            const strength = Math.min(1.5, (gap - distance) / .25);
            // Exactly coincident actors use an antisymmetric direction, independent of query order.
            const angle = (Math.min(e.world.ids[slot], e.world.ids[other]) * 2.399963) % (Math.PI * 2);
            const sign = e.world.ids[slot] < e.world.ids[other] ? 1 : -1;
            this.forceX[slot] += strength * (distance > 1e-6 ? (p.x[slot] - p.x[other]) / distance : Math.cos(angle) * sign);
            this.forceZ[slot] += strength * (distance > 1e-6 ? (p.z[slot] - p.z[other]) / distance : Math.sin(angle) * sign);
        }
        if (!count || this.claims[slot] >= 0 || !this.admissions || ENEMY_DEFINITIONS[e.enemy.kind[slot]].ranged
            || e.action.kind[slot] >= ActorAction.Melee || Math.hypot(p.x[slot] - p.x[e.player], p.z[slot] - p.z[e.player]) > 4) return;
        this.admissions--;
        this.reserve(slot);
    }

    private reserve(slot: number): void {
        const index = this.owners.indexOf(0);
        if (index < 0) return;
        const { position: p, player, terrain, action, world } = this.entities;
        const bearing = Math.atan2(p.z[slot] - p.z[player], p.x[slot] - p.x[player]);
        for (let ring = 0; ring < 3; ring++) {
            const radius = action.reach[slot] * .9 + ring * (p.radius[slot] * 2 + .15);
            for (let attempt = 0; attempt < DIRECTIONS; attempt++) {
                const step = Math.ceil(attempt / 2) * (attempt % 2 ? 1 : -1);
                const angle = bearing + step * Math.PI * 2 / DIRECTIONS;
                const ox = Math.cos(angle) * radius, oz = Math.sin(angle) * radius;
                let free = true;
                for (let i = 0; i < CLAIMS; i++) if (this.owners[i]
                    && Math.hypot(ox - this.offsetsX[i], oz - this.offsetsZ[i]) < p.radius[slot] + this.radii[i] + .12) { free = false; break; }
                if (!free || !terrain.isClear(p.x[player] + ox, p.z[player] + oz, p.radius[slot])) continue;
                this.owners[index] = world.ids[slot]; this.offsetsX[index] = ox; this.offsetsZ[index] = oz;
                this.radii[index] = p.radius[slot]; this.rings[index] = ring; this.claims[slot] = index;
                return;
            }
        }
    }

    /** Add soft separation without exceeding ordinary speed; terrain remains the final authority. */
    public steer(slot: number, dx: number, dz: number, travel: number): void {
        this.x = dx + this.forceX[slot] * travel; this.z = dz + this.forceZ[slot] * travel;
        const length = Math.hypot(this.x, this.z);
        if (length > travel) { this.x *= travel / length; this.z *= travel / length; }
    }
}

import { ActorAction, MoveIntent, type CombatWorld } from "./CombatWorld";
import { ENTITY_CAPACITY, ticksForSeconds } from "./GameConfig";
import { LocalNavigationPath } from "./LocalNavigationPath";

const JOBS = 4, WAYPOINTS = 32, BLOCKED_TICKS = ticksForSeconds(.35), RETRY_TICKS = ticksForSeconds(2);
const MAX_SEARCH_TICKS = 96, LEG = 14;

/** One fair queue and four search buffers per world; no promises or per-enemy A* grids. */
export class EnemyNavigation {
    private readonly blocked = new Uint16Array(ENTITY_CAPACITY);
    private readonly retryAt = new Float64Array(ENTITY_CAPACITY);
    private readonly kind = new Uint8Array(ENTITY_CAPACITY);
    private readonly target = new Float64Array(ENTITY_CAPACITY);
    private readonly goalX = new Float64Array(ENTITY_CAPACITY);
    private readonly goalZ = new Float64Array(ENTITY_CAPACITY);
    private readonly count = new Uint8Array(ENTITY_CAPACITY);
    private readonly cursor = new Uint8Array(ENTITY_CAPACITY);
    private readonly routeX = new Float64Array(ENTITY_CAPACITY * WAYPOINTS);
    private readonly routeZ = new Float64Array(ENTITY_CAPACITY * WAYPOINTS);
    private readonly pending = new Uint8Array(ENTITY_CAPACITY);
    private readonly queued = new Uint8Array(ENTITY_CAPACITY);
    private queuedCount = 0;
    private readonly previousX = new Float64Array(ENTITY_CAPACITY);
    private readonly previousZ = new Float64Array(ENTITY_CAPACITY);
    private readonly jobs;
    private next = 0;
    public x = 0;
    public z = 0;

    constructor(private readonly entities: CombatWorld) {
        this.jobs = Array.from({ length: JOBS }, () => {
            const state = { owner: 0, age: 0 };
            const path = new LocalNavigationPath(entities.terrain, (x, z) => {
                const slot = entities.world.resolve(state.owner);
                if (slot < 0) return false;
                if (this.kind[slot] === MoveIntent.Return) {
                    const end = entities.terrain.move(x, z, this.goalX[slot] - x, this.goalZ[slot] - z, entities.position.radius[slot], false);
                    return Math.hypot(end.x - this.goalX[slot], end.z - this.goalZ[slot]) < 1e-5;
                }
                return entities.terrain.traceAttack(x, entities.terrain.height(x, z) + entities.bodyHeight(slot) * .5, z,
                    this.goalX[slot], entities.aimHeight(entities.player), this.goalZ[slot], .04) === Infinity;
            });
            return Object.assign(state, { path });
        });
    }

    public clear(slot: number): void {
        if (this.queued[slot]) { this.queued[slot] = 0; this.queuedCount--; }
        if (this.pending[slot]) for (const job of this.jobs) if (job.owner === this.entities.world.ids[slot]) { job.owner = 0; job.path.cancel(); }
        this.blocked[slot] = this.count[slot] = this.cursor[slot] = this.pending[slot] = this.kind[slot] = 0;
        this.retryAt[slot] = this.target[slot] = 0;
    }

    private valid(slot: number, tick: number): boolean {
        const { enemy: e, position: p, player, status, action } = this.entities;
        if (!status.canMove(slot, tick) || action.kind[slot] >= ActorAction.Melee || this.kind[slot] !== e.intent[slot]
            || this.target[slot] !== e.target[slot]) return false;
        if ((this.pending[slot] || this.count[slot]) && Math.hypot(p.x[slot] - this.previousX[slot], p.z[slot] - this.previousZ[slot]) > 1) return false;
        const x = e.intent[slot] === MoveIntent.Return ? e.homeX[slot] : p.x[player];
        const z = e.intent[slot] === MoveIntent.Return ? e.homeZ[slot] : p.z[player];
        return Math.hypot(x - this.goalX[slot], z - this.goalZ[slot]) <= 2;
    }

    public advance(tick: number): void {
        const { enemies, world, position: p } = this.entities;
        for (const job of this.jobs) {
            if (!job.owner) continue;
            const slot = world.resolve(job.owner);
            if (slot < 0) { job.owner = 0; job.path.cancel(); continue; }
            if (!this.valid(slot, tick)) { this.clear(slot); continue; }
            job.path.advance();
            if (job.path.status === "searching" && ++job.age < MAX_SEARCH_TICKS) continue;
            this.count[slot] = job.path.status === "ready" ? job.path.copyRoute(this.routeX, this.routeZ, slot * WAYPOINTS, WAYPOINTS) : 0;
            this.cursor[slot] = this.pending[slot] = this.blocked[slot] = 0;
            this.retryAt[slot] = tick + RETRY_TICKS;
            job.owner = 0; job.path.cancel();
        }
        // At most one admission per free buffer. Scan the dense population once, rotating even under saturation.
        let available = this.queuedCount ? this.jobs.findIndex(job => !job.owner) : -1;
        for (let checked = 0; checked < enemies.count && available >= 0; checked++) {
            const slot = enemies.slots[this.next++ % enemies.count];
            if (!this.queued[slot]) continue;
            if (!this.valid(slot, tick)) { this.clear(slot); continue; }
            const dx = this.goalX[slot] - p.x[slot], dz = this.goalZ[slot] - p.z[slot];
            const scale = Math.min(1, LEG / Math.max(.001, Math.hypot(dx, dz))), job = this.jobs[available];
            job.owner = world.ids[slot]; job.age = 0; this.pending[slot] = 1;
            this.queued[slot] = 0; this.queuedCount--;
            this.previousX[slot] = p.x[slot]; this.previousZ[slot] = p.z[slot];
            // A target standing near cover may have no conservative grid node at its centre.
            // Home endpoints require a clear final sweep; chase endpoints require in-range visibility.
            const arrival = scale < 1 ? 0 : this.kind[slot] === MoveIntent.Return ? 1 : Math.min(1.5, this.entities.action.reach[slot] * .9);
            job.path.begin(p.x[slot], p.z[slot], p.x[slot] + dx * scale, p.z[slot] + dz * scale, p.radius[slot], arrival);
            available = this.queuedCount ? this.jobs.findIndex(candidate => !candidate.owner) : -1;
        }
        if (enemies.count) this.next %= enemies.count;
    }

    /** 0: direct movement, 1: waypoint, 2: stationary while its start-anchored search runs. */
    public steer(slot: number, tick: number): number {
        if ((this.count[slot] || this.pending[slot]) && !this.valid(slot, tick)) this.clear(slot);
        if (this.pending[slot]) return 2;
        const p = this.entities.position;
        this.previousX[slot] = p.x[slot]; this.previousZ[slot] = p.z[slot];
        while (this.cursor[slot] < this.count[slot]) {
            const index = slot * WAYPOINTS + this.cursor[slot];
            this.x = this.routeX[index]; this.z = this.routeZ[index];
            if (Math.hypot(this.x - p.x[slot], this.z - p.z[slot]) > .04) return 1;
            this.cursor[slot]++;
        }
        this.count[slot] = this.cursor[slot] = 0;
        return 0;
    }

    public observe(slot: number, tick: number, expected: number, progress: number): void {
        const { enemy: e, position: p, player } = this.entities, intent = e.intent[slot];
        if (intent !== MoveIntent.Chase && intent !== MoveIntent.Flank && intent !== MoveIntent.Seek && intent !== MoveIntent.Return) return;
        if (expected < 1e-6) return;
        if (this.kind[slot] !== intent || this.target[slot] !== e.target[slot]) this.clear(slot);
        this.kind[slot] = intent; this.target[slot] = e.target[slot];
        if (!this.count[slot] && !this.pending[slot]) {
            this.goalX[slot] = intent === MoveIntent.Return ? e.homeX[slot] : p.x[player];
            this.goalZ[slot] = intent === MoveIntent.Return ? e.homeZ[slot] : p.z[player];
        }
        this.blocked[slot] = progress < expected * .3 ? Math.min(BLOCKED_TICKS, this.blocked[slot] + 1) : Math.max(0, this.blocked[slot] - 1);
        if (this.blocked[slot] === BLOCKED_TICKS && this.count[slot]) {
            this.count[slot] = this.cursor[slot] = 0; this.retryAt[slot] = tick;
        }
        if (this.blocked[slot] === BLOCKED_TICKS && !this.pending[slot] && !this.queued[slot] && tick >= this.retryAt[slot]) {
            this.queued[slot] = 1; this.queuedCount++;
        } else if (this.blocked[slot] < BLOCKED_TICKS && this.queued[slot]) { this.queued[slot] = 0; this.queuedCount--; }
    }
}

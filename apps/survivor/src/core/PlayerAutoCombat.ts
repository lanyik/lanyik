import { BehaviorStatus, BehaviorTree, type BehaviorNode } from "./BehaviorTree";
import { CombatWorld, Component } from "./CombatWorld";
import type { ChestRenderBuffer, MovementInput } from "./CombatState";
import type { DerivedStats } from "./CombatStats";
import { PLAYER_RADIUS, ticksForSeconds, ticksPerUpdate } from "./GameConfig";
import { AutoCombatPath } from "./AutoCombatPath";
import { AutoCombatThreats } from "./AutoCombatThreats";

export type AutoCombatActivity = "off" | "manual" | "evade" | "fight" | "chest" | "seek" | "idle";
const DECISION_TICKS = ticksPerUpdate(10), SEARCH_RADIUS = 16, CHEST_RADIUS = 6;
const MANUAL_GRACE = ticksForSeconds(.35), DODGE_DURATION = ticksForSeconds(.4), DODGE_COOLDOWN = ticksForSeconds(1.8);
const REACTION_TICKS = ticksForSeconds(.15), BLOCKED_TICKS = ticksForSeconds(1.5);
const branch = (test: (c: PlayerAutoCombat) => boolean, tick: (c: PlayerAutoCombat) => void): BehaviorNode<PlayerAutoCombat> => ({
    type: "sequence", children: [{ type: "condition", test }, { type: "action", tick: c => { tick(c); return BehaviorStatus.Running; }, halt: () => {} }]
});

/** Player-owned intent only: movement, medicine and attacks still commit through normal simulation systems. */
export class PlayerAutoCombat {
    private static readonly tree = new BehaviorTree<PlayerAutoCombat>({ type: "selector", children: [
        branch(c => c.tick < c.manualUntil, c => c.stop("manual")),
        branch(c => c.chooseDodge(), c => c.evade()),
        branch(c => c.enemySlot >= 0 && (c.engaged || c.inRange()), c => { c.engaged = true; c.fight(); }),
        branch(c => c.chooseChest(), c => c.approach("chest", c.chestX, c.chestZ, .65)),
        branch(c => c.enemySlot >= 0, c => c.fight()),
        branch(() => true, c => c.stop("idle"))
    ] });
    private readonly running = new Int16Array(1).fill(-1);
    private readonly movement = { x: 0, z: 0, active: false };
    private readonly path: AutoCombatPath;
    private readonly threats: AutoCombatThreats;
    private readonly rejectedX = new Float64Array(8);
    private readonly rejectedZ = new Float64Array(8);
    private readonly rejectedUntil = new Float64Array(8);
    private rejectionCursor = 0;
    private target = 0;
    private enemySlot = -1;
    private engaged = false;
    private chestX = 0;
    private chestZ = 0;
    private goalX = 0;
    private goalZ = 0;
    private plannedX = 0;
    private plannedZ = 0;
    private arrival = 0;
    private nextDecision = 0;
    private nextPlan = 0;
    private manualUntil = 0;
    private dangerSince = -1;
    private dodgeUntil = 0;
    private dodgeReadyAt = 0;
    private dodgeX = 0;
    private dodgeZ = 0;
    private progressX = 0;
    private progressZ = 0;
    private progressAt = 0;
    private tick = 0;
    private stats!: DerivedStats;
    private enabledValue = false;
    private activityValue: AutoCombatActivity = "off";

    constructor(private readonly entities: CombatWorld, private readonly chests: ChestRenderBuffer, private readonly heal: () => void) {
        this.path = new AutoCombatPath(entities.terrain); this.threats = new AutoCombatThreats(entities);
    }
    public get enabled(): boolean { return this.enabledValue; }
    public get activity(): AutoCombatActivity { return this.activityValue; }
    private get x(): number { return this.entities.position.x[this.entities.player]; }
    private get z(): number { return this.entities.position.z[this.entities.player]; }

    public setEnabled(enabled: boolean): void {
        PlayerAutoCombat.tree.halt(this, 0, this.running);
        this.enabledValue = enabled; this.target = 0; this.enemySlot = -1; this.engaged = false;
        this.nextDecision = this.manualUntil = this.dodgeUntil = this.dodgeReadyAt = 0; this.dangerSince = -1;
        this.rejectedUntil.fill(0); this.stop(enabled ? "idle" : "off");
    }

    public update(input: MovementInput, tick: number, stats: DerivedStats): MovementInput {
        if (!this.enabledValue) return input;
        this.tick = tick; this.stats = stats;
        if (input.active) {
            if (this.activityValue !== "manual") this.nextDecision = 0;
            this.manualUntil = tick + MANUAL_GRACE;
            this.dodgeUntil = 0; this.dangerSince = -1;
            this.target = 0; this.engaged = false; this.stop("manual");
        }
        if (tick >= this.nextDecision) {
            this.nextDecision = tick + DECISION_TICKS;
            if (this.entities.vitals.health[this.entities.player] <= stats.maxHealth * .4) this.heal();
            if (tick >= this.manualUntil) {
                this.findEnemy(); this.threats.sense(this.x, this.z);
            }
            PlayerAutoCombat.tree.tick(this, 0, this.running);
        }
        if (input.active) return input;
        if (tick < this.manualUntil) return this.movement;
        if (this.activityValue === "evade") {
            if (tick >= this.dodgeUntil) { this.stop("idle"); this.nextDecision = 0; }
            return this.movement;
        }
        if (this.activityValue === "chest" || this.activityValue === "seek") this.followPath();
        return this.movement;
    }

    private stop(activity: AutoCombatActivity): void {
        this.activityValue = activity; this.movement.x = this.movement.z = 0; this.movement.active = false;
        this.path.cancel(); this.nextPlan = 0;
    }

    private rejected(x: number, z: number): boolean {
        for (let i = 0; i < this.rejectedUntil.length; i++) {
            if (this.tick < this.rejectedUntil[i] && Math.hypot(x - this.rejectedX[i], z - this.rejectedZ[i]) < 1) return true;
        }
        return false;
    }
    private abandon(): void {
        const i = this.rejectionCursor++ % this.rejectedUntil.length;
        this.rejectedX[i] = this.goalX; this.rejectedZ[i] = this.goalZ; this.rejectedUntil[i] = this.tick + ticksForSeconds(8);
        this.target = 0; this.engaged = false; this.stop("idle"); this.nextDecision = this.tick + DECISION_TICKS;
    }

    private findEnemy(): void {
        const e = this.entities, p = e.position;
        this.enemySlot = e.world.resolve(this.target);
        if (this.engaged && this.enemySlot >= 0
            && Math.hypot(p.x[this.enemySlot] - this.x, p.z[this.enemySlot] - this.z) <= SEARCH_RADIUS
            && !this.rejected(p.x[this.enemySlot], p.z[this.enemySlot])) return;
        this.target = 0; this.enemySlot = -1; this.engaged = false;
        const nearby = e.queryNearby(Component.Enemy, this.x, this.z, SEARCH_RADIUS);
        let nearest = SEARCH_RADIUS ** 2;
        for (let i = 0; i < nearby.count; i++) {
            const slot = nearby.slots[i], id = e.world.ids[slot], distance = (p.x[slot] - this.x) ** 2 + (p.z[slot] - this.z) ** 2;
            if ((distance < nearest || (distance === nearest && (!this.target || id < this.target))) && !this.rejected(p.x[slot], p.z[slot])) {
                nearest = distance; this.target = id; this.enemySlot = slot;
            }
        }
    }
    private inRange(): boolean {
        const e = this.entities;
        return Math.hypot(e.position.x[this.enemySlot] - this.x, e.position.z[this.enemySlot] - this.z) <= this.stats.attackRange * .85
            && e.canSee(e.player, this.enemySlot, .11);
    }
    private fight(): void {
        if (this.inRange()) this.stop("fight");
        else this.approach("seek", this.entities.position.x[this.enemySlot], this.entities.position.z[this.enemySlot], .35);
    }
    private chooseChest(): boolean {
        if (this.activityValue === "chest" && Math.hypot(this.chestX - this.x, this.chestZ - this.z) <= 8 && !this.rejected(this.chestX, this.chestZ)) {
            for (let i = 0; i < this.chests.count; i++) if (this.chests.x[i] === this.chestX && this.chests.z[i] === this.chestZ) return true;
        }
        let nearest = CHEST_RADIUS ** 2, found = false;
        for (let i = 0; i < this.chests.count; i++) {
            const x = this.chests.x[i], z = this.chests.z[i], distance = (x - this.x) ** 2 + (z - this.z) ** 2;
            if ((distance < nearest || (distance === nearest && (!found || x < this.chestX || (x === this.chestX && z < this.chestZ)))) && !this.rejected(x, z)) {
                nearest = distance; this.chestX = x; this.chestZ = z; found = true;
            }
        }
        return found;
    }

    private approach(activity: "chest" | "seek", x: number, z: number, arrival: number): void {
        const changed = activity !== this.activityValue || Math.hypot(x - this.plannedX, z - this.plannedZ) > 1;
        this.activityValue = activity; this.goalX = x; this.goalZ = z; this.arrival = arrival;
        if (changed) { this.path.cancel(); this.nextPlan = 0; this.progressAt = this.tick; this.progressX = this.x; this.progressZ = this.z; }
        if (this.tick < this.nextPlan || this.path.status === "searching") return;
        this.nextPlan = this.tick + ticksForSeconds(.75);
        this.plannedX = x; this.plannedZ = z;
        const moved = this.entities.terrain.move(this.x, this.z, x - this.x, z - this.z, PLAYER_RADIUS, false);
        if (Math.hypot(moved.x - x, moved.z - z) < 1e-5) this.path.cancel();
        else if (this.path.status !== "ready") this.path.begin(this.x, this.z, x, z);
    }

    private followPath(): void {
        this.path.advance();
        if (this.path.status === "failed") { this.abandon(); return; }
        if (Math.hypot(this.x - this.progressX, this.z - this.progressZ) > .2) {
            this.progressAt = this.tick; this.progressX = this.x; this.progressZ = this.z;
        } else if (this.tick - this.progressAt >= BLOCKED_TICKS && this.path.status !== "searching") { this.abandon(); return; }
        if (this.path.status === "searching") { this.movement.active = false; this.movement.x = this.movement.z = 0; return; }
        let x = this.goalX, z = this.goalZ;
        const waypoint = this.path.waypoint(this.x, this.z);
        if (waypoint) { x = this.path.x; z = this.path.z; }
        const dx = x - this.x, dz = z - this.z, distance = Math.hypot(dx, dz);
        this.movement.active = distance > (waypoint ? .08 : this.arrival);
        // Slow at waypoints so smoothing cannot orbit a corner indefinitely.
        const scale = this.movement.active ? Math.min(1, distance * 6 / this.stats.moveSpeed) / distance : 0;
        this.movement.x = dx * scale; this.movement.z = dz * scale;
    }

    private chooseDodge(): boolean {
        if (this.tick < this.dodgeUntil) return true;
        const danger = this.threats.risk(this.x, this.z, this.tick, .5);
        if (!danger) { this.dangerSince = -1; return false; }
        if (this.dangerSince < 0) this.dangerSince = this.tick;
        if (this.tick < this.dodgeReadyAt || this.tick - this.dangerSince < REACTION_TICKS) return false;
        const travel = Math.min(1.5, this.stats.moveSpeed * .35);
        let best = danger * 2, found = false;
        for (let direction = 0; direction < 8; direction++) {
            const angle = direction * Math.PI / 4, dx = Math.sin(angle) * travel, dz = Math.cos(angle) * travel;
            const moved = this.entities.terrain.move(this.x, this.z, dx, dz, PLAYER_RADIUS, false);
            if (Math.hypot(moved.x - this.x - dx, moved.z - this.z - dz) > 1e-5) continue;
            const score = this.threats.risk(this.x + dx * .5, this.z + dz * .5, this.tick, .25)
                + this.threats.risk(this.x + dx, this.z + dz, this.tick, .5);
            if (score >= best) continue;
            best = score; found = true; this.dodgeX = dx / travel; this.dodgeZ = dz / travel;
        }
        if (found) { this.dodgeUntil = this.tick + DODGE_DURATION; this.dodgeReadyAt = this.tick + DODGE_COOLDOWN; }
        return found;
    }
    private evade(): void {
        this.stop("evade"); this.movement.active = true;
        const scale = Math.min(1, 1.5 / (this.stats.moveSpeed * .4));
        this.movement.x = this.dodgeX * scale; this.movement.z = this.dodgeZ * scale;
    }
}

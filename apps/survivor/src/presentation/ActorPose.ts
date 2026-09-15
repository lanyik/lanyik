import { ActorAction } from "../core/CombatWorld";

const MOVEMENT_POSES = 8;
export const IDLE_POSES = 4;
export const HERO_POSES = MOVEMENT_POSES + IDLE_POSES;
export const ACTOR_POSES = MOVEMENT_POSES * 2 + IDLE_POSES;

/** Idle and movement loop; attacks include both endpoints and never wrap back to windup. */
export function writeActorPose(weights: number[], cyclePhase: number, action: ActorAction, progress: number): void {
    weights.fill(0);
    const idle = action === ActorAction.Idle;
    const attacking = action >= ActorAction.Melee;
    const count = idle ? IDLE_POSES : MOVEMENT_POSES;
    const frame = attacking ? Math.max(0, Math.min(1, progress)) * (count - 1)
        : ((cyclePhase % 1) + 1) % 1 * count;
    const current = Math.floor(frame), fraction = frame - current;
    const next = attacking ? Math.min(count - 1, current + 1) : (current + 1) % count;
    const offset = idle ? weights.length - IDLE_POSES : attacking ? MOVEMENT_POSES : 0;
    weights[offset + current] += 1 - fraction;
    weights[offset + next] += fraction;
}

/** Slot-indexed fixed storage; entity generations prevent a recycled slot inheriting a pose. */
export class ActorPoseMixer {
    private readonly ids: Float64Array;
    private readonly actions: Uint8Array;
    private readonly starts: Float64Array;
    private readonly previous: Float32Array;
    private readonly from: Float32Array;
    constructor(capacity: number) {
        this.ids = new Float64Array(capacity); this.actions = new Uint8Array(capacity);
        this.starts = new Float64Array(capacity); this.previous = new Float32Array(capacity * ACTOR_POSES);
        this.from = new Float32Array(capacity * ACTOR_POSES);
    }
    public reset(): void { this.ids.fill(0); }
    public get buffers(): readonly ArrayBufferView[] { return [this.ids, this.actions, this.starts, this.previous, this.from]; }
    public write(output: number[], slot: number, id: number, seconds: number, phase: number, action: ActorAction, progress: number): void {
        const offset = slot * ACTOR_POSES, fresh = this.ids[slot] !== id;
        if (fresh) { this.ids[slot] = id; this.actions[slot] = action; this.starts[slot] = seconds - 1; }
        else if (this.actions[slot] !== action) {
            this.actions[slot] = action; this.starts[slot] = seconds;
            for (let i = 0; i < output.length; i++) this.from[offset + i] = this.previous[offset + i];
        }
        writeActorPose(output, phase, action, progress);
        const t = Math.max(0, Math.min(1, (seconds - this.starts[slot]) / .14)), blend = t * t * (3 - 2 * t);
        for (let i = 0; i < output.length; i++) {
            if (!fresh && blend < 1) output[i] = this.from[offset + i] * (1 - blend) + output[i] * blend;
            this.previous[offset + i] = output[i];
        }
    }
}

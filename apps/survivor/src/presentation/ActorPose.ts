import { ActorAction } from "../core/CombatWorld";

export const MOVEMENT_POSES = 8;
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

import { ActorAction } from "../core/CombatWorld";

export const MOVEMENT_POSES = 8;
export const ACTOR_POSES = 16;

/** Movement loops; attacks include both endpoints and must never wrap back to windup. */
export function writeActorPose(weights: number[], movementPhase: number, action: ActorAction, progress: number): void {
    weights.fill(0);
    if (action === ActorAction.Idle) return;
    const attacking = action >= ActorAction.Melee;
    const frame = attacking ? Math.max(0, Math.min(1, progress)) * (MOVEMENT_POSES - 1)
        : ((movementPhase % 1) + 1) % 1 * MOVEMENT_POSES;
    const current = Math.floor(frame), fraction = frame - current;
    const next = attacking ? Math.min(MOVEMENT_POSES - 1, current + 1) : (current + 1) % MOVEMENT_POSES;
    const offset = attacking ? MOVEMENT_POSES : 0;
    weights[offset + current] += 1 - fraction;
    weights[offset + next] += fraction;
}

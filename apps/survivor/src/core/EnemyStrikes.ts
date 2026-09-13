import { ActorAction } from "./CombatWorld";
import { ENEMY_SPECIAL } from "./EnemyDefinitions";
import { segmentCircleHit } from "./ProjectileBatch";

/** Shared by the authoritative sweep and the visible teeth/stone front. No frame allocations. */
export function strikeSegment(out: Float64Array, kind: ActorAction, x: number, z: number, heading: number, phase: number, side = 1): void {
    if (kind === ActorAction.Reave) {
        const angle = heading + (phase * 2 - 1) * ENEMY_SPECIAL.reave.halfArc;
        out[0] = x + Math.sin(angle) * .65; out[1] = z + Math.cos(angle) * .65;
        out[2] = x + Math.sin(angle) * ENEMY_SPECIAL.reave.radius; out[3] = z + Math.cos(angle) * ENEMY_SPECIAL.reave.radius;
    } else if (kind === ActorAction.Fault) {
        out[0] = out[2] = x + Math.sin(heading) * phase * ENEMY_SPECIAL.fault.length;
        out[1] = out[3] = z + Math.cos(heading) * phase * ENEMY_SPECIAL.fault.length;
    } else {
        const gap = side * ENEMY_SPECIAL.jaws.halfGap * (1 - phase), length = ENEMY_SPECIAL.jaws.halfLength;
        const cx = x + Math.cos(heading) * gap, cz = z - Math.sin(heading) * gap;
        out[0] = cx - Math.sin(heading) * length; out[1] = cz - Math.cos(heading) * length;
        out[2] = cx + Math.sin(heading) * length; out[3] = cz + Math.cos(heading) * length;
    }
}

/** Segment versus a capsule, including circular end caps and start-inside cases. */
export function crossesCapsule(sx: number, sz: number, ex: number, ez: number, ax: number, az: number, bx: number, bz: number, radius: number): boolean {
    if (segmentCircleHit(sx, sz, ex, ez, ax, az, radius) !== Infinity || segmentCircleHit(sx, sz, ex, ez, bx, bz, radius) !== Infinity) return true;
    const length = Math.hypot(bx - ax, bz - az);
    if (length === 0) return false;
    const ux = (bx - ax) / length, uz = (bz - az) / length;
    const startU = (sx - ax) * ux + (sz - az) * uz, startV = (sz - az) * ux - (sx - ax) * uz;
    const du = (ex - sx) * ux + (ez - sz) * uz, dv = (ez - sz) * ux - (ex - sx) * uz;
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 2; axis++) {
        const start = axis ? startV : startU, delta = axis ? dv : du, min = axis ? -radius : 0, max = axis ? radius : length;
        if (Math.abs(delta) < 1e-12) { if (start < min || start > max) return false; }
        else { const a = (min - start) / delta, b = (max - start) / delta; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
    }
    return enter <= leave;
}

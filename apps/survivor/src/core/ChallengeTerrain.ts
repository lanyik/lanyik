import type { CombatTerrain } from "./CombatTerrain";
import { SurfaceMotion, type SurfaceContact } from "./SurfaceMotion";
import { segmentCylinderHit } from "./AttackGeometry";
import { CHALLENGE_ARENA } from "./BossChallenge";
import { CHALLENGE_SCENERY, challengeBank } from "./ChallengeLayout";

const SOLIDS = Object.freeze([
    ...CHALLENGE_SCENERY.props.filter(prop => prop.solid),
    ...CHALLENGE_SCENERY.trees.map(tree => ({ x: tree.x, z: tree.z, radius: .2 * tree.scale, height: 2.5 * tree.scale }))
]);

/** Shared finite layout: swept movement, spawn/teleport checks and solid attack cover. */
export class ChallengeTerrain implements CombatTerrain {
    private readonly motion = new SurfaceMotion((x, z, radius) => this.contact(x, z, radius));
    private readonly hit: SurfaceContact = { x: 0, z: 0, round: true };
    public height(): number { return 0; }
    public traceAttack(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, radius: number): number {
        let first = Infinity;
        const ground = sy <= radius ? 0 : ey <= radius ? (sy - radius) / (sy - ey) : Infinity;
        if (ground !== Infinity && sx + (ex - sx) * ground >= challengeBank(sz + (ez - sz) * ground)) first = ground;
        for (const solid of SOLIDS) {
            const reach = solid.radius + radius;
            if (solid.x < Math.min(sx, ex) - reach || solid.x > Math.max(sx, ex) + reach
                || solid.z < Math.min(sz, ez) - reach || solid.z > Math.max(sz, ez) + reach) continue;
            first = Math.min(first, segmentCylinderHit(sx, sy, sz, ex, ey, ez, solid.x, solid.z, -radius, solid.height + radius, reach));
        }
        return first;
    }
    public isClear(x: number, z: number, radius: number): boolean { return !this.contact(x, z, radius); }
    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean) { return this.motion.move(x, z, dx, dz, radius, slide); }
    public dispose(): void {}
    private contact(x: number, z: number, radius: number): SurfaceContact | undefined {
        const dx = x - CHALLENGE_ARENA.x, dz = z - CHALLENGE_ARENA.z, distance = Math.hypot(dx, dz);
        if (distance + radius > CHALLENGE_ARENA.radius) {
            this.hit.x = -dx / distance; this.hit.z = -dz / distance; return this.hit;
        }
        const bank = challengeBank(z);
        if (x < bank + 1.2 + radius) {
            const slope = -(bank - 8.5) * (z - 41) / 18, length = Math.hypot(1, slope);
            this.hit.x = 1 / length; this.hit.z = -slope / length; return this.hit;
        }
        for (const solid of SOLIDS) {
            const ox = x - solid.x, oz = z - solid.z, reach = radius + solid.radius;
            if (ox * ox + oz * oz >= reach * reach) continue;
            const length = Math.hypot(ox, oz);
            this.hit.x = length ? ox / length : 1; this.hit.z = length ? oz / length : 0; return this.hit;
        }
        return undefined;
    }
}

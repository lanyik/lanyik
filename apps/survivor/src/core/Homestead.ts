import type { CombatTerrain } from "./CombatTerrain";
import { SurfaceMotion, type SurfaceContact } from "./SurfaceMotion";
import { HOMESTEAD_MODELS } from "./HomesteadModels.generated";
import type { ChallengeId } from "./BossChallenge";

export type WorldLocation = "wilds" | "homestead" | ChallengeId;
export const HOMESTEAD = Object.freeze({ width: 64, height: 64,
    spawn: Object.freeze({ x: 48, z: 32.5 * Math.sqrt(3) }),
    minX: 1.5, maxX: 93, minZ: Math.sqrt(3), maxZ: 62 * Math.sqrt(3),
    buildings: Object.freeze([
        Object.freeze({ model: "Inn" as const, x: 48, z: 44, ...HOMESTEAD_MODELS.Inn }),
        Object.freeze({ model: "House_1" as const, x: 35, z: 53, ...HOMESTEAD_MODELS.House_1 }),
        Object.freeze({ model: "Blacksmith" as const, x: 61, z: 51, ...HOMESTEAD_MODELS.Blacksmith }),
        Object.freeze({ model: "Well" as const, x: 53, z: 59, ...HOMESTEAD_MODELS.Well })
    ]) });

/** Flat, enclosed safe grounds. Gameplay bounds sit one tile inside the finite map's jagged shoreline. */
export class HomesteadTerrain implements CombatTerrain {
    private readonly motion = new SurfaceMotion((x, z, radius) => this.contact(x, z, radius));
    public height(): number { return 0; }
    public traceAttack(): number { return Infinity; }
    public isClear(x: number, z: number, radius: number): boolean {
        return !this.contact(x, z, radius);
    }
    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean): { x: number; z: number } {
        return this.motion.move(x, z, dx, dz, radius, slide);
    }
    public dispose(): void {}
    private contact(x: number, z: number, radius: number): SurfaceContact | undefined {
        if (x - radius < HOMESTEAD.minX) return { x: 1, z: 0, round: false };
        if (x + radius > HOMESTEAD.maxX) return { x: -1, z: 0, round: false };
        if (z - radius < HOMESTEAD.minZ) return { x: 0, z: 1, round: false };
        if (z + radius > HOMESTEAD.maxZ) return { x: 0, z: -1, round: false };
        for (const building of HOMESTEAD.buildings) {
            const dx = x - building.x, dz = z - building.z;
            const ax = Math.abs(dx) - building.width / 2, az = Math.abs(dz) - building.depth / 2;
            if (Math.hypot(Math.max(0, ax), Math.max(0, az)) > radius) continue;
            return ax > az ? { x: Math.sign(dx) || 1, z: 0, round: false } : { x: 0, z: Math.sign(dz) || 1, round: false };
        }
        return undefined;
    }
}

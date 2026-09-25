import { EnemyKind, enemyName } from "./EnemyDefinitions";
import type { ItemDefinition } from "./ItemDefinition";
import type { InventoryItem } from "./InventoryItem";
import type { CombatTerrain } from "./CombatTerrain";
import { SurfaceMotion } from "./SurfaceMotion";
import type { RegionInfo, RegionalSpawn } from "./RegionalWorld";

export const CHALLENGES = Object.freeze({
    "rift-lord": Object.freeze({ name: "裂爪巢穴", boss: EnemyKind.Caster, color: "#cf87de", members: [EnemyKind.Scout, EnemyKind.Grunt, EnemyKind.Caster] }),
    "stone-sovereign": Object.freeze({ name: "断层王庭", boss: EnemyKind.StoneSovereign, color: "#a4c8ee", members: [EnemyKind.Guard, EnemyKind.Grunt, EnemyKind.Healer] }),
    "storm-oracle": Object.freeze({ name: "风暴祭坛", boss: EnemyKind.StormOracle, color: "#b8a1ff", members: [EnemyKind.Caster, EnemyKind.Guard, EnemyKind.Healer] }),
    "ember-champion": Object.freeze({ name: "烬刃斗场", boss: EnemyKind.EmberChampion, color: "#ffb575", members: [EnemyKind.Charger, EnemyKind.Grunt, EnemyKind.Caster] })
});
export type ChallengeId = keyof typeof CHALLENGES;
export const CHALLENGE_IDS = Object.freeze(Object.keys(CHALLENGES) as ChallengeId[]);
export const isChallenge = (value: string): value is ChallengeId => Object.hasOwn(CHALLENGES, value);
export const CHALLENGE_ARENA = Object.freeze({ width: 40, height: 36, x: 30, z: 18.5 * Math.sqrt(3), radius: 24,
    population: 61, normalStrength: 1.3, bossStrength: 1.5, experience: 3 });
export const CHALLENGE_SPAWN = Object.freeze({ x: CHALLENGE_ARENA.x, z: CHALLENGE_ARENA.z + 20 });
export interface ChallengeScroll extends ItemDefinition<"scroll", ChallengeId> { readonly rarity: "rainbow" }
export function createChallengeScroll(id: number, value: ChallengeId, size = 1): ChallengeScroll {
    if (!isChallenge(value) || !Number.isSafeInteger(size) || size < 1 || size > 99) throw new RangeError("Invalid challenge scroll");
    return Object.freeze({ id, type: "scroll", value, size, rarity: "rainbow", name: `${CHALLENGES[value].name}传送卷轴` });
}
interface ChallengeEnemy { readonly x: number; readonly z: number; readonly health: number }
export interface ChallengeProgress {
    readonly level: number;
    readonly round: number;
    readonly position: Readonly<{ x: number; z: number }>;
    /** Stable spawn order; zero health is an irreversible defeat. */
    readonly enemies: readonly ChallengeEnemy[];
    readonly claimed: boolean;
    readonly loot: readonly { readonly x: number; readonly z: number; readonly item: InventoryItem }[];
    readonly experience: readonly { readonly x: number; readonly z: number; readonly value: number }[];
}
export type ChallengeProgressMap = Readonly<Partial<Record<ChallengeId, ChallengeProgress>>>;
export interface ChallengeSummary { readonly level: number; readonly round: number; readonly remaining: number; readonly claimed: boolean; readonly position: Readonly<{ x: number; z: number }> }
export function challengeRegion(level: number): RegionInfo {
    return { x: 0, z: 0, ring: 0, difficulty: "horror", level, bandMin: level, bandMax: level, centerX: CHALLENGE_ARENA.x, centerZ: CHALLENGE_ARENA.z };
}
export function challengeSpawns(id: ChallengeId, level: number): readonly RegionalSpawn[] {
    const rule = CHALLENGES[id], region = challengeRegion(level), { x, z } = CHALLENGE_ARENA;
    const result: RegionalSpawn[] = [{ x, z: z - 5, region, level, kind: rule.boss, elite: true, boss: true }];
    for (let camp = 0; camp < 6; camp++) {
        const angle = (camp + .5) * Math.PI / 3, cx = x + Math.sin(angle) * 15, cz = z + Math.cos(angle) * 15;
        for (let index = 0; index < 10; index++) {
            const a = index * 2.399963, radius = 1 + Math.sqrt(index) * .8;
            result.push({ x: cx + Math.sin(a) * radius, z: cz + Math.cos(a) * radius, region, level,
                kind: rule.members[index % rule.members.length], elite: index % 3 === 0, boss: false });
        }
    }
    return result;
}
export const challengeBossName = (id: ChallengeId): string => enemyName(CHALLENGES[id].boss, true);

/** Fixed circle shared with the map and fog wall. Swept motion also contains dashes and charges. */
export class ChallengeTerrain implements CombatTerrain {
    private readonly motion = new SurfaceMotion((x, z, radius) => {
        const dx = x - CHALLENGE_ARENA.x, dz = z - CHALLENGE_ARENA.z, distance = Math.hypot(dx, dz);
        return distance + radius > CHALLENGE_ARENA.radius ? { x: -dx / distance, z: -dz / distance, round: true } : undefined;
    });
    public height(): number { return 0; }
    public traceAttack(): number { return Infinity; }
    public isClear(x: number, z: number, radius: number): boolean { return Math.hypot(x - CHALLENGE_ARENA.x, z - CHALLENGE_ARENA.z) + radius <= CHALLENGE_ARENA.radius; }
    public move(x: number, z: number, dx: number, dz: number, radius: number, slide: boolean) { return this.motion.move(x, z, dx, dz, radius, slide); }
    public dispose(): void {}
}

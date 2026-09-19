import type { CombatWorld } from "./CombatWorld";
import type { CombatEvents } from "./CombatEvents";
import { DeterministicRandom } from "./DeterministicRandom";
import { ENEMY_DEFINITIONS } from "./EnemyDefinitions";
import { generateEquipment } from "./Equipment";
import { generateConsumable, type InventoryItem } from "./InventoryItem";
import { generateOrb } from "./Orbs";
import type { LootProfile } from "./Loot";
import type { SpiritRealm } from "./SpiritRealm";
import { MAX_GROUND_EQUIPMENT } from "./GameConfig";
import { CHALLENGE_IDS, createChallengeScroll } from "./BossChallenge";

/** Session economy and ground rewards; consumes defeat facts after the actor is removed. */
export class CombatRewards {
    public kills = 0;
    public gold = 0;
    public nextItemId = 2;
    public readonly groundItems = new Map<number, InventoryItem>();
    constructor(private readonly e: CombatWorld, public spiritRealm: SpiritRealm, private readonly seed: string | number = "loot") {}

    public grant(events: CombatEvents, i: number, random: DeterministicRandom, goldMultiplier: number, profile: LootProfile, experienceMultiplier = 1): void {
        const x = events.x[i], z = events.z[i], level = events.level[i], elite = events.elite[i] !== 0, boss = events.boss[i] !== 0;
        this.kills++;
        this.spiritRealm = Object.freeze({ ...this.spiritRealm, souls: this.spiritRealm.souls + 1, revision: this.spiritRealm.revision + 1 });
        this.gold += Math.round((boss ? 120 : elite ? 12 : 2) * level * goldMultiplier);
        this.e.spawnExperience(x, z, ENEMY_DEFINITIONS[events.enemyKind[i]].experience * (1 + (level - 1) * .15) * (boss ? 15 : elite ? 2 : 1) * experienceMultiplier);
        if (boss && this.e.loot.count < MAX_GROUND_EQUIPMENT) this.drop(generateOrb(random, this.nextItemId++, "rare"), x, z);
        const chance = boss ? 1 : elite ? profile.eliteDropChance : profile.normalDropChance;
        if (this.e.loot.count < MAX_GROUND_EQUIPMENT && random.chance(chance)) this.drop(generateEquipment(random, this.nextItemId++, level, profile, boss ? "legendary" : "common"), x, z);
        if (this.e.loot.count < MAX_GROUND_EQUIPMENT && random.chance(.14)) this.drop(generateConsumable(random, this.nextItemId++, boss ? "legendary" : elite ? "magic" : "common"), x, z);
        const scroll = new DeterministicRandom(`${this.seed}:scroll:${this.kills}`);
        if (this.e.loot.count < MAX_GROUND_EQUIPMENT && scroll.chance(profile.qualities[5])) this.drop(createChallengeScroll(this.nextItemId++, scroll.pick(CHALLENGE_IDS)), x, z);
    }

    public drop(item: InventoryItem, x: number, z: number): void {
        this.e.spawnLoot(item, x, z);
        this.groundItems.set(item.id, item);
    }
}

import type { Attributes, EquippedItems, EquipmentBonuses } from "./Equipment";
import type { CharacterClassId } from "./CharacterClass";
import type { DerivedStats } from "./CombatStats";
import type { LootProfile } from "./Loot";
import type { Orb } from "./Orbs";
import type { InventoryItem } from "./InventoryItem";
import type { RegionInfo } from "./RegionalWorld";
import type { CombatWorld } from "./CombatWorld";
import type { EntityQuery } from "./EntityWorld";
import type { SkillSnapshot } from "./Skills";
import type { EffectBuffer, FireShotBuffer } from "./CombatEffects";
import type { CombatTextBuffer } from "./CombatText";
import type { PlayerFeedback } from "./PlayerFeedback";
import type { RecyclingRules } from "./Recycling";
import type { ItemType } from "./ItemDefinition";
import type { SpiritRealm } from "./SpiritRealm";
import type { OrbResonance } from "./Orbs";
import type { WorldLocation } from "./Homestead";
import type { AutoCombatActivity } from "./PlayerAutoCombat";
import type { ChallengeId, ChallengeSummary } from "./BossChallenge";

export interface MovementInput {
    readonly x: number;
    readonly z: number;
    readonly active: boolean;
}

export interface PlayerSnapshot {
    readonly classId: CharacterClassId;
    readonly passiveBonuses: Readonly<Partial<EquipmentBonuses>>;
    readonly heading: number;
    readonly spiritRealm: SpiritRealm;
    readonly orbDust: number;
    readonly orbResonance: OrbResonance;
    readonly mana: number;
    readonly x: number;
    readonly z: number;
    readonly health: number;
    readonly level: number;
    readonly experience: number;
    readonly experienceToLevel: number;
    readonly unspentAttributePoints: number;
    readonly gold: number;
    readonly shieldRemaining: number;
    readonly skills: SkillSnapshot;
    readonly potionRemaining: number;
    readonly autoCast: boolean;
    readonly orbs: readonly (Orb | undefined)[];
    readonly lootProfile: LootProfile;
    readonly attributes: Attributes;
    readonly stats: DerivedStats;
    readonly battlePower: number;
    readonly equipmentPower: number;
    readonly equipment: EquippedItems;
    readonly inventory: readonly InventoryItem[];
    readonly autoRecycle: RecyclingRules;
    readonly recycled: Readonly<Record<ItemType, number>>;
}

export interface CombatSnapshot {
    readonly autoCombat: Readonly<{ enabled: boolean; activity: AutoCombatActivity }>;
    readonly teleportRemaining: number;
    readonly wildsPosition: Readonly<{ x: number; z: number }>;
    readonly challenges: Readonly<Partial<Record<ChallengeId, ChallengeSummary>>>;
    readonly world: Readonly<{ seed: string; origin: Readonly<{ x: number; z: number }>; location: WorldLocation }>;
    readonly revision: number;
    readonly tick: number;
    readonly elapsedMs: number;
    readonly kills: number;
    readonly livingEnemies: number;
    readonly groundEquipment: number;
    readonly region: RegionInfo;
    readonly nearbyRegions: readonly RegionInfo[];
    readonly chunks: Readonly<{ near: number; buffer: number; retained: number; total: number }>;
    readonly openedChests: number;
    readonly boss: Readonly<{ name: string; x: number; z: number; health: number; maxHealth: number; enraged: boolean }> | undefined;
    readonly gameOver: boolean;
    readonly player: PlayerSnapshot;
}

export interface CombatNotice {
    readonly id: number;
    readonly tone: "info" | "loot" | "level" | "danger";
    readonly message: string;
    readonly acquiredEquipmentId?: number;
}

export interface PlayerRenderState {
    readonly feedback: Readonly<PlayerFeedback>;
    readonly entitySlot: number;
    readonly animationTime: number;
    readonly x: number;
    readonly z: number;
    readonly previousX: number;
    readonly previousZ: number;
    readonly heading: number;
    readonly healthRatio: number;
    readonly invulnerable: boolean;
    readonly shieldReady: boolean;
    readonly ward: number;
    readonly dashing: boolean;
    readonly gameOver: boolean;
}

type EntityView = Readonly<Pick<EntityQuery, "count" | "slots">>;
interface CombatRenderEntities {
    readonly ids: Float64Array;
    readonly enemies: EntityView;
    readonly projectiles: EntityView;
    readonly experience: EntityView;
    readonly loot: EntityView;
    readonly position: Readonly<CombatWorld["position"]>;
    readonly vitals: Readonly<Pick<CombatWorld["vitals"], "hitFlash">>;
    readonly enemy: Readonly<Pick<CombatWorld["enemy"], "kind" | "elite" | "boss" | "homeX" | "homeZ" | "enraged">>;
    readonly status: Readonly<Pick<CombatWorld["status"], "slowUntil" | "wardUntil" | "frozenUntil" | "burnUntil" | "burnStacks" | "conductiveUntil" | "staticGuardUntil" | "starEnergy" | "empoweredUntil" | "empoweredCharges" | "astralGuardUntil" | "weakenedUntil">>;
    readonly action: Readonly<Pick<CombatWorld["action"], "kind" | "reach" | "progress" | "targetX" | "targetZ">>;
    readonly projectile: Readonly<Pick<CombatWorld["projectile"], "critical" | "faction" | "age" | "y" | "previousY">>;
    readonly experienceValue: Float64Array;
    readonly item: Readonly<CombatWorld["item"]>;
}

export interface ChestRenderBuffer {
    readonly count: number;
    readonly tiers: Uint8Array;
    readonly x: Float64Array;
    readonly z: Float64Array;
}

/** Core views borrow ECS storage; presentation views borrow a RenderFrame until its buffer is recycled. */
export interface CombatRenderState {
    readonly combatText: CombatTextBuffer;
    readonly player: PlayerRenderState;
    readonly entities: CombatRenderEntities;
    readonly chests: ChestRenderBuffer;
    readonly effects: EffectBuffer;
    readonly fireProjectiles: FireShotBuffer;
}

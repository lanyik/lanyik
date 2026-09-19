import { enemyName } from "./EnemyDefinitions";
import { CombatResolution } from "./CombatResolution";
import { CombatRewards } from "./CombatRewards";
import { CombatEventKind, type CombatEventConsumer } from "./CombatEvents";
import { combatFeedback } from "./CombatFeedback";
import {
    ATTRIBUTE_IDS,
    ATTRIBUTE_NAMES,
    createStarterEquipment,
    generateEquipment,
    sumEquipment,
    type AttributeId,
    type EquippedItems
} from "./Equipment";
import { DeterministicRandom } from "./DeterministicRandom";
import { battlePower, compareEquipment } from "./EquipmentEvaluation";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { deriveStats, rollAttack, type DerivedStats } from "./CombatStats";
import {
    RegionalWorld, MAX_COMBAT_CHUNKS,
    REGION_RULES, CHEST_RULES, CHEST_TIERS, type RegionInfo
} from "./RegionalWorld";
import { lootProfile, BASE_LOOT_PROFILE, RARITIES, type Rarity } from "./Loot";
import { ORB_UNLOCK_LEVELS, generateOrb, sumOrbs, orbResonance, type Orb } from "./Orbs";
import { EMPTY_SPIRIT_REALM, validateSpiritRealm, type SpiritRealm } from "./SpiritRealm";
import { quoteCraft, commitCraft, type CraftOperation } from "./Crafting";
import { compareInventoryItems, generateConsumable, canUseConsumable, selectConsumable, potionRecovery, POTIONS, type InventoryItem, type ConsumableEffect } from "./InventoryItem";
import { insertInventoryItem, mergeInventory } from "./Inventory";
import type { ItemType } from "./ItemDefinition";
import { OPEN_TERRAIN, type CombatTerrain } from "./CombatTerrain";
import { EMPTY_RECYCLING, recycleReward, type RecyclingRules } from "./Recycling";
import { GAME_CONFIG, ticksPerUpdate } from "./GameConfig";

import { CombatWorld, Component, Faction } from "./CombatWorld";
import { EnemyBehavior } from "./EnemyBehavior";
import type { ProjectileExecutor } from "./ProjectileBatch";
import { advanceProjectiles, moveEnemies, advanceEnemyActions } from "./CombatSystems";
import { SkillSystem } from "./SkillSystem";
import { SKILLS, type SkillId } from "./Skills";
import { validateCharacterCheckpoint, type CharacterCheckpoint } from "./CharacterCheckpoint";
import { MAX_PROJECTILES, CONSUMABLE_COOLDOWN } from "./GameConfig";
import type { CombatRenderState, CombatSnapshot, CombatNotice, PlayerSnapshot, PlayerRenderState, MovementInput, ChestRenderBuffer } from "./CombatState";
import { Exploration } from "./Exploration";
import { HOMESTEAD, type WorldLocation } from "./Homestead";
import { CHALLENGE_ARENA, CHALLENGE_SPAWN, CHALLENGE_IDS, isChallenge, challengeRegion, type ChallengeProgressMap } from "./BossChallenge";
import { ChallengeEncounter, newChallenge } from "./ChallengeEncounter";

const STEP_SECONDS = COMBAT_STEP_MS / 1000;
const PICKUP_ARRIVAL = .25;
const pickupTravel = (distance: number, radius: number) => Math.min(distance, (5 + (radius - distance) * 2.2) * STEP_SECONDS);
const REGENERATION_TICKS = ticksPerUpdate(GAME_CONFIG.timing.regenerationHz);
const AUTO_SKILL_TICKS = ticksPerUpdate(GAME_CONFIG.timing.autoSkillHz);
type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };
class ChestPool implements ChestRenderBuffer {
    public count = 0;
    public readonly tiers = new Uint8Array(MAX_COMBAT_CHUNKS);
    public readonly x = new Float64Array(MAX_COMBAT_CHUNKS);
    public readonly z = new Float64Array(MAX_COMBAT_CHUNKS);
}

export function experienceForLevel(level: number): number {
    return Math.round(20 + level * 18 + level * level);
}

function validatePosition(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Combat position must be finite");
}

/**
 * Authoritative session facade and fixed system order. Combat entities live in
 * the ECS; inventory and progression remain low-frequency domain data.
 */
export class CombatSimulation {
    private readonly movingExperience = new Float64Array(GAME_CONFIG.combat.maxExperienceOrbs);
    private movingExperienceCount = 0;
    private readonly movingLoot = new Float64Array(GAME_CONFIG.combat.maxGroundEquipment);
    private movingLootCount = 0;
    private awaitingQueries = false;
    private movementX = 0;
    private movementZ = 0;
    private closed = false;
    private random: DeterministicRandom;
    private readonly entities: CombatWorld;
    private readonly behavior: EnemyBehavior;
    private readonly skills: SkillSystem;
    private readonly settleOngoing = () => this.resolveImpacts();
    private readonly resolution: CombatResolution;
    private readonly rewards: CombatRewards;
    private readonly world: RegionalWorld;
    private exploration = new Exploration();
    private challenges: ChallengeProgressMap = {};
    private challenge: ChallengeEncounter | undefined;
    private challengeRevisionValue = 0;
    private teleportReadyAt = 0;
    private wildsPosition: { x: number; z: number };
    private readonly chests = new ChestPool();
    private currentRegion: RegionInfo;
    private nearbyRegions: readonly RegionInfo[];
    private inventory: InventoryItem[] = [];
    private autoRecycle: RecyclingRules = EMPTY_RECYCLING;
    private orbDust = 0;
    private recycled: Record<ItemType, number> = { equipment: 0, orb: 0, consumable: 0, affix: 0, scroll: 0 };
    private readonly orbs: (Orb | undefined)[] = new Array(ORB_UNLOCK_LEVELS.length);
    private orbBonuses = orbResonance(this.orbs);
    private lootProfile = BASE_LOOT_PROFILE;
    private equipped: EquippedItems = { weapon: createStarterEquipment() };
    private attributes: Record<AttributeId, number> = { might: 5, vitality: 5, agility: 5, spirit: 5 };
    private stats: DerivedStats;
    private tickValue = 0;
    private revision = 0;
    private nextNoticeId = 1;
    private notices: CombatNotice[] = [];
    private cachedSnapshot: CombatSnapshot | undefined;
    private attackCooldown = 0;
    private potionCooldown = 0;
    private autoCast = true;
    private openedChests = 0;
    private inventoryFullNotified = false;
    private get playerX(): number { return this.entities.position.x[this.entities.player]; }
    private set playerX(value: number) { this.entities.position.x[this.entities.player] = value; }
    private get playerZ(): number { return this.entities.position.z[this.entities.player]; }
    private set playerZ(value: number) { this.entities.position.z[this.entities.player] = value; }
    private get previousPlayerX(): number { return this.entities.position.previousX[this.entities.player]; }
    private set previousPlayerX(value: number) { this.entities.position.previousX[this.entities.player] = value; }
    private get previousPlayerZ(): number { return this.entities.position.previousZ[this.entities.player]; }
    private set previousPlayerZ(value: number) { this.entities.position.previousZ[this.entities.player] = value; }
    private get heading(): number { return this.entities.position.heading[this.entities.player]; }
    private set heading(value: number) { this.entities.position.heading[this.entities.player] = value; }
    private get health(): number { return this.entities.vitals.health[this.entities.player]; }
    private set health(value: number) { this.entities.vitals.health[this.entities.player] = value; }
    private get mana(): number { return this.entities.vitals.mana[this.entities.player]; }
    private set mana(value: number) { this.entities.vitals.mana[this.entities.player] = value; }
    private level = 1;
    private experience = 0;
    private unspentAttributePoints = 0;
    private gameOverValue = false;
    private readonly playerRenderState: MutablePlayerRenderState = {
        animationTime: 0,
        x: 0,
        z: 0,
        previousX: 0,
        previousZ: 0,
        heading: 0,
        healthRatio: 1,
        invulnerable: false,
        shieldReady: true,
        ward: 0,
        dashing: false,
        gameOver: false
    };
    private readonly renderState: CombatRenderState;

    constructor(private readonly seed: string | number, private readonly start = { x: 0, z: 0 }, spiritRealm: SpiritRealm = EMPTY_SPIRIT_REALM,
        terrain: CombatTerrain = OPEN_TERRAIN, private readonly location: WorldLocation = "wilds", private characterId = String(seed)) {
        validatePosition(start.x, start.z);
        this.wildsPosition = { ...start };
        const spirit = validateSpiritRealm(spiritRealm);
        for (const id of ATTRIBUTE_IDS) this.attributes[id] += spirit.attributes[id];
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.world = new RegionalWorld(seed, start, terrain);
        this.entities = new CombatWorld(start.x, start.z, terrain);
        this.resolution = new CombatResolution(this.entities);
        this.rewards = new CombatRewards(this.entities, spirit, seed);
        this.behavior = new EnemyBehavior(this.entities, isChallenge(location) ? { residencyAt: () => "near" } : this.world);
        this.skills = new SkillSystem(this.entities);
        this.renderState = { combatText: this.entities.combatText.buffer, player: this.playerRenderState, chests: this.chests, effects: this.entities.effects.buffer,
            entities: { ids: this.entities.world.ids, enemies: this.entities.enemies, projectiles: this.entities.projectiles,
                experience: this.entities.experience, loot: this.entities.loot, position: this.entities.position,
                vitals: this.entities.vitals, enemy: this.entities.enemy, action: this.entities.action,
                projectile: this.entities.projectile, status: this.entities.status, experienceValue: this.entities.experienceValue, item: this.entities.item } };
        this.currentRegion = this.world.regionAt(start.x, start.z);
        this.nearbyRegions = location === "wilds" ? this.world.nearbyRegions(this.currentRegion) : [];
        const position = location === "homestead" ? HOMESTEAD.spawn : isChallenge(location) ? CHALLENGE_SPAWN : start;
        this.playerX = this.previousPlayerX = position.x;
        this.playerZ = this.previousPlayerZ = position.z;
        this.stats = this.calculateStats();
        this.health = this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        this.mana = this.stats.maxMana;
        if (location === "wilds") {
            this.exploration.discover(start.x, start.z);
            this.world.synchronize(start.x, start.z);
            this.world.updateAccess(start.x, start.z);
            this.spawnEnemies(); this.refreshChests();
        }
    }

    public get tick(): number { return this.tickValue; }
    public get gameOver(): boolean { return this.gameOverValue; }
    public get spiritProgress(): SpiritRealm { return this.rewards.spiritRealm; }
    public get explorationSnapshot() { return this.exploration.snapshot; }
    public get challengeRevision(): number { return this.challengeRevisionValue; }
    public checkpoint(destination: WorldLocation = this.location, point?: { x: number; z: number }, targetTerrain?: CombatTerrain, recoverDefeat = false): CharacterCheckpoint {
        if ((this.gameOverValue && !recoverDefeat) || this.closed || this.awaitingQueries) throw new Error("当前角色状态不可保存");
        const { stats: _stats, skills: _skills, battlePower: _power, equipmentPower: _equipmentPower, lootProfile: _loot, orbResonance: _resonance, experienceToLevel: _nextLevel, ...player } = this.getSnapshot().player;
        const wildsPosition = this.location === "wilds" ? { x: this.playerX, z: this.playerZ } : { ...this.wildsPosition };
        const travelling = destination !== this.location, skills = this.skills.checkpoint();
        let challenges = this.captureChallenges(), inventory = player.inventory, challengeRevision = this.challengeRevisionValue;
        if (travelling && isChallenge(destination) && (!challenges[destination] || challenges[destination]!.claimed)) {
            const scroll = inventory.find(item => item.type === "scroll" && item.value === destination);
            if (!scroll || scroll.type !== "scroll") throw new Error("需要一张对应 Boss 的副本传送卷轴");
            inventory = inventory.flatMap(item => item.id !== scroll.id ? [item] : item.size === 1 ? [] : [Object.freeze({ ...scroll, size: scroll.size - 1 })]);
            challenges = { ...challenges, [destination]: newChallenge(destination, this.level, (challenges[destination]?.round ?? 0) + 1) };
            challengeRevision++;
        }
        if (travelling && Object.keys(challenges).length) challengeRevision++;
        let position = destination === "homestead" ? HOMESTEAD.spawn : isChallenge(destination) ? challenges[destination]!.position : wildsPosition;
        let teleportReadyAt = this.teleportReadyAt;
        if (point) {
            validatePosition(point.x, point.z);
            if (travelling && !targetTerrain) throw new Error("跨世界选点需要目标地形校验");
            const error = destination === "wilds" ? this.teleportError(point.x, point.z) : undefined;
            if (error) throw new Error(error);
            if (!(targetTerrain ?? this.entities.terrain).isClear(point.x, point.z, GAME_CONFIG.combat.playerRadius)) throw new Error("目标位置无法落脚，请选择平坦陆地");
            position = point;
            if (destination === "wilds" && this.world.regionAt(point.x, point.z).level > this.level) teleportReadyAt = this.tickValue + GAME_CONFIG.timing.simulationHz * 5;
        }
        const recovering = recoverDefeat && this.gameOverValue;
        if (recovering) { position = CHALLENGE_SPAWN; challengeRevision++; }
        return validateCharacterCheckpoint({ version: 4, characterId: this.characterId, challenges, challengeRevision, teleportReadyAt, seed: String(this.seed), origin: { ...this.start },
            location: destination, wildsPosition, exploration: this.exploration.snapshot,
            player: travelling || point || recovering ? { ...player, inventory, ...position, ...(destination === "homestead" || recovering ? { health: this.stats.maxHealth, mana: this.stats.maxMana } : {}) } : player,
            tick: this.tickValue, kills: this.rewards.kills, openedChests: this.openedChests, nextItemId: this.rewards.nextItemId, random: this.random.state,
            attackCooldown: this.attackCooldown, damageImmunity: this.resolution.damageImmunity,
            skills: travelling || recovering ? { ...skills, dashUntil: 0, dashX: 0, dashZ: 0 } : skills });
    }
    public restore(checkpoint: CharacterCheckpoint): void {
        const state = validateCharacterCheckpoint(checkpoint), p = state.player;
        if (state.seed !== String(this.seed) || state.location !== this.location || state.origin.x !== this.start.x || state.origin.z !== this.start.z
            || !this.entities.terrain.isClear(p.x, p.z, GAME_CONFIG.combat.playerRadius)) throw new Error("角色存档世界或位置无效");
        this.exploration = new Exploration(state.exploration); this.wildsPosition = { ...state.wildsPosition };
        this.characterId = state.characterId; this.challenges = state.challenges; this.challengeRevisionValue = state.challengeRevision; this.teleportReadyAt = state.teleportReadyAt;
        this.inventory = [...p.inventory]; this.equipped = { ...p.equipment }; this.orbs.splice(0, this.orbs.length, ...p.orbs);
        this.attributes = { ...p.attributes };
        for (const id of ATTRIBUTE_IDS) this.attributes[id] += this.rewards.spiritRealm.attributes[id] - p.spiritRealm.attributes[id];
        this.level = p.level; this.experience = p.experience; this.unspentAttributePoints = p.unspentAttributePoints;
        this.rewards.gold = p.gold; this.orbDust = p.orbDust; this.autoRecycle = p.autoRecycle; this.recycled = { ...p.recycled }; this.autoCast = p.autoCast;
        this.tickValue = state.tick; this.rewards.kills = state.kills; this.openedChests = state.openedChests; this.rewards.nextItemId = state.nextItemId;
        this.random.restore(state.random); this.skills.restore(state.skills, state.tick); this.attackCooldown = state.attackCooldown; this.resolution.damageImmunity = state.damageImmunity;
        this.movementX = this.movementZ = 0;
        this.resolution.shieldCooldown = p.shieldRemaining; this.potionCooldown = p.potionRemaining;
        this.lootProfile = lootProfile(sumOrbs(this.orbs)); this.orbBonuses = orbResonance(this.orbs); this.stats = this.calculateStats();
        this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        this.health = Math.min(p.health, this.stats.maxHealth); this.mana = Math.min(p.mana, this.stats.maxMana);
        this.playerX = this.previousPlayerX = p.x; this.playerZ = this.previousPlayerZ = p.z; this.heading = p.heading;
        const enemies = Array.from(this.entities.enemies.slots.subarray(0, this.entities.enemies.count));
        for (const slot of enemies) this.entities.remove(slot);
        for (const query of [this.entities.loot, this.entities.experience]) for (const slot of Array.from(query.slots.subarray(0, query.count))) this.entities.remove(slot);
        this.rewards.groundItems.clear(); this.challenge = undefined;
        for (const chunk of this.world.chunks.values()) chunk.spawned.fill(0);
        if (this.location === "wilds") {
            this.exploration.discover(p.x, p.z);
            this.currentRegion = this.world.regionAt(p.x, p.z); this.nearbyRegions = this.world.nearbyRegions(this.currentRegion);
            this.world.synchronize(p.x, p.z); this.world.resetAccess(); this.world.updateAccess(p.x, p.z);
            this.spawnEnemies(); this.refreshChests();
        } else if (isChallenge(this.location)) {
            const progress = this.challenges[this.location]!;
            this.currentRegion = challengeRegion(progress.level); this.nearbyRegions = [];
            this.challenge = new ChallengeEncounter(this.location, progress, this.entities, this.rewards);
            this.refreshChests();
        }
        this.markChanged();
    }
    public dispose(): void { this.closed = true; this.entities.terrain.dispose(); }

    public teleport(x: number, z: number): void {
        validatePosition(x, z);
        if (this.closed || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required queries");
        if (this.gameOverValue) return;
        const error = this.location === "wilds" ? this.teleportError(x, z) : undefined;
        if (error) { this.pushNotice("info", error); return; }
        if (!this.entities.terrain.isClear(x, z, GAME_CONFIG.combat.playerRadius)) {
            this.pushNotice("info", "目标位置无法落脚，请选择平坦陆地"); return;
        }
        if (this.location === "wilds") this.exploration.discover(x, z);
        if (this.location === "wilds" && this.world.regionAt(x, z).level > this.level) this.teleportReadyAt = this.tickValue + GAME_CONFIG.timing.simulationHz * 5;
        this.playerX = this.previousPlayerX = x; this.playerZ = this.previousPlayerZ = z;
        this.movementX = this.movementZ = 0;
        this.skills.cancelTravel();
        if (this.location === "wilds") {
            if (this.world.synchronize(x, z)) this.reconcileRegions();
            this.world.updateAccess(x, z);
            this.spawnEnemies(); this.refreshChests(); this.updateCurrentRegion();
        }
        this.markChanged();
    }

    public step(input: MovementInput): void;
    public step(input: MovementInput, executor: ProjectileExecutor): Promise<void>;
    public step(input: MovementInput, executor?: ProjectileExecutor): void | Promise<void> {
        if (this.closed || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required queries");
        if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) {
            throw new RangeError("Movement input must contain finite coordinates");
        }
        if (this.gameOverValue) return executor ? Promise.resolve() : undefined;
        if (!Number.isSafeInteger(this.tickValue + 1) || (this.tickValue + 1) * COMBAT_STEP_MS > Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Combat time exceeds the supported range");
        }
        this.tickValue += 1;
        this.cachedSnapshot = undefined;
        this.previousPlayerX = this.playerX;
        this.previousPlayerZ = this.playerZ;
        this.resolution.advance(STEP_SECONDS);
        this.entities.status.advance(this.tickValue);
        this.potionCooldown = Math.max(0, this.potionCooldown - STEP_SECONDS);
        this.entities.effects.advance(this.tickValue); this.entities.combatText.advance(this.tickValue);
        if (!this.skills.advance(this.tickValue)) this.movePlayer(input);
        if (this.location === "homestead") {
            this.skills.advanceOngoing(this.tickValue, this.random, this.settleOngoing);
            if (this.tickValue % REGENERATION_TICKS === 0) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen);
            return executor ? Promise.resolve() : undefined;
        }
        if (this.location === "wilds") {
            if (this.playerX !== this.previousPlayerX || this.playerZ !== this.previousPlayerZ) this.exploration.discover(this.playerX, this.playerZ);
            const shifted = this.world.synchronize(this.playerX, this.playerZ);
            if (shifted) this.reconcileRegions();
            if (this.world.updateAccess(this.playerX, this.playerZ)) { this.spawnEnemies(); this.refreshChests(); }
            this.updateCurrentRegion();
        }
        this.fireWeapon();
        if (executor) return this.finishAsyncStep(executor);
        advanceProjectiles(this.entities);
        this.finishStep();
    }

    private async finishAsyncStep(executor: ProjectileExecutor): Promise<void> {
        this.awaitingQueries = true;
        try {
            await advanceProjectiles(this.entities, executor);
            if (this.closed) throw new Error("Simulation closed during required queries");
            this.finishStep();
        } catch (error) {
            this.closed = true;
            throw error;
        } finally { this.awaitingQueries = false; }
    }

    private finishStep(): void {
        this.resolveImpacts();
        if (this.gameOverValue) return;
        this.skills.advanceOngoing(this.tickValue, this.random, this.settleOngoing);
        if (this.autoCast && this.tickValue % AUTO_SKILL_TICKS === 0) {
            for (const id of this.skills.loadout) {
                this.skills.cast(id, this.tickValue, this.stats, this.level, this.random, true);
                this.resolveImpacts();
            }
        }
        this.behavior.update(this.tickValue);
        moveEnemies(this.entities, this.tickValue);
        advanceEnemyActions(this.entities, this.tickValue);
        this.resolveImpacts();
        if (this.gameOverValue) return;
        this.advanceExperience();
        this.collectEquipment();
        this.openNearbyChest();
        if (this.tickValue % REGENERATION_TICKS === 0) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen);
        if (this.tickValue % REGENERATION_TICKS === 0 && this.stats.healthRegen > 0 && this.health < this.stats.maxHealth) {
            this.health = Math.min(this.stats.maxHealth, this.health + this.stats.healthRegen);
            this.markChanged();
        }
    }

    public getSnapshot(): CombatSnapshot {
        if (this.cachedSnapshot) return this.cachedSnapshot;
        const equipment = Object.freeze({ ...this.equipped });
        const player: PlayerSnapshot = Object.freeze({
            heading: this.heading,
            spiritRealm: this.rewards.spiritRealm,
            orbDust: this.orbDust,
            orbResonance: this.orbBonuses,
            x: this.playerX,
            z: this.playerZ,
            health: this.health,
            mana: this.mana,
            level: this.level,
            experience: this.experience,
            experienceToLevel: experienceForLevel(this.level),
            unspentAttributePoints: this.unspentAttributePoints,
            gold: this.rewards.gold,
            shieldRemaining: this.resolution.shieldCooldown,
            skills: this.skills.snapshot(this.tickValue),
            potionRemaining: this.potionCooldown,
            autoCast: this.autoCast,
            orbs: Object.freeze([...this.orbs]),
            lootProfile: this.lootProfile,
            attributes: Object.freeze({ ...this.attributes }),
            stats: this.stats,
            battlePower: battlePower(this.stats),
            equipmentPower: battlePower(this.stats) - battlePower(deriveStats(this.level, this.attributes, sumEquipment({}))),
            equipment,
            inventory: Object.freeze([...this.inventory]),
            autoRecycle: this.autoRecycle,
            recycled: Object.freeze({ ...this.recycled })
        });
        const chunks = { near: 0, buffer: 0, retained: 0, total: this.world.chunks.size };
        for (const chunk of this.world.chunks.values()) if (chunk.band !== "unloaded") chunks[chunk.band] += 1;
        let boss: CombatSnapshot["boss"];
        for (let cursor = 0; cursor < this.entities.enemies.count; cursor += 1) {
            const index = this.entities.enemies.slots[cursor];
            const region = this.entities.enemy.regions[index]!;
            if (this.entities.enemy.boss[index] && region.x === this.currentRegion.x && region.z === this.currentRegion.z) {
                boss = Object.freeze({ name: enemyName(this.entities.enemy.kind[index], true), x: this.entities.position.x[index], z: this.entities.position.z[index], health: this.entities.vitals.health[index], maxHealth: this.entities.vitals.maxHealth[index], enraged: this.entities.enemy.enraged[index] !== 0 });
                break;
            }
        }
        return this.cachedSnapshot = Object.freeze({
            teleportRemaining: Math.max(0, (this.teleportReadyAt - this.tickValue) / GAME_CONFIG.timing.simulationHz),
            wildsPosition: Object.freeze(this.location === "wilds" ? { x: this.playerX, z: this.playerZ } : { ...this.wildsPosition }),
            challenges: Object.freeze(Object.fromEntries(CHALLENGE_IDS.flatMap(id => {
                const run = this.challenges[id];
                return run ? [[id, Object.freeze({ level: run.level, round: run.round, remaining: this.challenge?.id === id ? this.entities.enemies.count : run.enemies.filter(enemy => enemy.health > 0).length,
                    claimed: this.challenge?.id === id ? this.challenge.claimed : run.claimed,
                    position: Object.freeze(this.challenge?.id === id ? { x: this.playerX, z: this.playerZ } : { ...run.position }) })]] : [];
            }))),
            world: Object.freeze({ seed: String(this.seed), origin: Object.freeze({ ...this.start }), location: this.location }),
            revision: this.revision,
            tick: this.tickValue,
            elapsedMs: this.tickValue / GAME_CONFIG.timing.simulationHz * 1000,
            kills: this.rewards.kills,
            livingEnemies: this.entities.enemies.count,
            groundEquipment: this.entities.loot.count,
            region: this.currentRegion,
            nearbyRegions: this.nearbyRegions,
            chunks: Object.freeze(chunks),
            openedChests: this.openedChests,
            boss,
            gameOver: this.gameOverValue,
            player
        });
    }

    public getRenderState(): CombatRenderState {
        // Use the same conversion as effect timestamps, including while paused on a hit tick.
        this.playerRenderState.animationTime = this.tick / GAME_CONFIG.timing.simulationHz;
        const state = this.playerRenderState;
        state.x = this.playerX;
        state.z = this.playerZ;
        state.previousX = this.previousPlayerX;
        state.previousZ = this.previousPlayerZ;
        state.heading = this.heading;
        state.healthRatio = this.health / this.stats.maxHealth;
        state.invulnerable = this.resolution.damageImmunity > 0;
        state.shieldReady = this.resolution.shieldCooldown === 0;
        state.ward = this.skills.ward;
        state.dashing = this.skills.dashing(this.tickValue);
        state.gameOver = this.gameOverValue;
        return this.renderState;
    }

    public drainNotices(): readonly CombatNotice[] {
        if (this.notices.length === 0) return [];
        const notices = this.notices;
        this.notices = [];
        return notices;
    }

    public allocateAttribute(attribute: AttributeId): { readonly ok: boolean; readonly message: string } {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown attribute");
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        if (this.unspentAttributePoints === 0) return { ok: false, message: "没有可分配的属性点" };
        this.attributes[attribute] += 1;
        this.unspentAttributePoints -= 1;
        this.recalculateStats(false);
        this.pushNotice("info", `${ATTRIBUTE_NAMES[attribute]}提高至 ${this.attributes[attribute]}`);
        this.markChanged();
        return { ok: true, message: "属性已提升" };
    }

    public equip(itemId: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        const index = this.inventory.findIndex(item => item.id === itemId);
        if (index < 0) return { ok: false, message: "背包中没有这件装备" };
        const item = this.inventory[index];
        if (item.type !== "equipment") return { ok: false, message: "请选择装备" };
        const previous = this.equipped[item.value];
        this.inventory.splice(index, 1);
        this.equipped = { ...this.equipped, [item.value]: Object.freeze({ ...item, locked: true, revision: item.revision + 1 }) };
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        if (previous && !this.storeInventoryItem(previous)) throw new Error("Equipment exchange lost its reserved slot");
        this.pushNotice("loot", `已装备 ${item.name}`);
        this.markChanged();
        return { ok: true, message: "装备成功" };
    }

    public sortInventory(): void {
        if (this.gameOverValue) return;
        this.inventory = mergeInventory(this.inventory).sort(compareInventoryItems);
        this.markChanged();
    }

    public setAutoRecycle(type: ItemType, maximum: Rarity | null): void {
        if (!Object.hasOwn(EMPTY_RECYCLING, type)) throw new RangeError("Unknown recycling category");
        if (maximum !== null && !RARITIES.includes(maximum)) throw new RangeError("Unknown cleanup quality");
        if (this.gameOverValue || this.autoRecycle[type] === maximum) return;
        this.autoRecycle = Object.freeze({ ...this.autoRecycle, [type]: maximum });
        this.recycleInventory();
        this.markChanged();
    }

    public mergeConsumables(): void {
        if (this.gameOverValue) return;
        const before = this.inventory.length;
        this.inventory = mergeInventory(this.inventory);
        this.inventoryFullNotified = false;
        this.pushNotice("info", `合并药剂 · 腾出 ${before - this.inventory.length} 格`);
        this.markChanged();
    }

    public setEquipmentLock(itemId: number, locked: boolean): void {
        if (this.gameOverValue) return;
        const index = this.inventory.findIndex(item => item.id === itemId), item = this.inventory[index] ?? Object.values(this.equipped).find(item => item?.id === itemId);
        if (!item || item.type !== "equipment" || item.locked === locked) return;
        const updated = Object.freeze({ ...item, locked, revision: item.revision + 1 });
        if (index >= 0) this.inventory[index] = updated;
        else this.equipped = { ...this.equipped, [item.value]: updated };
        this.recycleInventory(); this.markChanged();
    }

    public craft(operation: CraftOperation): void {
        if (this.gameOverValue) return;
        const context = { inventory: this.inventory, equipment: this.equipped, orbs: this.orbs, gold: this.rewards.gold, orbDust: this.orbDust };
        const plan = quoteCraft(context, operation);
        if (!plan.ok) { this.pushNotice("info", plan.reason); return; }
        const result = commitCraft(context, plan, this.rewards.nextItemId);
        this.inventory = result.inventory; this.equipped = result.equipment;
        if (result.usedId) this.rewards.nextItemId++;
        this.rewards.gold += (plan.goldGain ?? 0) - plan.gold; this.orbDust += plan.dustGain - plan.dust;
        this.inventoryFullNotified = false;
        this.recalculateStats(false);
        this.pushNotice("loot", `${plan.title}完成${plan.dustGain ? ` · 获得 ${plan.dustGain} 宝珠粉尘` : plan.goldGain ? ` · 获得 ${plan.goldGain} 金币` : ""}`);
        this.markChanged();
    }

    public cultivateSpirit(attribute: AttributeId): void {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown spirit attribute");
        if (this.gameOverValue) return;
        if (this.rewards.spiritRealm.souls < GAME_CONFIG.spiritRealm.soulsPerLevel) { this.pushNotice("info", "灵魂不足，需要 1000 灵魂"); return; }
        this.rewards.spiritRealm = validateSpiritRealm({ souls: this.rewards.spiritRealm.souls - GAME_CONFIG.spiritRealm.soulsPerLevel,
            revision: this.rewards.spiritRealm.revision + 1, attributes: { ...this.rewards.spiritRealm.attributes, [attribute]: this.rewards.spiritRealm.attributes[attribute] + 1 } });
        this.attributes[attribute]++;
        this.recalculateStats(false); this.pushNotice("level", `灵境成长 · ${ATTRIBUTE_NAMES[attribute]}永久 +1`); this.markChanged();
    }

    public equipOrb(itemId: number, socket: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        if (!Number.isInteger(socket) || socket < 0 || socket >= ORB_UNLOCK_LEVELS.length) return { ok: false, message: "无效宝珠槽" };
        if (this.level < ORB_UNLOCK_LEVELS[socket]) return { ok: false, message: "宝珠槽尚未解锁" };
        const source = this.orbs.findIndex(item => item?.id === itemId);
        if (source >= 0) {
            if (source !== socket) {
                [this.orbs[source], this.orbs[socket]] = [this.orbs[socket], this.orbs[source]];
                this.markChanged();
            }
            return { ok: true, message: "宝珠槽位已交换" };
        }
        const index = this.inventory.findIndex(item => item.id === itemId);
        const item = this.inventory[index];
        if (!item || item.type !== "orb") return { ok: false, message: "背包中没有这颗宝珠" };
        const previous = this.orbs[socket];
        this.inventory.splice(index, 1);
        if (previous && !this.storeInventoryItem(previous)) throw new Error("Orb exchange lost its reserved slot");
        this.orbs[socket] = item;
        this.lootProfile = lootProfile(sumOrbs(this.orbs));
        this.orbBonuses = orbResonance(this.orbs);
        this.inventoryFullNotified = false;
        this.pushNotice("loot", `已嵌入 ${item.name}`);
        this.markChanged();
        return { ok: true, message: "宝珠已嵌入" };
    }

    public unequip(slot: keyof EquippedItems): void {
        const item = this.equipped[slot];
        if (this.gameOverValue || !item) return;
        const nextInventory = insertInventoryItem(this.inventory, item);
        if (!nextInventory) { this.notifyInventoryFull("equipment"); return; }
        this.inventory = nextInventory;
        const next = { ...this.equipped };
        delete next[slot];
        this.equipped = next;
        this.recalculateStats(false);
        this.markChanged();
    }

    public removeOrb(socket: number): void {
        const orb = this.orbs[socket];
        if (this.gameOverValue || !orb) return;
        if (!this.storeInventoryItem(orb)) { this.notifyInventoryFull("orb"); return; }
        this.inventoryFullNotified = false;
        this.orbs[socket] = undefined;
        this.lootProfile = lootProfile(sumOrbs(this.orbs));
        this.orbBonuses = orbResonance(this.orbs);
        this.markChanged();
    }

    public toggleAutoCast(): void {
        if (this.gameOverValue) return;
        this.autoCast = !this.autoCast;
        this.markChanged();
    }

    public castSkill(id: SkillId): void {
        if (this.gameOverValue) return;
        if (this.skills.cast(id, this.tickValue, this.stats, this.level, this.random)) { this.resolveImpacts(); this.markChanged(); }
    }

    public equipSkill(id: SkillId, slot: number): void {
        if (!this.gameOverValue && this.skills.equip(id, slot, this.level)) this.markChanged();
    }

    public upgradeSkill(id: SkillId): void {
        if (!this.gameOverValue && this.skills.upgrade(id, this.level)) {
            this.pushNotice("info", `${SKILLS[id].name}已强化`); this.markChanged();
        }
    }

    public useConsumable(effect: ConsumableEffect, itemId?: number): void {
        if (this.gameOverValue || this.potionCooldown > 0) return;
        const context = { health: this.health, mana: this.mana, stats: this.stats };
        const item = itemId === undefined ? selectConsumable(this.inventory, effect, context) : this.inventory.find(item => item.id === itemId);
        if (!item || item.type !== "consumable" || POTIONS[item.value].resource !== effect || !canUseConsumable(item, context)) return;
        const index = this.inventory.indexOf(item), recovery = potionRecovery(item, this.stats);
        if (item.size === 1) this.inventory.splice(index, 1);
        else this.inventory[index] = Object.freeze({ ...item, size: item.size - 1 });
        this.health = Math.min(this.stats.maxHealth, this.health + recovery.health);
        this.mana = Math.min(this.stats.maxMana, this.mana + recovery.mana);
        this.potionCooldown = CONSUMABLE_COOLDOWN;
        this.inventoryFullNotified = false;
        this.markChanged();
    }

    private movePlayer(input: MovementInput): void {
        const length = Math.max(1, Math.hypot(input.x, input.z));
        const speed = input.active ? this.stats.moveSpeed / length : 0;
        const response = 1 - Math.exp(-36 * STEP_SECONDS);
        this.movementX += (input.x * speed - this.movementX) * response;
        this.movementZ += (input.z * speed - this.movementZ) * response;
        if (Math.hypot(this.movementX, this.movementZ) < .002) { this.movementX = this.movementZ = 0; return; }
        const x = this.playerX, z = this.playerZ;
        this.entities.moveActor(this.entities.player, this.movementX * STEP_SECONDS, this.movementZ * STEP_SECONDS);
        const dx = this.playerX - x, dz = this.playerZ - z;
        if (Math.hypot(dx, dz) > 1e-6) this.heading = Math.atan2(dx, dz);
        // Retain only achieved velocity: pushing a wall cannot accumulate stored motion.
        this.movementX = dx / STEP_SECONDS; this.movementZ = dz / STEP_SECONDS;
    }

    private spawnEnemies(): void {
        for (const home of this.world.chunks.values()) {
            for (let slot = 0; slot < home.spawns.length; slot += 1) {
                if (home.spawned[slot]) continue;
                const spawn = home.spawns[slot];
                if (!home.navigation.isReached(spawn.x, spawn.z)) continue;
                if (Math.hypot(spawn.x - this.playerX, spawn.z - this.playerZ) < 3) continue;
                this.entities.spawnEnemy(spawn, home);
                home.spawned[slot] = 1;
            }
        }
    }

    private reconcileRegions(): void {
        const { enemies, experience, loot, enemy, position, item } = this.entities;
        let cursor = 0;
        while (cursor < enemies.count) {
            const slot = enemies.slots[cursor];
            if (!enemy.homes[slot]!.resident) this.entities.remove(slot);
            else cursor++;
        }
        cursor = 0;
        while (cursor < experience.count) {
            const slot = experience.slots[cursor];
            if (this.world.residencyAt(position.x[slot], position.z[slot]) === "unloaded") this.entities.remove(slot);
            else cursor++;
        }
        cursor = 0;
        while (cursor < loot.count) {
            const slot = loot.slots[cursor];
            if (this.world.residencyAt(position.x[slot], position.z[slot]) === "unloaded") {
                this.rewards.groundItems.delete(item.id[slot]); this.entities.remove(slot);
            } else cursor++;
        }
    }

    private updateCurrentRegion(): void {
        const region = this.world.regionAt(this.playerX, this.playerZ, this.currentRegion);
        if (region.x !== this.currentRegion.x || region.z !== this.currentRegion.z) {
            this.currentRegion = region;
            this.nearbyRegions = this.world.nearbyRegions(region);
            this.pushNotice(region.difficulty === "horror" ? "danger" : "info",
                "进入 " + REGION_RULES[region.difficulty].name + " · 地域等级 " + region.level);
        }
    }

    private refreshChests(): void {
        this.chests.count = 0;
        if (this.challenge) {
            if (this.challenge.cleared && !this.challenge.claimed) {
                this.chests.count = 1; this.chests.x[0] = CHALLENGE_ARENA.x; this.chests.z[0] = CHALLENGE_ARENA.z; this.chests.tiers[0] = CHEST_TIERS.indexOf("rainbow");
            }
            return;
        }
        for (const chunk of this.world.chunks.values()) {
            const chest = chunk.chest;
            if (!chest || chunk.chestOpened || !chunk.navigation.isReached(chest.x, chest.z)) continue;
            const index = this.chests.count++;
            this.chests.x[index] = chest.x;
            this.chests.z[index] = chest.z;
            this.chests.tiers[index] = CHEST_TIERS.indexOf(chest.tier);
        }
    }

    private openNearbyChest(): void {
        if (this.challenge) { this.openChallengeChest(); return; }
        chestLoop: for (const chunk of this.world.chunks.values()) {
            const chest = chunk.chest;
            if (!chest || chunk.band !== "near" || chunk.chestOpened) continue;
            if (!chunk.navigation.isReached(chest.x, chest.z)) continue;
            if (Math.hypot(chest.x - this.playerX, chest.z - this.playerZ) > 0.95) continue;
            const approach = this.entities.terrain.move(this.playerX, this.playerZ, chest.x - this.playerX, chest.z - this.playerZ, GAME_CONFIG.combat.playerRadius, false);
            if (Math.hypot(approach.x - chest.x, approach.z - chest.z) > 1e-5) continue;
            const rules = CHEST_RULES[chest.tier];
            // Stage all category/stack changes before consuming chest randomness or IDs.
            // A blocked chest must not consume random state or item IDs.
            const random = this.random.clone();
            let nextId = this.rewards.nextItemId;
            const item = generateEquipment(random, nextId++, chest.region.level, this.lootProfile, rules.rarity);
            const clearEquipment = this.shouldAutoRecycle(item);
            const rewards: InventoryItem[] = [item, generateConsumable(random, nextId++, rules.rarity)];
            if (chest.hasOrb) rewards.push(generateOrb(random, nextId++, rules.rarity));
            let nextInventory = this.inventory;
            for (const reward of rewards) {
                if (this.shouldAutoRecycle(reward)) continue;
                const next = insertInventoryItem(nextInventory, reward);
                if (!next) { this.notifyInventoryFull(reward.type); break chestLoop; }
                nextInventory = next;
            }
            this.random = random;
            this.rewards.nextItemId = nextId;
            this.inventory = nextInventory;
            for (const reward of rewards) if (this.shouldAutoRecycle(reward)) this.applyAutoRecycle(reward);
            this.rewards.gold += Math.round(rules.gold * (1 + this.stats.goldBonus + this.orbBonuses.goldBonus));
            chunk.chestOpened = true;
            this.openedChests += 1;
            this.inventoryFullNotified = false;
            this.pushNotice("loot", rules.name + " · " + (clearEquipment ? "较弱装备已售出" : item.name), clearEquipment ? undefined : item.id);
            this.markChanged();
            this.refreshChests();
            break;
        }
    }

    private notifyInventoryFull(type: ItemType): void {
        if (this.inventoryFullNotified) return;
        this.inventoryFullNotified = true;
        this.pushNotice("danger", `${GAME_CONFIG.inventory[type].name}背包空间不足，整理后可拾取物品或开启宝箱`);
    }

    private fireWeapon(): void {
        this.attackCooldown -= STEP_SECONDS;
        if (this.attackCooldown > 0 || this.entities.projectiles.count === MAX_PROJECTILES) return;
        let target = -1;
        let nearest = this.stats.attackRange * this.stats.attackRange;
        const enemies = this.entities.queryNearby(Component.Enemy, this.playerX, this.playerZ, this.stats.attackRange);
        for (let cursor = 0; cursor < enemies.count; cursor += 1) {
            const index = enemies.slots[cursor];
            const dx = this.entities.position.x[index] - this.playerX;
            const dz = this.entities.position.z[index] - this.playerZ;
            const distance = dx * dx + dz * dz;
            if ((distance < nearest || (distance === nearest && (target < 0 || this.entities.world.ids[index] < this.entities.world.ids[target])))
                && this.entities.canSee(this.entities.player, index, .11)) {
                nearest = distance;
                target = index;
            }
        }
        if (target < 0) {
            this.attackCooldown = 0;
            return;
        }
        const distance = Math.sqrt(nearest);
        const directionX = distance > 0 ? (this.entities.position.x[target] - this.playerX) / distance : 0;
        const directionZ = distance > 0 ? (this.entities.position.z[target] - this.playerZ) / distance : 1;
        const { critical, damage } = rollAttack(this.stats, this.random);
        const projectileSpeed = 10.5;
        const launchOffset = Math.min(.38, distance * .5);
        if (this.entities.spawnProjectile(this.entities.world.ids[this.entities.player], Faction.Player,
            this.playerX + directionX * launchOffset,
            this.playerZ + directionZ * launchOffset,
            directionX * projectileSpeed,
            directionZ * projectileSpeed,
            damage,
            this.stats.attackRange / projectileSpeed + 0.25,
            { critical, height: .8, groundX: this.playerX, groundZ: this.playerZ,
                velocityY: distance > 0 ? (this.entities.aimHeight(target) - this.entities.aimHeight(this.entities.player)) * projectileSpeed / (distance - launchOffset) : 0 }
        )) this.attackCooldown += 1 / this.stats.attackRate;
    }

    private resolveImpacts(): void {
        this.resolution.resolve(this.tickValue, this.stats, this.random, this.skills.dashing(this.tickValue), this.consumeCombatEvent);
    }

    private advanceExperience(): void {
        const e = this.entities;
        // Reset only the previous frame's movers, including orbs that just left pickup range.
        for (let i = 0; i < this.movingExperienceCount; i++) {
            const slot = e.world.resolve(this.movingExperience[i]);
            if (slot >= 0) { e.position.previousX[slot] = e.position.x[slot]; e.position.previousZ[slot] = e.position.z[slot]; }
        }
        this.movingExperienceCount = 0;
        const nearby = e.queryNearby(Component.Experience, this.playerX, this.playerZ, this.stats.pickupRadius, false, true);
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const index = nearby.slots[cursor];
            const x = e.position.x[index], z = e.position.z[index];
            e.position.previousX[index] = x; e.position.previousZ[index] = z;
            const dx = this.playerX - x, dz = this.playerZ - z, distance = Math.hypot(dx, dz);
            const travel = pickupTravel(distance, this.stats.pickupRadius);
            if (distance - travel <= PICKUP_ARRIVAL) {
                this.gainExperience(e.experienceValue[index]); e.remove(index);
                if (this.challenge) this.challengeRevisionValue++;
            } else {
                e.position.x[index] += dx / distance * travel; e.position.z[index] += dz / distance * travel;
                e.updateSpatial(index, Component.Experience);
                this.movingExperience[this.movingExperienceCount++] = e.world.ids[index];
            }
        }
    }

    private collectEquipment(): void {
        const e = this.entities, p = e.position;
        for (let i = 0; i < this.movingLootCount; i++) {
            const slot = e.world.resolve(this.movingLoot[i]);
            if (slot >= 0) { p.previousX[slot] = p.x[slot]; p.previousZ[slot] = p.z[slot]; }
        }
        this.movingLootCount = 0;
        const nearby = e.queryNearby(Component.GroundItem, this.playerX, this.playerZ, this.stats.pickupRadius, false, true);
        for (let cursor = 0; cursor < nearby.count; cursor++) {
            const index = nearby.slots[cursor], id = this.entities.item.id[index];
            const dx = this.playerX - p.x[index], dz = this.playerZ - p.z[index], distance = Math.hypot(dx, dz);
            const travel = pickupTravel(distance, this.stats.pickupRadius);
            p.previousX[index] = p.x[index]; p.previousZ[index] = p.z[index];
            if (distance - travel > PICKUP_ARRIVAL) {
                p.x[index] += dx / distance * travel; p.z[index] += dz / distance * travel;
                e.updateSpatial(index, Component.GroundItem); this.movingLoot[this.movingLootCount++] = e.world.ids[index];
                continue;
            }
            const item = this.rewards.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            const clear = this.shouldAutoRecycle(item);
            if (!this.storeInventoryItem(item)) { this.notifyInventoryFull(item.type); continue; }
            this.rewards.groundItems.delete(id);
            this.entities.remove(index);
            if (this.challenge) this.challengeRevisionValue++;
            this.inventoryFullNotified = false;
            if (!clear) this.pushNotice("loot", `拾取 ${item.name}`, item.type === "equipment" ? item.id : undefined);
            this.markChanged();
        }
    }

    private readonly consumeCombatEvent: CombatEventConsumer = (events, i) => {
        combatFeedback(this.entities, events, i);
        if (events.kind[i] === CombatEventKind.Defeat) {
            if (events.player[i]) { this.gameOverValue = true; this.pushNotice("danger", this.challenge ? "挑战暂止，击杀进度已保留" : "你倒在了荒原上"); }
            else this.rewards.grant(events, i, this.random, 1 + this.stats.goldBonus + this.orbBonuses.goldBonus, this.lootProfile, this.challenge ? CHALLENGE_ARENA.experience : 1);
            if (this.challenge) { this.challengeRevisionValue++; this.refreshChests(); }
        }
        this.markChanged();
    };

    private gainExperience(amount: number): void {
        this.experience += amount * (1 + this.stats.experienceBonus);
        let levels = 0;
        while (this.experience >= experienceForLevel(this.level)) {
            this.experience -= experienceForLevel(this.level);
            this.level += 1;
            this.unspentAttributePoints += 2;
            this.skills.points += GAME_CONFIG.skills.pointsPerLevel;
            levels += 1;
        }
        if (levels > 0) {
            this.recalculateStats(true);
            this.pushNotice("level", `等级提升至 ${this.level} · 获得 ${levels * 2} 点属性`);
        }
        this.markChanged();
    }

    private teleportError(x: number, z: number): string | undefined {
        if (!this.exploration.allows(x, z, this.level, this.world)) return "目标仍被迷雾笼罩，请先步行探索或提升等级";
        if (this.world.regionAt(x, z).level > this.level && this.tickValue < this.teleportReadyAt) return `越级传送冷却中 · ${((this.teleportReadyAt - this.tickValue) / GAME_CONFIG.timing.simulationHz).toFixed(1)} 秒（暂停时冻结）`;
        return undefined;
    }

    private captureChallenges(): ChallengeProgressMap {
        return this.challenge ? { ...this.challenges, [this.challenge.id]: this.challenge.capture(this.playerX, this.playerZ) } : this.challenges;
    }

    private openChallengeChest(): void {
        const run = this.challenge!;
        if (!run.cleared || run.claimed || Math.hypot(this.playerX - CHALLENGE_ARENA.x, this.playerZ - CHALLENGE_ARENA.z) > .95) return;
        const random = this.random.clone();
        const item = generateEquipment(random, this.rewards.nextItemId, this.currentRegion.level, { ...this.lootProfile, stars: [0, 0, 1] }, "rainbow");
        // The guaranteed prize enters the bag even when automatic recycling includes rainbow equipment.
        const inventory = insertInventoryItem(this.inventory, item);
        if (!inventory) { this.notifyInventoryFull("equipment"); return; }
        this.inventory = inventory; this.random = random; this.rewards.nextItemId++;
        run.claimed = true; this.openedChests++; this.challengeRevisionValue++; this.inventoryFullNotified = false;
        this.pushNotice("loot", `挑战通关 · 获得三星彩装 ${item.name}`, item.id); this.refreshChests(); this.markChanged();
    }

    private calculateStats(): DerivedStats {
        return deriveStats(this.level, this.attributes, sumEquipment(this.equipped));
    }

    private shouldAutoRecycle(item: InventoryItem): boolean {
        const maximum = this.autoRecycle[item.type];
        return maximum !== null && RARITIES.indexOf(item.rarity) <= RARITIES.indexOf(maximum)
            && (item.type !== "equipment" || this.canClearEquipment(item));
    }

    private canClearEquipment(item: InventoryItem): boolean {
        return item.type === "equipment" && compareEquipment(item, {
            level: this.level, attributes: this.attributes, equipment: this.equipped, stats: this.stats
        }).canClear;
    }

    private storeInventoryItem(item: InventoryItem): boolean {
        if (this.shouldAutoRecycle(item)) { this.applyAutoRecycle(item); return true; }
        const next = insertInventoryItem(this.inventory, item);
        if (!next) return false;
        this.inventory = next;
        return true;
    }

    private recycleInventory(): void {
        if (!Object.values(this.autoRecycle).some(value => value !== null)) return;
        const before = this.inventory.length;
        this.inventory = this.inventory.filter(item => {
            if (!this.shouldAutoRecycle(item)) return true;
            this.applyAutoRecycle(item); return false;
        });
        if (this.inventory.length < before) this.inventoryFullNotified = false;
    }

    private applyAutoRecycle(item: InventoryItem): void {
        const reward = recycleReward(item);
        this.rewards.gold += reward.gold; this.orbDust += reward.dust;
        this.recycled[item.type] += item.size;
    }

    private recalculateStats(healGrowth: boolean): void {
        const previousMaximum = this.stats.maxHealth;
        const previousMana = this.stats.maxMana;
        this.stats = this.calculateStats();
        this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        // Preserve health ratio when switching gear: low-health swaps cannot manufacture healing.
        this.health = Math.min(this.stats.maxHealth, (previousMaximum === this.stats.maxHealth ? this.health : this.health / previousMaximum * this.stats.maxHealth)
            + (healGrowth ? this.stats.maxHealth * 0.12 * (1 + this.stats.regenBonus) : 0));
        this.mana = this.mana / previousMana * this.stats.maxMana;
        this.recycleInventory();
    }

    private pushNotice(tone: CombatNotice["tone"], message: string, acquiredEquipmentId?: number): void {
        this.notices.push(Object.freeze({ id: this.nextNoticeId++, tone, message, acquiredEquipmentId }));
    }

    private markChanged(): void {
        this.revision += 1;
        this.cachedSnapshot = undefined;
    }
}

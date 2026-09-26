import { enemyName } from "./EnemyDefinitions";
import { CombatResolution } from "./CombatResolution";
import { CombatRewards } from "./CombatRewards";
import { CharacterState } from "./CharacterState";
import { CombatEventKind, type CombatEventConsumer } from "./CombatEvents";
import { combatFeedback } from "./CombatFeedback";
import { ATTRIBUTE_IDS, generateEquipment, type AttributeId, type EquippedItems } from "./Equipment";
import { DeterministicRandom } from "./DeterministicRandom";
import { COMBAT_STEP_MS } from "./FixedStepClock";
import { rollAttack, type DerivedStats } from "./CombatStats";
import {
    RegionalWorld, MAX_COMBAT_CHUNKS,
    REGION_RULES, CHEST_RULES, CHEST_TIERS, type RegionInfo
} from "./RegionalWorld";
import { RARITIES, type Rarity } from "./Loot";
import { generateOrb } from "./Orbs";
import { EMPTY_SPIRIT_REALM, type SpiritRealm } from "./SpiritRealm";
import type { CraftOperation } from "./Crafting";
import { generateConsumable, type InventoryItem, type ConsumableEffect } from "./InventoryItem";
import type { ItemType } from "./ItemDefinition";
import { OPEN_TERRAIN, type CombatTerrain } from "./CombatTerrain";
import { EMPTY_RECYCLING } from "./Recycling";
import { GAME_CONFIG, ticksPerUpdate } from "./GameConfig";

import { CombatWorld, Component, Faction } from "./CombatWorld";
import { EnemyBehavior } from "./EnemyBehavior";
import { PlayerAutoCombat } from "./PlayerAutoCombat";
import type { ProjectileExecutor } from "./ProjectileBatch";
import { advanceProjectiles, moveEnemies, advanceEnemyActions } from "./CombatSystems";
import { SkillSystem } from "./SkillSystem";
import type { SkillId } from "./Skills";
import type { PassiveId } from "./PassiveSkills";
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
const PASSIVE_PICKUP_TICKS = ticksPerUpdate(GAME_CONFIG.skills.passivePickupHz);
type MutablePlayerRenderState = { -readonly [Key in keyof PlayerRenderState]: PlayerRenderState[Key] };
class ChestPool implements ChestRenderBuffer {
    public count = 0;
    public readonly tiers = new Uint8Array(MAX_COMBAT_CHUNKS);
    public readonly x = new Float64Array(MAX_COMBAT_CHUNKS);
    public readonly z = new Float64Array(MAX_COMBAT_CHUNKS);
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
    private initialized = false;
    private movementX = 0;
    private movementZ = 0;
    private closed = false;
    private random: DeterministicRandom;
    private readonly entities: CombatWorld;
    private readonly behavior: EnemyBehavior;
    private readonly autoCombat: PlayerAutoCombat;
    private readonly skills: SkillSystem;
    private readonly settleOngoing = () => this.resolveImpacts();
    private readonly resolution: CombatResolution;
    private readonly rewards: CombatRewards;
    private readonly character: CharacterState;
    private get stats(): DerivedStats { return this.character.stats; }
    private get level(): number { return this.character.level; }
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
    private tickValue = 0;
    private revision = 0;
    private nextNoticeId = 1;
    private notices: CombatNotice[] = [];
    private cachedSnapshot: CombatSnapshot | undefined;
    private attackCooldown = 0;
    private potionCooldown = 0;
    private autoCast = true;
    private openedChests = 0;
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
    private gameOverValue = false;
    private readonly playerRenderState: MutablePlayerRenderState = {
        entitySlot: 0,
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
        terrain: CombatTerrain = OPEN_TERRAIN, private readonly location: WorldLocation = "wilds", private characterId = String(seed),
        private readonly yieldWorld?: () => Promise<void>) {
        validatePosition(start.x, start.z);
        this.wildsPosition = { ...start };
        this.random = new DeterministicRandom(`${String(seed)}:combat`);
        this.world = new RegionalWorld(seed, start, terrain, Boolean(yieldWorld));
        this.entities = new CombatWorld(start.x, start.z, terrain);
        this.playerRenderState.entitySlot = this.entities.player;
        this.resolution = new CombatResolution(this.entities);
        this.behavior = new EnemyBehavior(this.entities, isChallenge(location) ? { residencyAt: () => "near" } : this.world);
        this.skills = new SkillSystem(this.entities);
        this.autoCombat = new PlayerAutoCombat(this.entities, this.chests, () => this.useConsumable("health"), location === "wilds" ? this.world : undefined);
        const simulation = this;
        this.character = new CharacterState(spiritRealm, {
            get tick() { return simulation.tickValue; },
            get automatic() { return simulation.autoCombat.enabled; },
            get passiveEffects() { return simulation.skills.passiveEffects; },
            statsChanged: (previous, next, healGrowth) => this.applyCharacterStats(previous, next, healGrowth),
            addSkillPoints: points => { this.skills.points += points; },
            notify: (tone, message, itemId) => this.pushNotice(tone, message, itemId),
            changed: () => this.markChanged()
        });
        this.rewards = new CombatRewards(this.entities, this.character, seed);
        this.renderState = { combatText: this.entities.combatText.buffer, player: this.playerRenderState, chests: this.chests, effects: this.entities.effects.buffer, fireProjectiles: this.skills.fireProjectiles,
            entities: { ids: this.entities.world.ids, enemies: this.entities.enemies, projectiles: this.entities.projectiles,
                experience: this.entities.experience, loot: this.entities.loot, position: this.entities.position,
                vitals: this.entities.vitals, enemy: this.entities.enemy, action: this.entities.action,
                projectile: this.entities.projectile, status: this.entities.status, experienceValue: this.entities.experienceValue, item: this.entities.item } };
        this.currentRegion = this.world.regionAt(start.x, start.z);
        this.nearbyRegions = location === "wilds" ? this.world.nearbyRegions(this.currentRegion) : [];
        const position = location === "homestead" ? HOMESTEAD.spawn : isChallenge(location) ? CHALLENGE_SPAWN : start;
        this.playerX = this.previousPlayerX = position.x;
        this.playerZ = this.previousPlayerZ = position.z;
        this.health = this.entities.vitals.maxHealth[this.entities.player] = this.stats.maxHealth;
        this.mana = this.stats.maxMana;
        this.initialized = !yieldWorld || location !== "wilds";
        if (location === "wilds" && this.initialized) {
            this.exploration.discover(start.x, start.z);
            this.world.synchronize(start.x, start.z);
            this.world.updateAccess(start.x, start.z);
            this.spawnEnemies(); this.refreshChests();
        }
    }

    /** The Worker owns the instance before awaiting preparation, so disposal cancels pending generation. */
    public async initialize(checkpoint?: CharacterCheckpoint): Promise<void> {
        if (this.closed || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required work");
        const state = checkpoint && validateCharacterCheckpoint(checkpoint);
        if (state && (state.seed !== String(this.seed) || state.location !== this.location
            || state.origin.x !== this.start.x || state.origin.z !== this.start.z)) throw new Error("角色存档世界或位置无效");
        this.awaitingQueries = true;
        try {
            if (this.yieldWorld && this.location === "wilds") {
                const point = state?.player ?? this.start;
                await this.world.prepareRequired(point.x, point.z, this.yieldWorld);
                if (this.closed) throw new Error("Simulation closed during world preparation");
            }
            if (state) this.restoreState(state);
            else if (!this.initialized) {
                this.exploration.discover(this.start.x, this.start.z);
                this.world.synchronize(this.start.x, this.start.z);
                this.world.updateAccess(this.start.x, this.start.z);
                this.spawnEnemies(); this.refreshChests();
                this.cachedSnapshot = undefined;
            }
            this.initialized = true;
        } catch (error) { this.dispose(); throw error; }
        finally { this.awaitingQueries = false; }
    }

    public get tick(): number { return this.tickValue; }
    public get gameOver(): boolean { return this.gameOverValue; }
    public get spiritProgress(): SpiritRealm { return this.character.spiritRealm; }
    public get explorationSnapshot() { return this.exploration.snapshot; }
    public get challengeRevision(): number { return this.challengeRevisionValue; }
    public checkpoint(destination: WorldLocation = this.location, point?: { x: number; z: number }, targetTerrain?: CombatTerrain, recoverDefeat = false): CharacterCheckpoint {
        if ((this.gameOverValue && !recoverDefeat) || this.closed || !this.initialized || this.awaitingQueries) throw new Error("当前角色状态不可保存");
        const { stats: _stats, skills: _skills, passiveBonuses: _passiveBonuses, battlePower: _power, equipmentPower: _equipmentPower, lootProfile: _loot, orbResonance: _resonance, experienceToLevel: _nextLevel, ...player } = this.getSnapshot().player;
        const wildsPosition = this.location === "wilds" ? { x: this.playerX, z: this.playerZ } : { ...this.wildsPosition };
        const travelling = destination !== this.location, skills = this.skills.checkpoint(this.tickValue);
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
        return validateCharacterCheckpoint({ version: 10, characterId: this.characterId, challenges, challengeRevision, teleportReadyAt, seed: String(this.seed), origin: { ...this.start },
            location: destination, wildsPosition, exploration: this.exploration.snapshot,
            player: travelling || point || recovering ? { ...player, inventory, ...position, ...(destination === "homestead" || recovering ? { health: this.stats.maxHealth, mana: this.stats.maxMana } : {}) } : player,
            tick: this.tickValue, kills: this.rewards.kills, openedChests: this.openedChests, nextItemId: this.character.nextItemId, random: this.random.state,
            attackCooldown: this.attackCooldown, damageImmunity: this.resolution.damageImmunity,
            skills: travelling || recovering ? { ...skills, dashUntil: 0, dashX: 0, dashZ: 0 } : skills });
    }
    public restore(checkpoint: CharacterCheckpoint): void {
        if (this.closed || this.awaitingQueries || this.yieldWorld) throw new Error("Restore requires an idle immediate simulation; use initialize for scheduled loading");
        this.restoreState(checkpoint);
    }
    private restoreState(checkpoint: CharacterCheckpoint): void {
        const state = validateCharacterCheckpoint(checkpoint), p = state.player;
        if (state.seed !== String(this.seed) || state.location !== this.location || state.origin.x !== this.start.x || state.origin.z !== this.start.z
            || !this.entities.terrain.isClear(p.x, p.z, GAME_CONFIG.combat.playerRadius)) throw new Error("角色存档世界或位置无效");
        this.exploration = new Exploration(state.exploration); this.wildsPosition = { ...state.wildsPosition };
        this.characterId = state.characterId; this.challenges = state.challenges; this.challengeRevisionValue = state.challengeRevision; this.teleportReadyAt = state.teleportReadyAt;
        this.autoCast = p.autoCast;
        this.tickValue = state.tick; this.rewards.kills = state.kills; this.openedChests = state.openedChests;
        this.random.restore(state.random); this.skills.restore(state.skills, state.tick); this.attackCooldown = state.attackCooldown; this.resolution.damageImmunity = state.damageImmunity;
        this.movementX = this.movementZ = 0;
        this.resolution.shieldCooldown = p.shieldRemaining; this.potionCooldown = p.potionRemaining;
        this.autoCombat.setEnabled(false);
        this.character.restore(p, state.nextItemId);
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
    public dispose(): void {
        if (this.closed) return;
        this.closed = true; this.autoCombat.setEnabled(false); this.character.clearReceipts();
        this.world.dispose();
        this.entities.terrain.dispose();
    }

    public teleport(x: number, z: number): void {
        if (this.yieldWorld) throw new Error("Scheduled simulations require asynchronous teleportation");
        if (this.canTeleport(x, z)) this.commitTeleport(x, z);
    }
    public async teleportAsync(x: number, z: number): Promise<void> {
        if (!this.canTeleport(x, z)) return;
        this.awaitingQueries = true;
        try {
            if (this.yieldWorld && this.location === "wilds") await this.world.prepareRequired(x, z, this.yieldWorld);
            if (this.closed) throw new Error("Simulation closed during teleport preparation");
            this.commitTeleport(x, z);
        } catch (error) { this.dispose(); throw error; }
        finally { this.awaitingQueries = false; }
    }
    private canTeleport(x: number, z: number): boolean {
        validatePosition(x, z);
        if (this.closed || !this.initialized || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required work");
        if (this.gameOverValue) return false;
        const error = this.location === "wilds" ? this.teleportError(x, z) : undefined;
        if (error) { this.pushNotice("info", error); return false; }
        if (!this.entities.terrain.isClear(x, z, GAME_CONFIG.combat.playerRadius)) {
            this.pushNotice("info", "目标位置无法落脚，请选择平坦陆地"); return false;
        }
        return true;
    }
    private commitTeleport(x: number, z: number): void {
        if (this.location === "wilds") this.exploration.discover(x, z);
        if (this.location === "wilds" && this.world.regionAt(x, z).level > this.level) this.teleportReadyAt = this.tickValue + GAME_CONFIG.timing.simulationHz * 5;
        this.playerX = this.previousPlayerX = x; this.playerZ = this.previousPlayerZ = z;
        this.movementX = this.movementZ = 0;
        this.skills.cancelTravel();
        this.autoCombat.setEnabled(false);
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
        if (this.closed || !this.initialized || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required queries");
        if (this.yieldWorld && !executor) throw new Error("Scheduled simulations require an asynchronous step executor");
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
        this.resolution.advanceBurns(this.tickValue, this.stats, this.consumeCombatEvent);
        if (this.gameOverValue) return executor ? Promise.resolve() : undefined;
        this.potionCooldown = Math.max(0, this.potionCooldown - STEP_SECONDS);
        this.entities.effects.advance(this.tickValue); this.entities.combatText.advance(this.tickValue);
        const movement = this.autoCombat.update(input, this.tickValue, this.stats, this.movementX, this.movementZ, this.skills.holding(this.tickValue) && !this.skills.mobile);
        this.skills.advanceCasting(this.tickValue, this.random, movement.active && (input.active && !this.skills.mobile || this.autoCombat.activity === "evade"), this.settleOngoing);
        if (this.gameOverValue) return executor ? Promise.resolve() : undefined;
        if (!this.skills.advance(this.tickValue)) {
            if (this.skills.holding(this.tickValue) && !this.skills.mobile || !this.entities.status.canMove(this.entities.player, this.tickValue)) this.movementX = this.movementZ = 0;
            else this.movePlayer(movement);
        }
        if (this.location === "homestead") {
            this.skills.advanceOngoing(this.tickValue, this.random, this.settleOngoing);
            if (this.tickValue % REGENERATION_TICKS === 0) this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen);
            return executor ? Promise.resolve() : undefined;
        }
        if (executor) return this.finishAsyncStep(executor, input.active);
        this.commitMovementWorld();
        advanceProjectiles(this.entities);
        this.finishStep(input.active);
        this.prepareAhead();
    }

    private commitMovementWorld(): void {
        if (this.location === "wilds") {
            if (this.playerX !== this.previousPlayerX || this.playerZ !== this.previousPlayerZ) this.exploration.discover(this.playerX, this.playerZ);
            const shifted = this.world.synchronize(this.playerX, this.playerZ);
            if (shifted) this.reconcileRegions();
            if (this.world.updateAccess(this.playerX, this.playerZ)) { this.spawnEnemies(); this.refreshChests(); }
            this.updateCurrentRegion();
        }
        this.fireWeapon();
    }
    private prepareAhead(): boolean {
        return this.location === "wilds" && this.world.prepareAhead(this.playerX, this.playerZ,
            this.playerX - this.previousPlayerX, this.playerZ - this.previousPlayerZ);
    }

    private async finishAsyncStep(executor: ProjectileExecutor, manualMovement: boolean): Promise<void> {
        this.awaitingQueries = true;
        try {
            if (this.yieldWorld && this.location === "wilds") await this.world.prepareRequired(this.playerX, this.playerZ, this.yieldWorld);
            if (this.closed) throw new Error("Simulation closed during world preparation");
            this.commitMovementWorld();
            await advanceProjectiles(this.entities, executor);
            if (this.closed) throw new Error("Simulation closed during required queries");
            this.finishStep(manualMovement);
            if (this.prepareAhead() && this.yieldWorld) {
                await this.yieldWorld();
                if (this.closed) throw new Error("Simulation closed during world preparation");
            }
        } catch (error) {
            this.dispose();
            throw error;
        } finally { this.awaitingQueries = false; }
    }

    private finishStep(manualMovement: boolean): void {
        this.resolveImpacts();
        if (this.gameOverValue) return;
        this.skills.advanceOngoing(this.tickValue, this.random, this.settleOngoing);
        if (this.autoCast && !this.skills.busy(this.tickValue) && this.tickValue % AUTO_SKILL_TICKS === 0) {
            const stop = !manualMovement && this.autoCombat.canStopToCast;
            if (this.autoCombat.activity !== "evade" || stop) {
                const stationary = !manualMovement && (stop || Math.hypot(this.movementX, this.movementZ) < .05);
                this.skills.castAutomatic(this.tickValue, this.stats, this.level, this.random, stationary);
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
        const player: PlayerSnapshot = Object.freeze({
            ...this.character.snapshot(),
            heading: this.heading, x: this.playerX, z: this.playerZ, health: this.health, mana: this.mana,
            shieldRemaining: this.resolution.shieldCooldown,
            skills: this.skills.snapshot(this.tickValue), passiveBonuses: this.skills.passiveEffects.bonuses,
            potionRemaining: this.potionCooldown, autoCast: this.autoCast
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
            autoCombat: Object.freeze({ enabled: this.autoCombat.enabled, activity: this.autoCombat.activity }),
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
        return this.character.allocateAttribute(attribute);
    }

    public equip(itemId: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        return this.character.equip(itemId);
    }

    public sortInventory(): void {
        if (!this.gameOverValue) this.character.sortInventory();
    }

    public setAutoRecycle(type: ItemType, maximum: Rarity | null): void {
        if (!Object.hasOwn(EMPTY_RECYCLING, type)) throw new RangeError("Unknown recycling category");
        if (maximum !== null && !RARITIES.includes(maximum)) throw new RangeError("Unknown cleanup quality");
        if (!this.gameOverValue) this.character.setAutoRecycle(type, maximum);
    }

    public mergeConsumables(): void {
        if (!this.gameOverValue) this.character.mergeConsumables();
    }

    public setEquipmentLock(itemId: number, locked: boolean): void {
        if (!this.gameOverValue) this.character.setEquipmentLock(itemId, locked);
    }

    public craft(operation: CraftOperation): void {
        if (!this.gameOverValue) this.character.craft(operation);
    }

    public cultivateSpirit(attribute: AttributeId): void {
        if (!ATTRIBUTE_IDS.includes(attribute)) throw new RangeError("Unknown spirit attribute");
        if (!this.gameOverValue) this.character.cultivateSpirit(attribute);
    }

    public equipOrb(itemId: number, socket: number): { readonly ok: boolean; readonly message: string } {
        if (this.gameOverValue) return { ok: false, message: "战斗已结束" };
        return this.character.equipOrb(itemId, socket);
    }

    public unequip(slot: keyof EquippedItems): void {
        if (!this.gameOverValue) this.character.unequip(slot);
    }

    public removeOrb(socket: number): void {
        if (!this.gameOverValue) this.character.removeOrb(socket);
    }

    public toggleAutoCast(): void {
        if (this.gameOverValue) return;
        this.autoCast = !this.autoCast;
        this.markChanged();
    }

    public toggleAutoCombat(): void {
        if (this.closed || this.awaitingQueries) throw new Error("Simulation is closed or awaiting required queries");
        if (this.gameOverValue || this.location === "homestead") return;
        this.autoCombat.setEnabled(!this.autoCombat.enabled);
        this.character.updateAutomaticLoadout();
        this.movementX = this.movementZ = 0;
        this.markChanged();
    }

    public castSkill(id: SkillId): void {
        if (this.gameOverValue) return;
        if (this.skills.cast(id, this.tickValue, this.stats, this.level, this.random)) { this.resolveImpacts(); this.markChanged(); }
    }

    public equipSkill(id: SkillId, slot: number): void {
        if (!this.gameOverValue && this.skills.equip(id, slot, this.level)) this.markChanged();
    }

    public equipPassive(id: PassiveId | null, slot: number): void {
        if (this.gameOverValue || this.closed) return;
        if (this.location !== "homestead" || this.skills.snapshot(this.tickValue).refundBlocked) {
            this.pushNotice("danger", "请回家园并等待施法结束，再装卸常驻被动"); this.markChanged(); return;
        }
        if (!this.skills.equipPassive(id, slot, this.level)) {
            this.pushNotice("danger", "被动尚未学习或槽位尚未解锁"); this.markChanged(); return;
        }
        this.character.refreshPassives();
        this.markChanged();
    }

    public commitSkillBuild(ranks: readonly number[], revision: number): void {
        if (this.gameOverValue) return;
        const reason = this.skills.commitBuild(ranks, revision, this.level, this.location === "homestead", this.tickValue);
        if (!reason) {
            this.character.refreshPassives();
        }
        this.pushNotice(reason ? "danger" : "info", reason ?? "技能构筑已应用"); this.markChanged();
    }

    public useConsumable(effect: ConsumableEffect, itemId?: number): void {
        if (this.gameOverValue || this.potionCooldown > 0) return;
        const recovery = this.character.consumePotion(effect, { health: this.health, mana: this.mana, stats: this.stats }, itemId);
        if (!recovery) return;
        this.health = Math.min(this.stats.maxHealth, this.health + recovery.health);
        this.mana = Math.min(this.stats.maxMana, this.mana + recovery.mana);
        this.potionCooldown = CONSUMABLE_COOLDOWN;
        this.markChanged();
    }

    private movePlayer(input: MovementInput): void {
        const length = Math.max(1, Math.hypot(input.x, input.z));
        const speed = input.active ? this.stats.moveSpeed * this.entities.status.slowScale[this.entities.player] / length : 0;
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
        this.character.clearReceipts();
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
            let nextId = this.character.nextItemId;
            const item = generateEquipment(random, nextId++, chest.region.level, this.character.lootProfile, rules.rarity);
            const rewards: InventoryItem[] = [item, generateConsumable(random, nextId++, rules.rarity)];
            if (chest.hasOrb) rewards.push(generateOrb(random, nextId++, rules.rarity));
            const gold = Math.round(rules.gold * (1 + this.stats.goldBonus + this.character.orbResonance.goldBonus));
            if (!this.character.receiveGenerated(rewards, nextId, gold, 0, chest)) break chestLoop;
            const clearEquipment = !this.character.retainsEquipment(item);
            this.random = random;
            chunk.chestOpened = true;
            this.openedChests += 1;
            this.character.resetCapacityNotice();
            this.pushNotice("loot", rules.name + " · " + (clearEquipment ? "较弱装备已售出" : item.name), clearEquipment ? undefined : item.id);
            this.markChanged();
            this.refreshChests();
            break;
        }
    }

    private fireWeapon(): void {
        const remaining = this.attackCooldown - STEP_SECONDS;
        // Retain sub-tick cadence only on a successful shot, never debt accumulated while casting/controlled.
        this.attackCooldown = Math.max(0, remaining);
        if (this.skills.busy(this.tickValue) || !this.entities.status.canAct(this.entities.player, this.tickValue)) return;
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
        )) this.attackCooldown = Math.max(0, remaining + 1 / this.stats.attackRate);
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
        const all = this.skills.passiveEffects.collectAll && this.tickValue % PASSIVE_PICKUP_TICKS === 0;
        const nearby = all ? e.experience : e.queryNearby(Component.Experience, this.playerX, this.playerZ, this.stats.pickupRadius, false, true);
        const count = nearby.count; let collected = 0;
        for (let cursor = 0; cursor < count; cursor++) {
            if (all && collected === GAME_CONFIG.skills.passivePickupBatch) break;
            // Dense authority lists remove by swap; backwards traversal keeps remaining slots valid.
            const index = nearby.slots[all ? count - 1 - cursor : cursor];
            const x = e.position.x[index], z = e.position.z[index];
            e.position.previousX[index] = x; e.position.previousZ[index] = z;
            const dx = this.playerX - x, dz = this.playerZ - z, distance = Math.hypot(dx, dz);
            const travel = all ? 0 : pickupTravel(distance, this.stats.pickupRadius);
            if (all || distance - travel <= PICKUP_ARRIVAL) {
                this.character.gainExperience(e.experienceValue[index]); e.remove(index); collected++;
                if (this.challenge) this.challengeRevisionValue++;
            } else {
                e.position.x[index] += dx / distance * travel; e.position.z[index] += dz / distance * travel;
                e.updateSpatial(index, Component.Experience);
                this.movingExperience[this.movingExperienceCount++] = e.world.ids[index];
            }
        }
    }

    private passiveLootCursor = 0;
    private collectEquipment(): void {
        const e = this.entities, p = e.position;
        for (let i = 0; i < this.movingLootCount; i++) {
            const slot = e.world.resolve(this.movingLoot[i]);
            if (slot >= 0) { p.previousX[slot] = p.x[slot]; p.previousZ[slot] = p.z[slot]; }
        }
        this.movingLootCount = 0;
        const all = this.skills.passiveEffects.collectAll && this.tickValue % PASSIVE_PICKUP_TICKS === 0;
        const nearby = all ? e.loot : e.queryNearby(Component.GroundItem, this.playerX, this.playerZ, this.stats.pickupRadius, false, true);
        const count = nearby.count;
        for (let cursor = 0; cursor < count; cursor++) {
            if (all && cursor === GAME_CONFIG.skills.passivePickupBatch) break;
            // Bound attempts even with a full bag. A rotating dense index prevents failed items starving others.
            if (all) this.passiveLootCursor %= nearby.count;
            const index = nearby.slots[all ? this.passiveLootCursor : cursor], id = this.entities.item.id[index];
            const dx = this.playerX - p.x[index], dz = this.playerZ - p.z[index], distance = Math.hypot(dx, dz);
            const travel = all ? 0 : pickupTravel(distance, this.stats.pickupRadius);
            p.previousX[index] = p.x[index]; p.previousZ[index] = p.z[index];
            if (!all && distance - travel > PICKUP_ARRIVAL) {
                p.x[index] += dx / distance * travel; p.z[index] += dz / distance * travel;
                e.updateSpatial(index, Component.GroundItem); this.movingLoot[this.movingLootCount++] = e.world.ids[index];
                continue;
            }
            const item = this.rewards.groundItems.get(id);
            if (!item) throw new Error(`Ground equipment ${id} is missing`);
            const recycled = this.character.recycledCount(item.type);
            if (!this.character.receiveItems([item], 0, item)) { if (all) this.passiveLootCursor++; continue; }
            this.rewards.groundItems.delete(id);
            this.entities.remove(index);
            if (this.challenge) this.challengeRevisionValue++;
            this.character.resetCapacityNotice();
            if (this.character.recycledCount(item.type) === recycled || item.type === "equipment" && this.character.wearsEquipment(item)) {
                this.pushNotice("loot", `拾取 ${item.name}`, item.type === "equipment" ? item.id : undefined);
            }
            this.markChanged();
        }
    }

    private readonly consumeCombatEvent: CombatEventConsumer = (events, i) => {
        combatFeedback(this.entities, events, i);
        if (events.kind[i] === CombatEventKind.Defeat) {
            if (events.player[i]) { this.autoCombat.setEnabled(false); this.skills.cancelTravel(); this.entities.status.clear(this.entities.player); }
            if (events.player[i]) { this.gameOverValue = true; this.pushNotice("danger", this.challenge ? "挑战暂止，击杀进度已保留" : "你倒在了荒原上"); }
            else this.rewards.grant(events, i, this.random, 1 + this.stats.goldBonus + this.character.orbResonance.goldBonus, this.character.lootProfile, this.challenge ? CHALLENGE_ARENA.experience : 1);
            if (this.challenge) { this.challengeRevisionValue++; this.refreshChests(); }
        }
        this.markChanged();
    };

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
        const item = generateEquipment(random, this.character.nextItemId, this.currentRegion.level, { ...this.character.lootProfile, stars: [0, 0, 1] }, "rainbow");
        // The guaranteed prize must be retained, whether in the bag or automatically equipped.
        if (!this.character.receiveGenerated([item], this.character.nextItemId + 1, 0, item.id, run)) return;
        this.random = random;
        run.claimed = true; this.openedChests++; this.challengeRevisionValue++; this.character.resetCapacityNotice();
        this.pushNotice("loot", `挑战通关 · 获得三星彩装 ${item.name}`, item.id); this.refreshChests(); this.markChanged();
    }

    private applyCharacterStats(previous: DerivedStats, next: DerivedStats, healGrowth: boolean): void {
        this.entities.vitals.maxHealth[this.entities.player] = next.maxHealth;
        // Preserve health ratio when switching gear: low-health swaps cannot manufacture healing.
        this.health = Math.min(next.maxHealth, (previous.maxHealth === next.maxHealth ? this.health : this.health / previous.maxHealth * next.maxHealth)
            + (healGrowth ? next.maxHealth * 0.12 * (1 + next.regenBonus) : 0));
        this.mana = this.mana / previous.maxMana * next.maxMana;
    }

    private pushNotice(tone: CombatNotice["tone"], message: string, acquiredEquipmentId?: number): void {
        this.notices.push(Object.freeze({ id: this.nextNoticeId++, tone, message, acquiredEquipmentId }));
    }

    private markChanged(): void {
        this.revision += 1;
        this.cachedSnapshot = undefined;
    }
}

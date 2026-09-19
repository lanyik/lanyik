import { ATTRIBUTE_IDS, BONUS_IDS, EQUIPMENT_SLOTS } from "./Equipment";
import type { PlayerSnapshot } from "./CombatState";
import { GAME_CONFIG } from "./GameConfig";
import { POTION_RARITIES, POTION_TYPES, type InventoryItem } from "./InventoryItem";
import { RARITIES } from "./Loot";
import { SKILL_IDS } from "./Skills";
import type { SkillCheckpoint } from "./SkillSystem";
import { validateSpiritRealm } from "./SpiritRealm";
import { validateExploration, type ExplorationSnapshot } from "./Exploration";
import type { WorldLocation } from "./Homestead";
import { CHALLENGE_IDS, CHALLENGE_ARENA, ChallengeTerrain, challengeSpawns, isChallenge, type ChallengeProgressMap } from "./BossChallenge";
import { ENEMY_DEFINITIONS, enemyStats } from "./EnemyDefinitions";

export interface CharacterCheckpoint {
    readonly version: 4;
    readonly characterId: string;
    readonly challengeRevision: number;
    readonly challenges: ChallengeProgressMap;
    readonly teleportReadyAt: number;
    readonly location: WorldLocation;
    readonly wildsPosition: { readonly x: number; readonly z: number };
    readonly exploration: ExplorationSnapshot;
    readonly seed: string;
    readonly origin: { readonly x: number; readonly z: number };
    readonly tick: number;
    readonly kills: number;
    readonly openedChests: number;
    readonly nextItemId: number;
    readonly random: number;
    readonly attackCooldown: number;
    readonly damageImmunity: number;
    readonly skills: SkillCheckpoint;
    readonly player: Pick<PlayerSnapshot, "x" | "z" | "heading" | "health" | "mana" | "level" | "experience" | "unspentAttributePoints" | "gold" | "orbDust" | "equipment" | "inventory" | "orbs" | "attributes" | "spiritRealm" | "autoRecycle" | "recycled" | "autoCast" | "potionRemaining" | "shieldRemaining">;
}

const integer = (value: number, min = 0) => Number.isSafeInteger(value) && value >= min;
const finite = (value: number, min = 0) => Number.isFinite(value) && value >= min;
function assertItem(item: InventoryItem): void {
    if (!item || !Object.hasOwn(GAME_CONFIG.inventory, item.type) || !integer(item.id, 1) || !RARITIES.includes(item.rarity)
        || typeof item.name !== "string" || !item.name.length || item.name.length > 120 || !integer(item.size, 1)
        || item.size > GAME_CONFIG.inventory[item.type].stackSize) throw new Error("存档物品无效");
    if (item.type === "equipment") {
        if (!EQUIPMENT_SLOTS.includes(item.value) || !integer(item.itemLevel, 1) || !integer(item.stars) || item.stars > 4 || !integer(item.revision)
            || typeof item.locked !== "boolean" || !finite(item.score) || !item.baseBonuses || !item.bonuses
            || BONUS_IDS.some(id => !finite(item.baseBonuses[id]) || !finite(item.bonuses[id]))
            || !Array.isArray(item.affixes) || !item.affixes.length || item.affixes.length > 5
            || new Set(item.affixes.map(affix => affix.stat)).size !== item.affixes.length
            || item.affixes.some(affix => !BONUS_IDS.includes(affix.stat) || !finite(affix.value) || !RARITIES.includes(affix.rarity))) throw new Error("存档装备无效");
    } else if (item.type === "consumable") {
        if (!POTION_RARITIES.includes(item.rarity) || !POTION_TYPES.includes(item.value)) throw new Error("存档药剂无效");
    } else if (item.type === "affix") {
        if (!BONUS_IDS.includes(item.value) || !finite(item.amount)) throw new Error("存档词条无效");
    } else if (item.type === "scroll") {
        if (!isChallenge(item.value) || item.rarity !== "rainbow") throw new Error("存档副本卷轴无效");
    } else if (!["fortune", "bounty", "constellation", "harmony"].includes(item.value) || !item.ratings
        || !finite(item.ratings.quantity) || !finite(item.ratings.quality) || !finite(item.ratings.stars)) throw new Error("存档宝珠无效");
}

/** Reject invalid/currently unsupported saves before changing a running character. No migration. */
export function validateCharacterCheckpoint(value: CharacterCheckpoint): CharacterCheckpoint {
    if (!value || value.version !== 4) throw new Error("角色存档版本与当前游戏不一致");
    if (typeof value.characterId !== "string" || !value.characterId.length || value.characterId.length > 128 || !integer(value.challengeRevision)
        || !integer(value.teleportReadyAt) || value.teleportReadyAt > value.tick + GAME_CONFIG.timing.simulationHz * 5) throw new Error("角色传送进度无效");
    if ((!isChallenge(value.location) && !["wilds", "homestead"].includes(value.location)) || !value.wildsPosition
        || !Number.isFinite(value.wildsPosition.x) || !Number.isFinite(value.wildsPosition.z)) throw new Error("角色世界位置无效");
    validateExploration(value.exploration);
    const p = value.player, s = value.skills;
    if (typeof value.seed !== "string" || !value.seed.trim() || value.seed.length > 128 || !value.origin
        || !Number.isFinite(value.origin.x) || !Number.isFinite(value.origin.z) || !p || !s
        || !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.heading)
        || !finite(p.health, Number.MIN_VALUE) || !finite(p.mana) || !integer(p.level, 1) || !finite(p.experience)
        || !integer(p.unspentAttributePoints) || !integer(p.gold) || !integer(p.orbDust) || typeof p.autoCast !== "boolean"
        || !finite(p.potionRemaining) || !finite(p.shieldRemaining) || !finite(value.attackCooldown) || !finite(value.damageImmunity)
        || !integer(value.tick) || !integer(value.kills) || !integer(value.openedChests) || !integer(value.nextItemId, 2)
        || !integer(value.random, 1) || value.random > 0xffffffff) throw new Error("角色存档数值无效");
    validateSpiritRealm(p.spiritRealm);
    if (!p.attributes || ATTRIBUTE_IDS.some(id => !integer(p.attributes[id], 5 + p.spiritRealm.attributes[id]))
        || !p.autoRecycle || !p.recycled || Object.keys(GAME_CONFIG.inventory).some(key => {
            const type = key as keyof typeof GAME_CONFIG.inventory;
            return p.autoRecycle[type] !== null && !RARITIES.includes(p.autoRecycle[type]!) || !integer(p.recycled[type]);
        })) throw new Error("角色成长或回收设置无效");
    if (!Array.isArray(p.inventory) || !Array.isArray(p.orbs) || p.orbs.length !== 6 || !p.equipment
        || Object.keys(p.equipment).some(slot => !EQUIPMENT_SLOTS.includes(slot as typeof EQUIPMENT_SLOTS[number]))) throw new Error("角色背包无效");
    if (!value.challenges || typeof value.challenges !== "object" || Object.keys(value.challenges).some(id => !isChallenge(id))) throw new Error("副本记录无效");
    const terrain = new ChallengeTerrain();
    const point = (p: { x: number; z: number }) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && terrain.isClear(p.x, p.z, 0);
    for (const id of CHALLENGE_IDS) {
        const run = value.challenges[id];
        if (!run) continue;
        if (!integer(run.level, 1) || !integer(run.round, 1) || !point(run.position) || typeof run.claimed !== "boolean"
            || !Array.isArray(run.enemies) || run.enemies.length !== CHALLENGE_ARENA.population || run.enemies.some(enemy => !point(enemy) || !finite(enemy.health))
            || run.claimed && run.enemies.some(enemy => enemy.health > 0)
            || !Array.isArray(run.loot) || run.loot.length > GAME_CONFIG.combat.maxGroundEquipment || run.loot.some(drop => !point(drop))
            || !Array.isArray(run.experience) || run.experience.length > GAME_CONFIG.combat.maxExperienceOrbs || run.experience.some(orb => !point(orb) || !finite(orb.value))) throw new Error("副本战斗进度无效");
        if (!terrain.isClear(run.position.x, run.position.z, GAME_CONFIG.combat.playerRadius)) throw new Error("副本返回位置无效");
        const spawns = challengeSpawns(id, run.level);
        for (let i = 0; i < spawns.length; i++) {
            const enemy = run.enemies[i], spawn = spawns[i];
            const maximum = enemyStats(spawn.kind, run.level, 1, spawn.elite, spawn.boss).health * (spawn.boss ? CHALLENGE_ARENA.bossStrength : CHALLENGE_ARENA.normalStrength);
            const radius = ENEMY_DEFINITIONS[spawn.kind].radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1);
            if (enemy.health > maximum || enemy.health > 0 && !terrain.isClear(enemy.x, enemy.z, radius)) throw new Error("副本怪物状态无效");
        }
    }
    if (isChallenge(value.location) && !value.challenges[value.location]) throw new Error("副本尚未开启");
    const groundItems = Object.values(value.challenges).flatMap(run => run!.loot.map(drop => drop.item));
    const all = [...p.inventory, ...Object.values(p.equipment).filter(item => !!item), ...p.orbs.filter(item => !!item), ...groundItems];
    all.forEach(assertItem);
    if (new Set(all.map(item => item.id)).size !== all.length || all.some(item => item.id >= value.nextItemId)
        || Object.entries(p.equipment).some(([slot, item]) => item && (item.type !== "equipment" || item.value !== slot))
        || p.orbs.some(item => item && item.type !== "orb")
        || Object.entries(GAME_CONFIG.inventory).some(([type, rule]) => p.inventory.filter(item => item.type === type).length > rule.capacity)) throw new Error("角色物品位置或数量无效");
    if (!integer(s.points) || !Array.isArray(s.loadout) || s.loadout.length !== GAME_CONFIG.skills.slots || new Set(s.loadout).size !== s.loadout.length
        || s.loadout.some(id => !SKILL_IDS.includes(id)) || !Array.isArray(s.ranks) || !Array.isArray(s.readyAt)
        || s.ranks.length !== SKILL_IDS.length || s.readyAt.length !== SKILL_IDS.length || s.ranks.some(rank => !integer(rank, 1) || rank > GAME_CONFIG.skills.maxRank)
        || s.readyAt.some(tick => !finite(tick)) || !finite(s.ward) || !finite(s.wardUntil) || !finite(s.dashUntil) || !Number.isFinite(s.dashX) || !Number.isFinite(s.dashZ)) throw new Error("角色技能存档无效");
    return value;
}

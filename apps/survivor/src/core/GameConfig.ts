/** Shared, immutable policy. Rates use Hz, time budgets use ms, combat cooldowns use seconds. */
export const GAME_CONFIG = Object.freeze({
    combat: Object.freeze({ maxEnemies: 640, maxProjectiles: 128, maxHostileProjectiles: 64, maxExperienceOrbs: 768,
        maxGroundEquipment: 64, playerRadius: .3, enemyLeashDistance: 14, pulseManaCost: 18, consumableCooldown: 4, meleeHalfArc: 1.1 }),
    timing: Object.freeze({ simulationHz: 120, activeAiHz: 30, distantAiHz: 5, regenerationHz: 2,
        snapshotHz: 10, diagnosticsMs: 1000, maxCatchUpMs: 250 }),
    workers: Object.freeze({ maxCommands: 64, deferredCapacity: 64, timeoutMs: 15_000,
        parallelCollisionPairs: 49_152, terrainMax: 2, collisionMax: 2, terrainCores: 6, collisionCores: 8 }),
    inventory: Object.freeze({
        equipment: Object.freeze({ name: "装备", capacity: 40, stackSize: 1 }),
        orb: Object.freeze({ name: "宝珠", capacity: 24, stackSize: 1 }),
        consumable: Object.freeze({ name: "药剂", capacity: 16, stackSize: 99 })
    }),
    quality: Object.freeze({
        common: Object.freeze({ name: "白", color: "#c1cbc8" }),
        magic: Object.freeze({ name: "蓝", color: "#83baff" }),
        rare: Object.freeze({ name: "紫", color: "#bc91f3" }),
        legendary: Object.freeze({ name: "金", color: "#efc572" }),
        diamond: Object.freeze({ name: "钻", color: "#80e6e0" }),
        rainbow: Object.freeze({ name: "彩", color: "#f498d5" })
    })
});

export const MAX_ENEMIES = GAME_CONFIG.combat.maxEnemies;
export const MAX_PROJECTILES = GAME_CONFIG.combat.maxProjectiles;
export const MAX_HOSTILE_PROJECTILES = GAME_CONFIG.combat.maxHostileProjectiles;
export const MAX_EXPERIENCE_ORBS = GAME_CONFIG.combat.maxExperienceOrbs;
export const MAX_GROUND_EQUIPMENT = GAME_CONFIG.combat.maxGroundEquipment;
export const ENTITY_CAPACITY = 1 + MAX_ENEMIES + MAX_PROJECTILES + MAX_EXPERIENCE_ORBS + MAX_GROUND_EQUIPMENT;
export const PLAYER_RADIUS = GAME_CONFIG.combat.playerRadius;
export const ENEMY_LEASH_DISTANCE = GAME_CONFIG.combat.enemyLeashDistance;
export const PULSE_MANA_COST = GAME_CONFIG.combat.pulseManaCost;
export const CONSUMABLE_COOLDOWN = GAME_CONFIG.combat.consumableCooldown;
export const MELEE_HALF_ARC = GAME_CONFIG.combat.meleeHalfArc;

export const SIMULATION_STEP_MS = 1000 / GAME_CONFIG.timing.simulationHz;
export const MAX_CATCH_UP_TICKS = Math.ceil(GAME_CONFIG.timing.maxCatchUpMs * GAME_CONFIG.timing.simulationHz / 1000);
export function ticksPerUpdate(hz: number): number {
    const ticks = GAME_CONFIG.timing.simulationHz / hz;
    if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError("Update rate must divide simulation frequency");
    return ticks;
}
export function ticksForSeconds(seconds: number): number {
    return Math.ceil(seconds * GAME_CONFIG.timing.simulationHz);
}

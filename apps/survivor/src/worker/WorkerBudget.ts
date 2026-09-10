import { GAME_CONFIG } from "../core/GameConfig";
/** One shared application budget for terrain, authority and numerical query workers. */
export function workerBudget(hardwareConcurrency: number): { terrain: number; queries: number } {
    if (!Number.isInteger(hardwareConcurrency) || hardwareConcurrency < 1) throw new Error("Invalid hardware concurrency");
    const config = GAME_CONFIG.workers;
    return { terrain: hardwareConcurrency >= config.terrainCores ? config.terrainMax : 1,
        queries: hardwareConcurrency >= config.collisionCores ? config.collisionMax : 0 };
}

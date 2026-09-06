/** Prototype content values; recipe balancing follows the first production loop. */
export const MINERALS = Object.freeze({
    iron: Object.freeze({ name: "铁矿", symbol: "Fe", use: "铁材、结构件与机械", color: "#7196af", weight: 4, minimum: 2000, maximum: 6000, startingAmount: 12_000 }),
    copper: Object.freeze({ name: "铜矿", symbol: "Cu", use: "铜材与基础电路", color: "#de995e", weight: 3, minimum: 1500, maximum: 5000, startingAmount: 8000 }),
    stone: Object.freeze({ name: "石材", symbol: "石", use: "建材块与地基", color: "#d4ccb1", weight: 3, minimum: 3000, maximum: 8000, startingAmount: 12_000 })
});
export type MineralId = keyof typeof MINERALS;
export const MINERAL_IDS = Object.freeze(Object.keys(MINERALS) as MineralId[]);

export interface TilePosition { readonly x: number; readonly y: number; }
export interface MineralNode extends TilePosition {
    /** IDs are local to a world descriptor and mineral generation version. */
    readonly id: string;
    readonly depositId: string;
    readonly mineral: MineralId;
    readonly initialAmount: number;
}

export interface SurveyTerrain {
    readonly type: "sea" | "coastal" | "land" | "sand" | "tundra" | "snow" | "mountain";
    readonly hill: boolean;
    readonly forest: boolean;
    readonly lake: boolean;
}

export function isDryGround(tile: SurveyTerrain): boolean {
    return tile.type !== "sea" && tile.type !== "coastal" && !tile.lake;
}
export function isWalkable(tile: SurveyTerrain): boolean {
    return isDryGround(tile) && tile.type !== "mountain";
}

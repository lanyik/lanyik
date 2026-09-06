import type { MineralId } from "./minerals";

export type BuildingId = "command-center" | "miner" | "warehouse";
export type BuildingCategory = "base" | "extraction" | "storage";
export type MaterialAmounts = Readonly<Record<MineralId, number>>;
export interface BuildingDefinition {
    readonly name: string;
    readonly category: BuildingCategory;
    readonly symbol: string;
    readonly description: string;
    readonly footprint: readonly (readonly [number, number])[];
    readonly cost: MaterialAmounts;
    readonly storage: number;
}

export const BUILDING_CATEGORIES = Object.freeze([
    { id: "base", name: "基地设施" }, { id: "extraction", name: "资源采集" }, { id: "storage", name: "仓储" }
] as const);
const definition = (value: BuildingDefinition): BuildingDefinition => Object.freeze({ ...value,
    cost: Object.freeze(value.cost), footprint: Object.freeze(value.footprint.map(cell => Object.freeze(cell))) });
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDefinition>> = Object.freeze({
    "command-center": definition({ name: "指挥中心", category: "base", symbol: "⌂",
        description: "展开登陆舱，建立基地并接收起步物资。", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]],
        cost: { iron: 0, copper: 0, stone: 0 }, storage: 2000 }),
    miner: definition({ name: "采矿机", category: "extraction", symbol: "⚒",
        description: "资源端覆盖矿点，作业端连接基地。每秒采集 5 单位，直接入库。", footprint: [[0, 0], [1, 0]],
        cost: { iron: 20, copper: 10, stone: 10 }, storage: 0 }),
    warehouse: definition({ name: "仓库", category: "storage", symbol: "▤",
        description: "增加 5,000 单位基地共享库存容量。", footprint: [[0, 0], [1, 0]],
        cost: { iron: 40, copper: 0, stone: 40 }, storage: 5000 })
});
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDINGS) as BuildingId[]);
export const LANDING_CARGO: MaterialAmounts = Object.freeze({ iron: 120, copper: 60, stone: 120 });
export const BASE_SERVICE_STEPS = 32;
export const MINING_CYCLE_TICKS = 10;
export const MINING_BATCH = 5;

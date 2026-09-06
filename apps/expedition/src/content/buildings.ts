import { materials, type ItemAmounts } from "./items";
import type { PowerDefinition } from "./energy";

export type BuildingId = "command-center" | "miner" | "warehouse" | "solar-array" | "power-relay" | "battery" | "smelter";
export type BuildingCategory = "base" | "extraction" | "production" | "energy" | "storage";
export interface BuildingDefinition {
    readonly name: string;
    readonly category: BuildingCategory;
    readonly description: string;
    readonly footprint: readonly (readonly [number, number])[];
    readonly cost: ItemAmounts;
    readonly storage: number;
    readonly power?: PowerDefinition;
}

export const BUILDING_CATEGORIES = Object.freeze([
    { id: "base", name: "基地设施" }, { id: "extraction", name: "资源采集" },
    { id: "production", name: "工业生产" }, { id: "energy", name: "能源" }, { id: "storage", name: "仓储" }
] as const);
const definition = (value: BuildingDefinition): BuildingDefinition => Object.freeze({ ...value,
    cost: Object.freeze(value.cost), footprint: Object.freeze(value.footprint.map(cell => Object.freeze(cell))),
    power: value.power && Object.freeze({ ...value.power, node: value.power.node && Object.freeze(value.power.node),
        generation: value.power.generation && Object.freeze(value.power.generation), storage: value.power.storage && Object.freeze(value.power.storage) }) });
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDefinition>> = Object.freeze({
    "command-center": definition({ name: "指挥中心", category: "base",
        description: "展开登陆舱，接收起步物资。独立生活保障之外提供 60 kW 工业电源，覆盖 10 格。", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]],
        cost: materials({}), storage: 2000, power: { node: { coverage: 10, linkRange: 10 }, generation: { kind: "constant", kw: 60 } } }),
    miner: definition({ name: "采矿机", category: "extraction",
        description: "资源端覆盖矿点，作业端接通基地与电网。消耗 20 kW，每秒采集 5 单位并直接入库。", footprint: [[0, 0], [1, 0]],
        cost: materials({ iron: 20, copper: 10, stone: 10 }), storage: 0, power: { demandKW: 20 } }),
    warehouse: definition({ name: "仓库", category: "storage",
        description: "增加 5,000 单位基地共享库存容量。", footprint: [[0, 0], [1, 0]],
        cost: materials({ iron: 40, stone: 40 }), storage: 5000 }),
    "solar-array": definition({ name: "光能发电站", category: "energy",
        description: "白昼发电 120 kW，夜间停止。供电覆盖 6 格，10 格内连接其他电网节点。", footprint: [[0, 0]],
        cost: materials({ iron: 30, copper: 15, stone: 10 }), storage: 0,
        power: { node: { coverage: 6, linkRange: 10 }, generation: { kind: "solar", kw: 120 } } }),
    "power-relay": definition({ name: "能量辐射站", category: "energy",
        description: "连接 10 格内的电网节点，向周围 6 格设备供电。自身不发电，不因停电断开连接。", footprint: [[0, 0]],
        cost: materials({ iron: 5, copper: 5, stone: 5 }), storage: 0, power: { node: { coverage: 6, linkRange: 10 } } }),
    battery: definition({ name: "储能站", category: "energy",
        description: "存储 6,000 kJ，最大充放电功率各 60 kW。先供应设备，再用余电充能；建成时为空。", footprint: [[0, 0]],
        cost: materials({ "iron-plate": 10, "copper-plate": 10, "stone-brick": 10 }), storage: 0,
        power: { storage: { capacityJ: 6_000_000, chargeKW: 60, dischargeKW: 60 } } }),
    smelter: definition({ name: "冶炼厂", category: "production",
        description: "消耗 60 kW，将铁矿、铜矿或石材加工为铁板、铜板和建材块。选择配方后自动运行。", footprint: [[0, 0], [1, 0]],
        cost: materials({ iron: 30, copper: 10, stone: 20 }), storage: 0, power: { demandKW: 60 } })
});
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDINGS) as BuildingId[]);
export const LANDING_CARGO = materials({ iron: 120, copper: 60, stone: 120 });
export const BASE_SERVICE_STEPS = 32;
export const MINING_CYCLE_TICKS = 10;
export const MINING_BATCH = 5;

import { getNeighbors } from "three-hex-map";
import { BASE_SERVICE_STEPS, BUILDINGS, LANDING_CARGO, MINING_BATCH, MINING_CYCLE_TICKS, type BuildingId } from "../../content/buildings";
import { isWalkable, type MineralNode, type SurveyTerrain, type TilePosition } from "../../content/minerals";
import { ITEM_IDS, materials, materialTotal, type ItemAmounts } from "../../content/items";
import { POWER_PRIORITIES, type PowerPriority } from "../../content/energy";
import { RECIPES, RECIPE_IDS, type RecipeId } from "../../content/recipes";
import { InventoryLedger, type InventorySnapshot } from "../inventory/InventoryLedger";
import { buildingFootprint, tileKey, type Rotation } from "../spatial/footprint";
import { PowerGrid, type DevicePower, type PowerSnapshot } from "../power/PowerGrid";

export interface ConstructionTile { readonly terrain: SurveyTerrain; readonly mineral?: MineralNode }
export interface ConstructionWorld { readTile(position: TilePosition): ConstructionTile | undefined }
export interface Building {
    readonly id: string;
    readonly kind: BuildingId;
    readonly anchor: TilePosition;
    readonly rotation: Rotation;
    readonly cells: readonly TilePosition[];
    readonly paid: ItemAmounts;
    readonly mineral?: MineralNode;
}
export type BuildingStatus = "ready" | "mining" | "processing" | "warehouse-full" | "depleted" | "disconnected"
    | "disabled" | "no-grid" | "insufficient-power" | "missing-input" | "output-full" | "output-pending" | "night" | "charging" | "discharging";
export interface BuildingSnapshot extends Building {
    readonly status: BuildingStatus;
    readonly progress: number;
    readonly remaining?: number;
    readonly enabled: boolean;
    readonly priority: PowerPriority;
    readonly recipe?: RecipeId;
    readonly batch?: { readonly recipe: RecipeId; readonly progress: number };
    readonly power?: DevicePower;
}
export interface Placement {
    readonly kind: BuildingId;
    readonly anchor: TilePosition;
    readonly rotation: Rotation;
    readonly cells: readonly TilePosition[];
    readonly valid: boolean;
    readonly message: string;
    readonly coverage?: { readonly position: TilePosition; readonly radius: number };
    readonly powerLink?: TilePosition;
}
export interface IndustrySnapshot {
    readonly landed: boolean;
    readonly buildings: readonly BuildingSnapshot[];
    readonly inventory: InventorySnapshot;
    readonly layoutRevision: number;
    readonly depleted: readonly string[];
    readonly power: PowerSnapshot;
}
interface Machine {
    building: Building; progress: number; connected: boolean; enabled: boolean; priority: PowerPriority;
    recipe?: RecipeId; batch?: { recipe: RecipeId; progress: number }; status: BuildingStatus;
}
export interface ConstructionResult { readonly ok: boolean; readonly message: string }

/** Authoritative buildings, occupancy and extraction. Rendering residency never advances or removes this state. */
export class Industry {
    private readonly ledger = new InventoryLedger();
    private readonly power = new PowerGrid();
    private readonly machines = new Map<string, Machine>();
    private readonly occupied = new Map<string, string>();
    private readonly extracted = new Map<string, number>();
    private depleted: readonly string[] = Object.freeze([]);
    private center: Building | undefined;
    private nextId = 1;
    private layoutRevision = 0;
    private tick = 0;
    private workOrder: Machine[] = [];
    private snapshot: IndustrySnapshot = this.capture();
    constructor(private readonly world: ConstructionWorld) {}

    public getSnapshot(): IndustrySnapshot { return this.snapshot; }
    public remaining(node: MineralNode): number { return node.initialAmount - (this.extracted.get(node.id) ?? 0); }
    public buildingAt(position: TilePosition): BuildingSnapshot | undefined {
        const id = this.occupied.get(tileKey(position));
        return this.snapshot.buildings.find(building => building.id === id);
    }

    public preview(kind: BuildingId, anchor: TilePosition, rotation: Rotation): Placement {
        const cells = buildingFootprint(kind, anchor, rotation);
        const power = BUILDINGS[kind].power;
        const position = kind === "miner" ? cells[1] : anchor;
        const connection = power && this.power.connection(position, power.node);
        const result = (message: string, valid = false): Placement => Object.freeze({
            kind, anchor: Object.freeze({ ...anchor }), rotation, cells, valid, message,
            coverage: power?.node ? Object.freeze({ position: Object.freeze({ ...position }), radius: power.node.coverage })
                : connection && Object.freeze({ position: connection.position, radius: connection.coverage }),
            powerLink: connection?.position
        });
        if (kind === "command-center" && this.center) return result("基地已经有指挥中心");
        if (kind !== "command-center" && !this.center) return result("请先放置指挥中心");
        for (const [index, cell] of cells.entries()) {
            if (this.occupied.has(tileKey(cell))) return result("占地与已有建筑重叠");
            const tile = this.world.readTile(cell);
            if (!tile) return result("占地超出已勘察区域");
            if (tile.terrain.forest) return result("请避开林地");
            if (kind === "miner" && index === 0) {
                if (!tile.mineral || !this.remaining(tile.mineral)) return result("资源端需要覆盖尚有储量的矿点");
            } else if (!isWalkable(tile.terrain) || tile.terrain.hill || tile.mineral) {
                return result(kind === "miner" ? "作业端需要无矿的干燥平地，可按 R 旋转" : "需要无矿、无林的干燥平地");
            }
        }
        if (!this.ledger.canSpend(BUILDINGS[kind].cost)) return result("仓库中的建造材料不足");
        if (this.center) {
            const reachable = this.reachable(new Set(cells.map(tileKey)));
            const ports = kind === "miner" ? [cells[1]] : cells;
            if (!this.serviced(ports, reachable)) return result(`作业端需在基地 ${BASE_SERVICE_STEPS} 步内且有可通行路线`);
        }
        return result(kind === "command-center" ? "可以展开指挥中心" : !power ? "可以建造"
            : connection ? `可以建造 · 接入电网 ${connection.networkId.replace("building-", "#")}`
                : power.node ? "可以建造 · 建立独立电网" : "可以建造 · 尚无供电覆盖，请接入辐射站", true);
    }

    public place(kind: BuildingId, anchor: TilePosition, rotation: Rotation): ConstructionResult {
        const preview = this.preview(kind, anchor, rotation);
        if (!preview.valid) return { ok: false, message: preview.message };
        const definition = BUILDINGS[kind];
        const building: Building = Object.freeze({ id: `building-${this.nextId++}`, kind,
            anchor: preview.anchor, rotation, cells: preview.cells, paid: definition.cost,
            mineral: kind === "miner" ? this.world.readTile(anchor)!.mineral : undefined });
        if (!this.ledger.spend(definition.cost)) throw new Error("Validated construction spend failed");
        this.ledger.setCapacity(this.ledger.getSnapshot().capacity + definition.storage);
        this.machines.set(building.id, { building, progress: 0, connected: true, enabled: true, priority: 1,
            recipe: kind === "smelter" ? "iron-plate" : undefined, status: "ready" });
        for (const cell of building.cells) this.occupied.set(tileKey(cell), building.id);
        if (kind === "command-center") {
            this.center = building;
            this.ledger.creditMany(LANDING_CARGO);
        }
        this.layoutChanged();
        return { ok: true, message: `${definition.name}已建成` };
    }

    public demolish(id: string): ConstructionResult {
        const machine = this.machines.get(id);
        if (!machine) return { ok: false, message: "建筑已经不存在" };
        const { building } = machine;
        if (building.kind === "command-center") return { ok: false, message: "指挥中心不能拆除" };
        const batch = machine.batch && RECIPES[machine.batch.recipe];
        const returnedBatch = batch && (machine.batch!.progress >= batch.ticks ? batch.outputs : batch.inputs);
        const refund = materials(Object.fromEntries(ITEM_IDS.map(id => [id, building.paid[id] + (returnedBatch?.[id] ?? 0)])));
        const nextCapacity = this.ledger.getSnapshot().capacity - BUILDINGS[building.kind].storage;
        if (this.ledger.getSnapshot().total + materialTotal(refund) > nextCapacity) return { ok: false, message: "剩余仓容不足以保留库存和回收材料" };
        this.ledger.setCapacity(nextCapacity);
        this.ledger.creditMany(refund);
        this.machines.delete(id);
        for (const cell of building.cells) this.occupied.delete(tileKey(cell));
        this.layoutChanged();
        return { ok: true, message: "建筑已拆除，建造材料已回收入库" };
    }

    public advance(ticks: number): void {
        if (!Number.isSafeInteger(ticks) || ticks < 0 || !Number.isSafeInteger(this.tick + ticks)) throw new RangeError("Invalid industry tick count");
        if (!this.center || !ticks) return;
        for (let tick = 0; tick < ticks; tick += 1) {
            this.tick += 1;
            // Only outputs completed before this tick are available to other consumers.
            for (const machine of this.machines.values()) {
                if (!machine.batch || !machine.connected) continue;
                const recipe = RECIPES[machine.batch.recipe];
                if (machine.batch.progress < recipe.ticks || materialTotal(recipe.outputs) > this.ledger.freeSpace) continue;
                this.ledger.creditMany(recipe.outputs);
                machine.batch = undefined;
            }
            this.runWork(true);
        }
        this.snapshot = this.capture();
    }

    public configure(id: string, change: { enabled?: boolean; priority?: PowerPriority; recipe?: RecipeId }): ConstructionResult {
        const machine = this.machines.get(id);
        if (!machine) return { ok: false, message: "建筑已经不存在" };
        const definition = BUILDINGS[machine.building.kind];
        if (change.enabled !== undefined) {
            if (typeof change.enabled !== "boolean") throw new TypeError("Enabled state must be boolean");
            if (!definition.power || machine.building.kind === "command-center" || machine.building.kind === "power-relay") return { ok: false, message: "该建筑不支持停机" };
        }
        if (change.priority !== undefined && (!POWER_PRIORITIES.includes(change.priority) || !definition.power?.demandKW)) throw new TypeError("Invalid load priority");
        if (change.recipe !== undefined && (!RECIPE_IDS.includes(change.recipe) || machine.building.kind !== "smelter")) throw new TypeError("Invalid building recipe");
        if (change.enabled !== undefined) machine.enabled = change.enabled;
        if (change.priority !== undefined) machine.priority = change.priority;
        if (change.recipe !== undefined) machine.recipe = change.recipe;
        this.refreshPower(false);
        this.snapshot = this.capture();
        return { ok: true, message: change.recipe && machine.batch ? "当前批次完成后切换配方" : "设备设置已更新" };
    }

    private blocked(machine: Machine, inputs: ItemAmounts = this.ledger.getSnapshot().amounts): BuildingStatus | undefined {
        if (!machine.enabled) return "disabled";
        if (!machine.connected) return "disconnected";
        if (machine.building.mineral) {
            if (!this.remaining(machine.building.mineral)) return "depleted";
            if (!this.ledger.freeSpace) return "warehouse-full";
        } else if (machine.recipe) {
            if (machine.batch && machine.batch.progress >= RECIPES[machine.batch.recipe].ticks) return "output-full";
            if (!machine.batch && ITEM_IDS.some(id => inputs[id] < RECIPES[machine.recipe!].inputs[id])) return "missing-input";
        }
        return undefined;
    }

    private runWork(commit: boolean): void {
        this.power.beginTick(this.tick);
        const inputs = { ...this.ledger.getSnapshot().amounts };
        for (const machine of this.workOrder) {
            const blocked = this.blocked(machine, inputs);
            if (blocked) { machine.status = blocked; continue; }
            const refused = this.power.request(machine.building.id);
            if (refused) { machine.status = refused; continue; }
            machine.status = machine.recipe ? "processing" : "mining";
            if (machine.recipe && !machine.batch) for (const id of ITEM_IDS) inputs[id] -= RECIPES[machine.recipe].inputs[id];
            if (!commit) continue;
            const node = machine.building.mineral;
            if (node) {
                machine.progress += 1;
                if (machine.progress < MINING_CYCLE_TICKS) continue;
                const amount = Math.min(MINING_BATCH, this.remaining(node), this.ledger.freeSpace);
                this.ledger.credit(node.mineral, amount);
                this.extracted.set(node.id, (this.extracted.get(node.id) ?? 0) + amount);
                machine.progress = 0;
                if (!this.remaining(node)) this.depleted = Object.freeze([...this.depleted, node.id]);
            } else if (machine.recipe) {
                if (!machine.batch) {
                    if (!this.ledger.spend(RECIPES[machine.recipe].inputs)) throw new Error("Allocated batch inputs are missing");
                    machine.batch = { recipe: machine.recipe, progress: 0 };
                }
                machine.batch.progress += 1;
            }
        }
        this.power.finishTick(commit);
    }

    private refreshPower(rebuild = true): void {
        this.workOrder = [...this.machines.values()].filter(machine => BUILDINGS[machine.building.kind].power?.demandKW)
            .sort((a, b) => a.priority - b.priority);
        if (rebuild) this.power.rebuild([...this.machines.values()].flatMap(machine => {
            const definition = BUILDINGS[machine.building.kind].power;
            return definition ? [{ id: machine.building.id, definition, enabled: machine.enabled,
                position: machine.building.kind === "miner" ? machine.building.cells[1] : machine.building.anchor }] : [];
        }));
        else for (const machine of this.machines.values()) if (BUILDINGS[machine.building.kind].power) this.power.setEnabled(machine.building.id, machine.enabled);
        this.runWork(false);
    }

    private reachable(extraBlocked = new Set<string>()): Map<string, number> {
        const reachable = new Map<string, number>();
        if (!this.center) return reachable;
        const queue: (TilePosition & { distance: number })[] = [];
        const visit = (cell: TilePosition, distance: number) => {
            const key = tileKey(cell);
            if (reachable.has(key) || this.occupied.has(key) || extraBlocked.has(key)) return;
            const tile = this.world.readTile(cell);
            if (!tile || !isWalkable(tile.terrain)) return;
            reachable.set(key, distance);
            queue.push({ ...cell, distance });
        };
        for (const cell of this.center.cells) for (const neighbor of getNeighbors(cell.x, cell.y)) visit(neighbor, 1);
        for (let index = 0; index < queue.length; index += 1) {
            const cell = queue[index];
            if (cell.distance >= BASE_SERVICE_STEPS - 1) continue;
            for (const neighbor of getNeighbors(cell.x, cell.y)) visit(neighbor, cell.distance + 1);
        }
        return reachable;
    }
    private serviced(ports: readonly TilePosition[], reachable: Map<string, number>): boolean {
        return ports.some(port => getNeighbors(port.x, port.y).some(neighbor => reachable.has(tileKey(neighbor))));
    }
    private layoutChanged(): void {
        this.layoutRevision += 1;
        const reachable = this.reachable();
        for (const machine of this.machines.values()) {
            machine.connected = machine.building.kind === "command-center" || this.serviced(
                machine.building.kind === "miner" ? [machine.building.cells[1]] : machine.building.cells, reachable);
        }
        this.refreshPower();
        this.snapshot = this.capture();
    }
    private capture(): IndustrySnapshot {
        const power = this.power.getSnapshot();
        return Object.freeze({ landed: !!this.center, inventory: this.ledger.getSnapshot(),
            layoutRevision: this.layoutRevision, depleted: this.depleted, power,
            buildings: Object.freeze([...this.machines.values()].map(machine => {
                const remaining = machine.building.mineral && this.remaining(machine.building.mineral);
                const device = power.devices[machine.building.id];
                const definition = BUILDINGS[machine.building.kind].power;
                const status: BuildingStatus = definition?.demandKW ? this.blocked(machine) ?? machine.status
                    : !machine.enabled ? "disabled" : definition?.storage && !device?.networkId ? "no-grid"
                        : definition?.generation?.kind === "solar" && !power.daylight ? "night"
                            : device?.chargeKW ? "charging" : device?.dischargeKW ? "discharging" : "ready";
                return Object.freeze({ ...machine.building,
                    status: status === "output-full" && this.ledger.freeSpace >= materialTotal(RECIPES[machine.batch!.recipe].outputs) ? "output-pending" : status,
                    progress: machine.progress, remaining,
                    enabled: machine.enabled, priority: machine.priority, recipe: machine.recipe,
                    batch: machine.batch && Object.freeze({ ...machine.batch }), power: device });
            })) });
    }
}

import { getNeighbors } from "three-hex-map";
import { BASE_SERVICE_STEPS, BUILDINGS, LANDING_CARGO, MINING_BATCH, MINING_CYCLE_TICKS, type BuildingId, type MaterialAmounts } from "../../content/buildings";
import { MINERAL_IDS, isWalkable, type MineralNode, type SurveyTerrain, type TilePosition } from "../../content/minerals";
import { InventoryLedger, type InventorySnapshot } from "../inventory/InventoryLedger";
import { buildingFootprint, tileKey, type Rotation } from "../spatial/footprint";

export interface ConstructionTile { readonly terrain: SurveyTerrain; readonly mineral?: MineralNode }
export interface ConstructionWorld { readTile(position: TilePosition): ConstructionTile | undefined }
export interface Building {
    readonly id: string;
    readonly kind: BuildingId;
    readonly anchor: TilePosition;
    readonly rotation: Rotation;
    readonly cells: readonly TilePosition[];
    readonly paid: MaterialAmounts;
    readonly mineral?: MineralNode;
}
export type BuildingStatus = "ready" | "mining" | "warehouse-full" | "depleted" | "disconnected";
export interface BuildingSnapshot extends Building {
    readonly status: BuildingStatus;
    readonly progress: number;
    readonly remaining?: number;
}
export interface Placement {
    readonly kind: BuildingId;
    readonly anchor: TilePosition;
    readonly rotation: Rotation;
    readonly cells: readonly TilePosition[];
    readonly valid: boolean;
    readonly message: string;
}
export interface IndustrySnapshot {
    readonly landed: boolean;
    readonly buildings: readonly BuildingSnapshot[];
    readonly inventory: InventorySnapshot;
    readonly layoutRevision: number;
    readonly depleted: readonly string[];
}
interface Machine { building: Building; progress: number; connected: boolean }
export interface ConstructionResult { readonly ok: boolean; readonly message: string }

/** Authoritative buildings, occupancy and extraction. Rendering residency never advances or removes this state. */
export class Industry {
    private readonly ledger = new InventoryLedger();
    private readonly machines = new Map<string, Machine>();
    private readonly occupied = new Map<string, string>();
    private readonly extracted = new Map<string, number>();
    private depleted: readonly string[] = Object.freeze([]);
    private center: Building | undefined;
    private nextId = 1;
    private layoutRevision = 0;
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
        const result = (message: string, valid = false): Placement => Object.freeze({
            kind, anchor: Object.freeze({ ...anchor }), rotation, cells, valid, message
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
        return result(kind === "command-center" ? "可以展开指挥中心" : "可以建造", true);
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
        this.machines.set(building.id, { building, progress: 0, connected: true });
        for (const cell of building.cells) this.occupied.set(tileKey(cell), building.id);
        if (kind === "command-center") {
            this.center = building;
            for (const mineral of MINERAL_IDS) this.ledger.credit(mineral, LANDING_CARGO[mineral]);
        }
        this.layoutChanged();
        return { ok: true, message: `${definition.name}已建成` };
    }

    public demolish(id: string): ConstructionResult {
        const machine = this.machines.get(id);
        if (!machine) return { ok: false, message: "建筑已经不存在" };
        const { building } = machine;
        if (building.kind === "command-center") return { ok: false, message: "指挥中心不能拆除" };
        const refund = MINERAL_IDS.reduce((sum, mineral) => sum + building.paid[mineral], 0);
        const nextCapacity = this.ledger.getSnapshot().capacity - BUILDINGS[building.kind].storage;
        if (this.ledger.getSnapshot().total + refund > nextCapacity) return { ok: false, message: "剩余仓容不足以保留库存和回收材料" };
        this.ledger.setCapacity(nextCapacity);
        for (const mineral of MINERAL_IDS) this.ledger.credit(mineral, building.paid[mineral]);
        this.machines.delete(id);
        for (const cell of building.cells) this.occupied.delete(tileKey(cell));
        this.layoutChanged();
        return { ok: true, message: "建筑已拆除，建造材料已回收入库" };
    }

    public advance(ticks: number): void {
        if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("Invalid industry tick count");
        // Stable insertion order is the deterministic arbitration rule when warehouse space is scarce.
        for (let tick = 0; tick < ticks; tick += 1) {
            for (const machine of this.machines.values()) {
                const node = machine.building.mineral;
                if (!node || !machine.connected || !this.remaining(node) || !this.ledger.freeSpace) continue;
                machine.progress += 1;
                if (machine.progress < MINING_CYCLE_TICKS) continue;
                const amount = Math.min(MINING_BATCH, this.remaining(node), this.ledger.freeSpace);
                this.ledger.credit(node.mineral, amount);
                this.extracted.set(node.id, (this.extracted.get(node.id) ?? 0) + amount);
                machine.progress = 0;
                if (!this.remaining(node)) this.depleted = Object.freeze([...this.depleted, node.id]);
            }
        }
        this.snapshot = this.capture();
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
            machine.connected = machine.building.kind !== "miner" || this.serviced([machine.building.cells[1]], reachable);
        }
        this.snapshot = this.capture();
    }
    private capture(): IndustrySnapshot {
        return Object.freeze({ landed: !!this.center, inventory: this.ledger.getSnapshot(),
            layoutRevision: this.layoutRevision, depleted: this.depleted,
            buildings: Object.freeze([...this.machines.values()].map(machine => {
                const remaining = machine.building.mineral && this.remaining(machine.building.mineral);
                const status: BuildingStatus = !machine.building.mineral ? "ready" : !remaining ? "depleted"
                    : !machine.connected ? "disconnected" : !this.ledger.freeSpace ? "warehouse-full" : "mining";
                return Object.freeze({ ...machine.building, status, progress: machine.progress, remaining });
            })) });
    }
}

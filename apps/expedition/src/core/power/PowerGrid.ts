import { DAY_CYCLE_TICKS, DAYLIGHT_TICKS, type PowerDefinition } from "../../content/energy";
import type { TilePosition } from "../../content/minerals";
import { GAME_STEP_MS } from "../GameClock";
import { hexDistance } from "../spatial/footprint";

const JOULES_PER_KW_TICK = GAME_STEP_MS;
export interface PowerParticipant {
    readonly id: string;
    readonly position: TilePosition;
    readonly definition: PowerDefinition;
    readonly enabled: boolean;
}
export interface DevicePower {
    readonly networkId?: string;
    readonly generationKW: number;
    readonly demandKW: number;
    readonly consumedKW: number;
    readonly storedJ: number;
    readonly capacityJ: number;
    readonly chargeKW: number;
    readonly dischargeKW: number;
}
export interface NetworkPower {
    readonly id: string;
    readonly members: number;
    readonly generationKW: number;
    readonly demandKW: number;
    readonly consumedKW: number;
    readonly storedJ: number;
    readonly capacityJ: number;
    readonly chargeKW: number;
    readonly dischargeKW: number;
}
export interface PowerSnapshot {
    readonly tick: number;
    readonly day: number;
    readonly daylight: boolean;
    readonly ticksUntilChange: number;
    readonly networks: readonly NetworkPower[];
    readonly devices: Readonly<Record<string, DevicePower>>;
    readonly generationKW: number;
    readonly demandKW: number;
    readonly consumedKW: number;
    readonly storedJ: number;
    readonly capacityJ: number;
    readonly chargeKW: number;
    readonly dischargeKW: number;
}
interface Device { participant: PowerParticipant; network?: Network; generationKW: number; demandKW: number; consumedKW: number; chargeKW: number; dischargeKW: number }
interface Network { id: string; members: Device[]; generationJ: number; availableJ: number; consumedJ: number }
interface Node { participant: PowerParticipant; order: number }

/** Topology is derived on layout changes. Battery joules belong to devices, never to a network. */
export class PowerGrid {
    private readonly stored = new Map<string, number>();
    private readonly devices = new Map<string, Device>();
    private readonly networks = new Map<string, Network>();
    private readonly buckets = new Map<string, Node[]>();
    private bucketSize = 1;
    private tick = 0;
    private snapshot: PowerSnapshot | undefined;

    public getSnapshot(): PowerSnapshot { return this.snapshot ??= this.capture(); }

    public setEnabled(id: string, enabled: boolean): void {
        const device = this.devices.get(id);
        if (!device) throw new Error("Unknown power device");
        device.participant = { ...device.participant, enabled };
        this.snapshot = undefined;
    }

    public rebuild(participants: readonly PowerParticipant[]): void {
        this.snapshot = undefined;
        this.devices.clear(); this.networks.clear(); this.buckets.clear();
        const nodes = participants.filter(participant => participant.definition.node);
        this.bucketSize = Math.max(1, ...nodes.map(node => Math.max(node.definition.node!.coverage, node.definition.node!.linkRange)));
        const parents = nodes.map((_, index) => index);
        const root = (index: number): number => {
            while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
            return index;
        };
        nodes.forEach((participant, order) => {
            for (const other of this.nearby(participant.position)) {
                if (hexDistance(participant.position, other.participant.position) > Math.min(participant.definition.node!.linkRange, other.participant.definition.node!.linkRange)) continue;
                const a = root(order), b = root(other.order);
                parents[Math.max(a, b)] = Math.min(a, b);
            }
            const key = this.bucketKey(participant.position);
            const bucket = this.buckets.get(key) ?? [];
            bucket.push({ participant, order }); this.buckets.set(key, bucket);
        });
        nodes.forEach((participant, index) => {
            const id = nodes[root(index)].id;
            if (!this.networks.has(id)) this.networks.set(id, { id, members: [], generationJ: 0, availableJ: 0, consumedJ: 0 });
            this.addDevice(participant, this.networks.get(id));
        });
        for (const participant of participants) {
            if (!participant.definition.node) {
                const connection = this.connection(participant.position);
                this.addDevice(participant, connection && this.networks.get(connection.networkId));
            }
            if (participant.definition.storage && !this.stored.has(participant.id)) this.stored.set(participant.id, 0);
        }
        for (const id of this.stored.keys()) if (!this.devices.has(id)) this.stored.delete(id);
    }

    public connection(position: TilePosition, node?: PowerDefinition["node"]): { networkId: string; position: TilePosition; coverage: number } | undefined {
        let closest: Node | undefined;
        let distance = Infinity;
        for (const candidate of this.nearby(position)) {
            const definition = candidate.participant.definition.node!;
            const limit = node ? Math.min(node.linkRange, definition.linkRange) : definition.coverage;
            const separation = hexDistance(position, candidate.participant.position);
            if (separation > limit || separation > distance || (separation === distance && closest && candidate.order > closest.order)) continue;
            closest = candidate; distance = separation;
        }
        if (!closest) return undefined;
        return { networkId: this.devices.get(closest.participant.id)!.network!.id,
            position: closest.participant.position, coverage: closest.participant.definition.node!.coverage };
    }

    public beginTick(tick: number): void {
        if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Invalid power tick");
        this.tick = tick;
        this.snapshot = undefined;
        const daylight = tick % DAY_CYCLE_TICKS < DAYLIGHT_TICKS;
        for (const network of this.networks.values()) { network.generationJ = 0; network.availableJ = 0; network.consumedJ = 0; }
        for (const device of this.devices.values()) {
            const { definition, enabled, id } = device.participant;
            device.generationKW = enabled && definition.generation && (definition.generation.kind === "constant" || daylight) ? definition.generation.kw : 0;
            device.demandKW = device.consumedKW = device.chargeKW = device.dischargeKW = 0;
            if (!device.network) continue;
            const generationJ = device.generationKW * JOULES_PER_KW_TICK;
            device.network.generationJ += generationJ;
            device.network.availableJ += generationJ + (enabled && definition.storage
                ? Math.min(this.stored.get(id)!, definition.storage.dischargeKW * JOULES_PER_KW_TICK) : 0);
        }
    }

    public request(id: string): "no-grid" | "insufficient-power" | undefined {
        const device = this.devices.get(id);
        if (!device?.participant.definition.demandKW) throw new Error("Power request requires a registered load");
        if (device.demandKW) throw new Error("A load can request power only once per tick");
        const demand = device.participant.definition.demandKW;
        device.demandKW = demand;
        if (!device.network) return "no-grid";
        const joules = demand * JOULES_PER_KW_TICK;
        if (device.network.availableJ < joules) return "insufficient-power";
        device.network.availableJ -= joules;
        device.network.consumedJ += joules;
        device.consumedKW = demand;
        return undefined;
    }

    public finishTick(commit: boolean): void {
        for (const network of this.networks.values()) {
            let balance = network.generationJ - network.consumedJ;
            for (const device of network.members) {
                const { storage } = device.participant.definition;
                if (!storage || !device.participant.enabled) continue;
                const stored = this.stored.get(device.participant.id)!;
                const delta = balance >= 0 ? Math.min(balance, storage.chargeKW * JOULES_PER_KW_TICK, storage.capacityJ - stored)
                    : -Math.min(-balance, storage.dischargeKW * JOULES_PER_KW_TICK, stored);
                balance -= delta;
                if (commit) this.stored.set(device.participant.id, stored + delta);
                device.chargeKW = Math.max(0, delta) / JOULES_PER_KW_TICK;
                device.dischargeKW = Math.max(0, -delta) / JOULES_PER_KW_TICK;
            }
            if (balance < 0) throw new Error("Power allocation exceeded available energy");
        }
        this.snapshot = undefined;
    }

    private addDevice(participant: PowerParticipant, network?: Network): void {
        const device: Device = { participant, network, generationKW: 0, demandKW: 0, consumedKW: 0, chargeKW: 0, dischargeKW: 0 };
        this.devices.set(participant.id, device); network?.members.push(device);
    }
    private bucketKey(position: TilePosition): string {
        return `${Math.floor(position.x / this.bucketSize)},${Math.floor((position.y - Math.ceil(position.x / 2)) / this.bucketSize)}`;
    }
    private *nearby(position: TilePosition): Iterable<Node> {
        const q = Math.floor(position.x / this.bucketSize), r = Math.floor((position.y - Math.ceil(position.x / 2)) / this.bucketSize);
        for (let x = q - 1; x <= q + 1; x += 1) for (let y = r - 1; y <= r + 1; y += 1) yield* this.buckets.get(`${x},${y}`) ?? [];
    }
    private capture(): PowerSnapshot {
        const devices: Record<string, DevicePower> = {};
        for (const [id, device] of this.devices) devices[id] = Object.freeze({ networkId: device.network?.id,
            generationKW: device.generationKW, demandKW: device.demandKW, consumedKW: device.consumedKW,
            storedJ: this.stored.get(id) ?? 0, capacityJ: device.participant.definition.storage?.capacityJ ?? 0,
            chargeKW: device.chargeKW, dischargeKW: device.dischargeKW });
        const totals = (members: readonly DevicePower[]) => members.reduce((sum, value) => ({
            generationKW: sum.generationKW + value.generationKW, demandKW: sum.demandKW + value.demandKW,
            consumedKW: sum.consumedKW + value.consumedKW, storedJ: sum.storedJ + value.storedJ, capacityJ: sum.capacityJ + value.capacityJ,
            chargeKW: sum.chargeKW + value.chargeKW, dischargeKW: sum.dischargeKW + value.dischargeKW
        }), { generationKW: 0, demandKW: 0, consumedKW: 0, storedJ: 0, capacityJ: 0, chargeKW: 0, dischargeKW: 0 });
        const phase = this.tick % DAY_CYCLE_TICKS;
        return Object.freeze({ tick: this.tick, day: Math.floor(this.tick / DAY_CYCLE_TICKS) + 1, daylight: phase < DAYLIGHT_TICKS,
            ticksUntilChange: (phase < DAYLIGHT_TICKS ? DAYLIGHT_TICKS : DAY_CYCLE_TICKS) - phase,
            devices: Object.freeze(devices), networks: Object.freeze([...this.networks.values()].map(network => Object.freeze({
                id: network.id, members: network.members.length, ...totals(network.members.map(device => devices[device.participant.id]))
            }))), ...totals(Object.values(devices)) });
    }
}

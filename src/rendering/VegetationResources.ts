import {
    collectCpuBufferAllocations,
    ResourceAllocation,
    ResourceBudgetAccount,
    ResourceReservationHandle
} from "../runtime/ResourceBudget";
import type {
    WorldVegetationForestChunkLayout,
    WorldVegetationGrassChunkLayout,
    WorldVegetationLayout
} from "../world/generateVegetation";

let nextOwner = 1;

/** CPU data has an owner even before, or after, its render chunk is GPU-resident. */
export class VegetationResources {
    private readonly prefix = `vegetation:${nextOwner++}:`;
    private readonly reservations = new Map<string, ResourceReservationHandle>();

    constructor(private readonly account?: ResourceBudgetAccount) {}

    public retain(key: string, allocations: readonly ResourceAllocation[]): void {
        this.release(key);
        const cpu = allocations.filter(allocation => (allocation.cost.cpuBytes ?? 0) > 0);
        if (!this.account || cpu.length === 0) return;
        this.reservations.set(key, this.account.acquireRequired(`${this.prefix}${key}`, {}, true, cpu));
    }

    /** Older derived LODs are optional; a budget rejection drops their ownership. */
    public keepCached(key: string): boolean {
        const reservation = this.reservations.get(key);
        if (!reservation || reservation.update({}, false)) return true;
        this.release(key);
        return false;
    }

    public pin(key: string): void { this.reservations.get(key)?.setPinned(true); }

    public release(key: string): void {
        this.reservations.get(key)?.release();
        this.reservations.delete(key);
    }

    public dispose(): void {
        for (const reservation of this.reservations.values()) reservation.release();
        this.reservations.clear();
    }
}

export function grassLayoutAllocations(chunks: Iterable<WorldVegetationGrassChunkLayout>): ResourceAllocation[] {
    const arrays: ArrayBufferView[] = [];
    for (const chunk of chunks) for (const lod of chunk.lods) {
        arrays.push(lod.ranges, lod.offsets, lod.tileOffsets, lod.angles, lod.scales, lod.phases, lod.shades);
    }
    return collectCpuBufferAllocations(arrays);
}

export function forestLayoutAllocations(chunks: Iterable<WorldVegetationForestChunkLayout>): ResourceAllocation[] {
    const arrays: ArrayBufferView[] = [];
    for (const chunk of chunks) for (const lod of chunk.lods) arrays.push(lod.ranges, lod.matrices);
    return collectCpuBufferAllocations(arrays);
}

export function vegetationLayoutAllocations(layout: WorldVegetationLayout): ResourceAllocation[] {
    return [...grassLayoutAllocations(layout.grass), ...forestLayoutAllocations(layout.forest)];
}

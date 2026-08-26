import type { MapInfo } from "../interfaces";
import type { FogState } from "../objects/FogOfWar";

const UNSET_FOG_STATE = 0xff;
const MAX_DENSE_FOG_CELLS = 100_000_000;

//Finite worlds use one byte per logical cell, allocated only after the first
//fog update. Infinite or exceptionally large sparse worlds retain string keys.
//This keeps a 512x512 renderer-side fog copy at 256 KiB rather than hundreds
//of thousands of Map entries and coordinate strings.
export class FogStateStore {
    private dense: Uint8Array | undefined;
    private readonly denseLength: number | undefined;
    private readonly sparse = new Map<string, FogState>();
    private count = 0;

    constructor(private readonly map: MapInfo) {
        const cells = map.w * map.h;
        if (!map.infinite && Number.isSafeInteger(map.w) && map.w >= 0
            && Number.isSafeInteger(map.h) && map.h >= 0
            && Number.isSafeInteger(cells) && cells <= MAX_DENSE_FOG_CELLS) {
            this.denseLength = cells;
        }
    }

    public set(x: number, y: number, state: FogState): void {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
        if (this.denseLength !== undefined) {
            const index = this.denseIndex(x, y);
            if (index === undefined) return;
            this.dense ??= this.createDenseStorage();
            if (this.dense[index] === UNSET_FOG_STATE) this.count += 1;
            this.dense[index] = state;
            return;
        }
        const key = `${x},${y}`;
        if (!this.sparse.has(key)) this.count += 1;
        this.sparse.set(key, state);
    }

    public get(x: number, y: number): FogState | undefined {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
        if (this.denseLength !== undefined) {
            if (!this.dense) return undefined;
            const index = this.denseIndex(x, y);
            if (index === undefined) return undefined;
            const state = this.dense[index];
            return state === UNSET_FOG_STATE ? undefined : state as FogState;
        }
        return this.sparse.get(`${x},${y}`);
    }

    public forEach(visit: (state: FogState, x: number, y: number) => void): void {
        if (this.denseLength !== undefined) {
            if (!this.dense) return;
            for (let index = 0; index < this.dense.length; index += 1) {
                const state = this.dense[index];
                if (state === UNSET_FOG_STATE) continue;
                visit(state as FogState, Math.floor(index / this.map.h), index % this.map.h);
            }
            return;
        }
        for (const [key, state] of this.sparse) {
            const separator = key.indexOf(",");
            visit(state, Number(key.slice(0, separator)), Number(key.slice(separator + 1)));
        }
    }

    public get size(): number {
        return this.count;
    }

    public get storageBytes(): number {
        return this.dense?.byteLength ?? 0;
    }

    private createDenseStorage(): Uint8Array {
        const storage = new Uint8Array(this.denseLength!);
        storage.fill(UNSET_FOG_STATE);
        return storage;
    }

    private denseIndex(x: number, y: number): number | undefined {
        if (x < 0 || x >= this.map.w || y < 0 || y >= this.map.h) return undefined;
        return x * this.map.h + y;
    }
}

import {
    assertWorldTileOverride,
    cloneWorldTileOverride,
    type WorldTileOverride
} from "./generateWorldChunk";

export const WORLD_DELTA_FORMAT_VERSION = 2;
const LEGACY_WORLD_DELTA_FORMAT_VERSION = 1;

export interface WorldDeltaEntry {
    x: number;
    y: number;
    override: WorldTileOverride;
}

export interface WorldDeltaChange {
    x: number;
    y: number;
    // null removes a persisted override; an object replaces the complete
    // coordinate override after the caller has merged partial edits.
    override: WorldTileOverride | null;
}

export interface WorldDeltaReadOptions {
    chunkSize: number;
}

export interface WorldDeltaBatchOptions extends WorldDeltaReadOptions {
    // 0 means that no record may exist yet.
    expectedRevision?: number;
}

export interface WorldChunkDelta {
    version: typeof WORLD_DELTA_FORMAT_VERSION;
    worldId: string;
    chunkX: number;
    chunkY: number;
    chunkSize: number;
    revision: number;
    entries: readonly WorldDeltaEntry[];
}

export interface WorldDeltaStore {
    loadChunk(
        worldId: string,
        chunkX: number,
        chunkY: number,
        options: WorldDeltaReadOptions
    ): Promise<WorldChunkDelta | undefined>;
    putChunkDelta?(
        worldId: string,
        chunkX: number,
        chunkY: number,
        changes: readonly WorldDeltaChange[],
        options: WorldDeltaBatchOptions
    ): Promise<WorldChunkDelta | undefined>;
    putTile(worldId: string, chunkX: number, chunkY: number, entry: WorldDeltaEntry, options: WorldDeltaReadOptions): void;
    deleteTile(
        worldId: string,
        chunkX: number,
        chunkY: number,
        x: number,
        y: number,
        options: WorldDeltaReadOptions
    ): void;
    flush(): Promise<void>;
    listWorld?(worldId: string): Promise<readonly WorldChunkDelta[]>;
    replaceWorld?(worldId: string, deltas: readonly WorldChunkDelta[]): Promise<void>;
    clear(worldId: string): Promise<void>;
    dispose(): void;
}

export class WorldDeltaConflictError extends Error {
    public readonly name = "WorldDeltaConflictError";

    constructor(
        public readonly expectedRevision: number,
        public readonly actualRevision: number
    ) {
        super(`World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
    }
}

export function assertWorldDeltaChunkIdentity(worldId: string, chunkX: number, chunkY: number): void {
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
        throw new TypeError("worldId must be a non-empty string");
    }
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
        throw new RangeError("world delta chunk coordinates must be safe integers");
    }
}

export function assertWorldDeltaChunkSize(chunkSize: number): void {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError("world delta chunkSize must be a positive safe integer");
    }
}

export function worldDeltaTileBelongsToChunk(
    x: number,
    y: number,
    chunkX: number,
    chunkY: number,
    chunkSize: number
): boolean {
    return Math.floor(x / chunkSize) === chunkX && Math.floor(y / chunkSize) === chunkY;
}

export function normalizeWorldChunkDelta(
    value: unknown,
    worldId: string,
    chunkX: number,
    chunkY: number,
    options: WorldDeltaReadOptions
): WorldChunkDelta {
    assertWorldDeltaChunkIdentity(worldId, chunkX, chunkY);
    assertWorldDeltaChunkSize(options.chunkSize);
    const candidate = value as Partial<WorldChunkDelta> & { version?: number; entries?: readonly WorldDeltaEntry[] };
    if (!candidate || (candidate.version !== WORLD_DELTA_FORMAT_VERSION
        && candidate.version !== LEGACY_WORLD_DELTA_FORMAT_VERSION) || candidate.worldId !== worldId
        || candidate.chunkX !== chunkX || candidate.chunkY !== chunkY
        || (candidate.version === WORLD_DELTA_FORMAT_VERSION && candidate.chunkSize !== options.chunkSize)
        || !Number.isSafeInteger(candidate.revision) || candidate.revision! < 1 || !Array.isArray(candidate.entries)
        || candidate.entries.some(entry => !entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y)
            || !worldDeltaTileBelongsToChunk(entry.x, entry.y, chunkX, chunkY, options.chunkSize)
            || !entry.override || typeof entry.override !== "object" || Array.isArray(entry.override))) {
        throw new TypeError("world chunk delta is invalid or incompatible");
    }
    const keys = new Set<string>();
    for (const entry of candidate.entries) {
        assertWorldTileOverride(entry.override);
        const key = `${entry.x},${entry.y}`;
        if (keys.has(key)) throw new TypeError("world chunk delta contains duplicate tile coordinates");
        keys.add(key);
    }
    return {
        version: WORLD_DELTA_FORMAT_VERSION,
        worldId,
        chunkX,
        chunkY,
        chunkSize: options.chunkSize,
        revision: candidate.revision!,
        entries: candidate.entries.map(entry => ({
            x: entry.x,
            y: entry.y,
            override: cloneWorldTileOverride(entry.override)
        }))
    };
}

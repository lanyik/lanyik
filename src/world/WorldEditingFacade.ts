import { getMapTile, normalizeMapCoordinates } from "../helpers/topology";
import { MapInfo, Point, TileInfo } from "../interfaces";
import {
    assertWorldTileOverride,
    WorldTileOverride,
    WorldTileOverrideChange
} from "./generateWorldChunk";
import { isMutableWorldSource, MutableWorldSource, WorldSource } from "./WorldSource";

export interface WorldEditingFacadeOptions {
    visualSignature?(tile: TileInfo | undefined): string;
}

export interface WorldEditResult {
    readonly source: MutableWorldSource;
    readonly changed: boolean;
    readonly dirtyTiles: readonly Point[];
    /** `city` can update terrain/city and suppress vegetation in place. */
    readonly refreshKind: WorldRenderRefreshKind;
}

export type WorldRenderRefreshKind = "none" | "city" | "terrain";

export interface WorldEditingStats {
    readonly disposed: boolean;
    readonly editBatches: number;
    readonly changedTiles: number;
    readonly visualDirtyTiles: number;
}

interface TileVisualState {
    readonly point: Point;
    readonly visual: string;
    readonly terrain: string;
    readonly city: string;
}

export function worldTileTerrainSignature(tile: TileInfo | undefined): string {
    const modifiers = tile?.modifiers ? [...tile.modifiers].sort() : [];
    const rivers = tile?.rivers
        ? tile.rivers.map(river => `${river.riverIndex}:${river.riverTileIndex}`).sort()
        : [];
    return JSON.stringify([
        tile?.type ?? null,
        modifiers,
        tile?.treeModel ?? null,
        rivers
    ]);
}

export function worldTileCitySignature(tile: TileInfo | undefined): string {
    return JSON.stringify([
        Boolean(tile?.city),
        tile?.city?.name ?? null,
        tile?.city?.model ?? null
    ]);
}

export function worldTileVisualSignature(tile: TileInfo | undefined): string {
    return JSON.stringify([worldTileTerrainSignature(tile), worldTileCitySignature(tile)]);
}

function refreshKind(
    beforeTerrain: string,
    beforeCity: string,
    after: TileInfo | undefined
): WorldRenderRefreshKind {
    if (worldTileTerrainSignature(after) !== beforeTerrain) return "terrain";
    return worldTileCitySignature(after) !== beforeCity ? "city" : "none";
}

// Owns coordinate canonicalization, validation and source mutation. Rendering
// receives only the resulting dirty coordinates, which keeps editor semantics
// independent from Three.js and streaming implementation details.
export class WorldEditingFacade {
    private readonly visualSignature: (tile: TileInfo | undefined) => string;
    private disposed = false;
    private editBatches = 0;
    private changedTiles = 0;
    private visualDirtyTiles = 0;

    constructor(
        public readonly source: WorldSource,
        private readonly map: MapInfo,
        options: WorldEditingFacadeOptions = {}
    ) {
        if (source.map !== undefined && source.map !== map) {
            throw new TypeError("world editing facade map must belong to its source");
        }
        this.visualSignature = options.visualSignature ?? worldTileVisualSignature;
    }

    public setTileOverride(x: number, y: number, changes: WorldTileOverride): WorldEditResult {
        const source = this.mutableSource();
        this.assertCoordinates(x, y);
        assertWorldTileOverride(changes);
        const point = this.normalizeRequired(x, y);
        const before = this.captureVisualState(point);
        source.setTileOverride(point.x, point.y, changes);
        return this.completeEdit(source, true, 1, [before]);
    }

    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): WorldEditResult {
        const source = this.mutableSource();
        if (!Array.isArray(changes)) throw new TypeError("tile overrides must be an array");
        const normalized: WorldTileOverrideChange[] = [];
        const before = new Map<string, TileVisualState>();
        for (const change of changes) {
            if (!change || typeof change !== "object") {
                throw new RangeError("tile override coordinates must be safe integers");
            }
            this.assertCoordinates(change.x, change.y);
            assertWorldTileOverride(change.changes);
            const point = this.normalizeRequired(change.x, change.y);
            const key = `${point.x},${point.y}`;
            if (!before.has(key)) before.set(key, this.captureVisualState(point));
            normalized.push({ x: point.x, y: point.y, changes: change.changes });
        }
        if (source.setTileOverrides) source.setTileOverrides(normalized);
        else for (const change of normalized) source.setTileOverride(change.x, change.y, change.changes);
        return this.completeEdit(source, normalized.length > 0, before.size, before.values());
    }

    public clearTileOverride(x: number, y: number): WorldEditResult {
        const source = this.mutableSource();
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
        }
        const point = normalizeMapCoordinates(this.map, x, y);
        if (!point) return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
        const before = this.captureVisualState(point);
        if (!source.clearTileOverride(point.x, point.y)) {
            return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
        }
        return this.completeEdit(source, true, 1, [before]);
    }

    public flush(): Promise<void> {
        const source = this.mutableSource();
        return source.flushDeltas?.() ?? Promise.resolve();
    }

    public dispose(): void { this.disposed = true; }

    public get stats(): Readonly<WorldEditingStats> {
        return {
            disposed: this.disposed,
            editBatches: this.editBatches,
            changedTiles: this.changedTiles,
            visualDirtyTiles: this.visualDirtyTiles
        };
    }

    private mutableSource(): MutableWorldSource {
        if (this.disposed) throw new Error("WorldEditingFacade has been disposed");
        if (!isMutableWorldSource(this.source)) {
            throw new Error("The current world source does not support tile overrides");
        }
        return this.source;
    }

    private assertCoordinates(x: number, y: number): void {
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            throw new RangeError("tile override coordinates must be safe integers");
        }
    }

    private normalizeRequired(x: number, y: number): Point {
        const point = normalizeMapCoordinates(this.map, x, y);
        if (!point) throw new RangeError("tile override coordinates are outside the world bounds");
        return point;
    }

    private captureVisualState(point: Point): TileVisualState {
        const tile = getMapTile(this.map, point.x, point.y);
        return {
            point,
            visual: this.visualSignature(tile),
            terrain: worldTileTerrainSignature(tile),
            city: worldTileCitySignature(tile)
        };
    }

    private completeEdit(
        source: MutableWorldSource,
        changed: boolean,
        changedTiles: number,
        before: Iterable<TileVisualState>
    ): WorldEditResult {
        const dirtyTiles: Point[] = [];
        let refresh: WorldRenderRefreshKind = "none";
        for (const state of before) {
            const after = getMapTile(this.map, state.point.x, state.point.y);
            if (this.visualSignature(after) === state.visual) continue;
            dirtyTiles.push(state.point);
            const detected = refreshKind(state.terrain, state.city, after);
            if (detected === "terrain") refresh = "terrain";
            else if (detected === "city" && refresh === "none") refresh = "city";
        }
        // A custom visual signature may include application fields unknown to
        // the built-in classifier. Conservatively rebuild terrain in that case.
        if (dirtyTiles.length > 0 && refresh === "none") refresh = "terrain";
        this.record(changedTiles, dirtyTiles.length);
        return { source, changed, dirtyTiles, refreshKind: refresh };
    }

    private record(changedTiles: number, dirtyTiles: number): void {
        this.editBatches += 1;
        this.changedTiles += changedTiles;
        this.visualDirtyTiles += dirtyTiles;
    }
}

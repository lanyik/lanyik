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
}

export interface WorldEditingStats {
    readonly disposed: boolean;
    readonly editBatches: number;
    readonly changedTiles: number;
    readonly visualDirtyTiles: number;
}

export function worldTileVisualSignature(tile: TileInfo | undefined): string {
    const modifiers = tile?.modifiers ? [...tile.modifiers].sort() : [];
    const rivers = tile?.rivers
        ? tile.rivers.map(river => `${river.riverIndex}:${river.riverTileIndex}`).sort()
        : [];
    return JSON.stringify([
        tile?.type ?? null,
        modifiers,
        tile?.treeModel ?? null,
        rivers,
        Boolean(tile?.city),
        tile?.city?.name ?? null,
        tile?.city?.model ?? null
    ]);
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
        const before = this.visualSignature(getMapTile(this.map, point.x, point.y));
        source.setTileOverride(point.x, point.y, changes);
        const dirty = this.visualSignature(getMapTile(this.map, point.x, point.y)) !== before ? [point] : [];
        this.record(1, dirty.length);
        return { source, changed: true, dirtyTiles: dirty };
    }

    public setTileOverrides(changes: readonly WorldTileOverrideChange[]): WorldEditResult {
        const source = this.mutableSource();
        if (!Array.isArray(changes)) throw new TypeError("tile overrides must be an array");
        const normalized: WorldTileOverrideChange[] = [];
        const before = new Map<string, { point: Point; signature: string }>();
        for (const change of changes) {
            if (!change || typeof change !== "object") {
                throw new RangeError("tile override coordinates must be safe integers");
            }
            this.assertCoordinates(change.x, change.y);
            assertWorldTileOverride(change.changes);
            const point = this.normalizeRequired(change.x, change.y);
            const key = `${point.x},${point.y}`;
            if (!before.has(key)) {
                before.set(key, { point, signature: this.visualSignature(getMapTile(this.map, point.x, point.y)) });
            }
            normalized.push({ x: point.x, y: point.y, changes: change.changes });
        }
        if (source.setTileOverrides) source.setTileOverrides(normalized);
        else for (const change of normalized) source.setTileOverride(change.x, change.y, change.changes);
        const dirty = [...before.values()]
            .filter(({ point, signature }) => this.visualSignature(getMapTile(this.map, point.x, point.y)) !== signature)
            .map(({ point }) => point);
        this.record(before.size, dirty.length);
        return { source, changed: normalized.length > 0, dirtyTiles: dirty };
    }

    public clearTileOverride(x: number, y: number): WorldEditResult {
        const source = this.mutableSource();
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
            return { source, changed: false, dirtyTiles: [] };
        }
        const point = normalizeMapCoordinates(this.map, x, y);
        if (!point) return { source, changed: false, dirtyTiles: [] };
        const before = this.visualSignature(getMapTile(this.map, point.x, point.y));
        if (!source.clearTileOverride(point.x, point.y)) {
            return { source, changed: false, dirtyTiles: [] };
        }
        const dirty = this.visualSignature(getMapTile(this.map, point.x, point.y)) !== before ? [point] : [];
        this.record(1, dirty.length);
        return { source, changed: true, dirtyTiles: dirty };
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

    private record(changedTiles: number, dirtyTiles: number): void {
        this.editBatches += 1;
        this.changedTiles += changedTiles;
        this.visualDirtyTiles += dirtyTiles;
    }
}

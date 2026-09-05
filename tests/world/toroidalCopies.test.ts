import { describe, expect, test, vi } from "vitest";
import {
    BufferGeometry,
    InstancedBufferGeometry,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Vector2
} from "three";

import { HexMap } from "../../src/HexMap";
import { Land } from "../../src/enums";
import { WorldChunkMetadata } from "../../src/helpers/chunks";
import { MapInfo, Point, TileInfo } from "../../src/interfaces";
import { WorldChunk, WorldSource } from "../../src/world/WorldSource";
import { WorldRenderLayer, WorldRenderLayerRegistry } from "../../src/rendering/WorldRenderLayer";

type TestableHexMap = {
    terrain?: { activateChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2): InstancedBufferGeometry };
    cloneWorldObject(source: Object3D, offsetX: number, offsetY: number): Object3D;
    activateWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]): unknown;
    worldCopyMaterialCache: Map<string, unknown>;
    worldCopyMaterials: unknown[];
    worldPatternOffset: Vector2;
};

type OverrideTestableHexMap = {
    disposed: boolean;
    mapData: MapInfo;
    readonly worldSource: WorldSource;
    worldController: { source: WorldSource; streamer?: { residentChunks: readonly WorldChunk[] } };
    setTileOverride: HexMap["setTileOverride"];
    setTileOverrides: HexMap["setTileOverrides"];
    clearTileOverride: HexMap["clearTileOverride"];
    enqueueTileRenderRefresh(point: Point, source: WorldSource, refreshKind?: string): Promise<void>;
    enqueueTileRenderRefreshes(points: readonly Point[], source: WorldSource, refreshKind?: string): Promise<void>;
};

type RefreshTestableHexMap = {
    disposed: boolean;
    loadRevision: number;
    mapData: MapInfo;
    readonly worldSource: WorldSource;
    worldController: { source: WorldSource; streamer: { residentChunks: readonly WorldChunk[] } };
    worldChunkLayers: Map<string, { points: readonly Point[]; revision: number }>;
    worldRenderLayers: WorldRenderLayerRegistry;
    initializedWorldRenderLayers: Set<string>;
    worldLayerRevision: number;
    unmountRegisteredWorldRenderLayer(layer: WorldRenderLayer, key: string): Error[];
    mountRegisteredWorldRenderLayer(layer: WorldRenderLayer, key: string): Promise<void>;
    reportWorldRenderLayerErrors(): void;
    updateWorldChunkVisibility(): void;
    refreshTileOverridesRendering(points: readonly Point[], source: WorldSource, revision: number): Promise<void>;
};

const metadata: WorldChunkMetadata = {
    id: "land:0,0",
    key: "0,0",
    chunkX: 0,
    chunkY: 0,
    kind: "land",
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }
};

function testableMap(): TestableHexMap {
    const map = Object.create(HexMap.prototype) as TestableHexMap;
    map.worldCopyMaterialCache = new Map();
    map.worldCopyMaterials = [];
    map.worldPatternOffset = new Vector2();
    return map;
}

describe("toroidal render copies", () => {
    test("retains per-chunk render callbacks when cloning an image", () => {
        const map = testableMap();
        const source = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
        const beforeRender = vi.fn();
        source.onBeforeRender = beforeRender;

        const copy = map.cloneWorldObject(source, 100, 200);

        expect(copy.onBeforeRender).toBe(beforeRender);
    });

    test("shares lazily activated terrain geometry with every visible image", () => {
        const map = testableMap();
        const geometry = new InstancedBufferGeometry();
        map.terrain = { activateChunk: vi.fn(() => geometry) };
        const primary = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
        const repeated = new Mesh(new BufferGeometry(), new MeshBasicMaterial());

        map.activateWorldChunk(metadata, 1, [primary, repeated]);

        expect(primary.geometry).toBe(geometry);
        expect(repeated.geometry).toBe(geometry);
    });

    test("routes sparse overrides through HexMap and skips GPU work for unit-only state", async () => {
        let currentTile: TileInfo = { type: Land.land };
        const setTileOverride = vi.fn((_x: number, _y: number, changes: Partial<TileInfo>) => {
            currentTile = { ...currentTile, ...changes };
        });
        const clearTileOverride = vi.fn(() => {
            currentTile = { type: Land.land };
            return true;
        });
        const refresh = vi.fn((_point: Point, _source: WorldSource, _refreshKind?: string) => Promise.resolve());
        const map = Object.create(HexMap.prototype) as OverrideTestableHexMap;
        map.disposed = false;
        map.mapData = { data: {}, w: 20, h: 17, wrapX: true, wrapY: true, tileAt: () => currentTile };
        map.worldController = {
            source: { setTileOverride, clearTileOverride } as unknown as WorldSource
        };
        map.enqueueTileRenderRefresh = refresh;

        await map.setTileOverride(-1, -1, { unit: "scout" });
        expect(setTileOverride).toHaveBeenLastCalledWith(19, 16, { unit: "scout" });
        expect(refresh).not.toHaveBeenCalled();

        await map.setTileOverride(-1, -1, { city: { name: "Harbor" } });
        expect(refresh).toHaveBeenCalledWith({ x: 19, y: 16 }, map.worldSource, "city");
        await expect(map.clearTileOverride(-1, -1)).resolves.toBe(true);
        expect(clearTileOverride).toHaveBeenCalledWith(19, 16);
        expect(refresh).toHaveBeenCalledTimes(2);

        await map.setTileOverride(-1, -1, { unit: "second-scout" });
        await expect(map.clearTileOverride(-1, -1)).resolves.toBe(true);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    test("coalesces batch overrides into one render refresh with unique dirty tiles", async () => {
        const tiles = new Map<string, TileInfo>();
        const setTileOverrides = vi.fn((changes: Array<{ x: number; y: number; changes: Partial<TileInfo> }>) => {
            for (const change of changes) {
                const key = `${change.x},${change.y}`;
                tiles.set(key, { type: Land.land, ...tiles.get(key), ...change.changes });
            }
        });
        const refresh = vi.fn((_points: readonly Point[], _source: WorldSource, _refreshKind?: string) => Promise.resolve());
        const map = Object.create(HexMap.prototype) as OverrideTestableHexMap;
        map.disposed = false;
        map.mapData = {
            data: {}, w: 20, h: 17, wrapX: true, wrapY: true,
            tileAt: (x, y) => tiles.get(`${x},${y}`) ?? { type: Land.land }
        };
        map.worldController = {
            source: {
                setTileOverride: vi.fn(), clearTileOverride: vi.fn(), setTileOverrides
            } as unknown as WorldSource
        };
        map.enqueueTileRenderRefreshes = refresh;

        await map.setTileOverrides([
            { x: -1, y: -1, changes: { unit: "scout" } },
            { x: 1, y: 2, changes: { city: { name: "First" } } },
            { x: 1, y: 2, changes: { city: { name: "Final" } } },
            { x: 13, y: 2, changes: { type: Land.mountain } }
        ]);

        expect(setTileOverrides).toHaveBeenCalledOnce();
        expect(refresh).toHaveBeenCalledOnce();
        expect(refresh.mock.calls[0][0]).toEqual([{ x: 1, y: 2 }, { x: 13, y: 2 }]);
        expect(refresh.mock.calls[0][2]).toBe("terrain");
    });

    test("remounts only resident source chunks touched by a tile and its neighbors", async () => {
        const chunks: WorldChunk[] = [
            { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [] },
            { chunkX: 1, chunkY: 0, chunkSize: 12, coreTiles: [] },
            { chunkX: 4, chunkY: 4, chunkSize: 12, coreTiles: [] }
        ];
        const source = {
            chunkSize: 12,
            resolveChunk: (x: number, y: number) => ({ x, y })
        } as unknown as WorldSource;
        const unmount = vi.fn<RefreshTestableHexMap["unmountRegisteredWorldRenderLayer"]>(() => []);
        const mount = vi.fn<RefreshTestableHexMap["mountRegisteredWorldRenderLayer"]>(async () => {});
        const updateVisibility = vi.fn();
        const map = Object.create(HexMap.prototype) as RefreshTestableHexMap;
        map.disposed = false;
        map.loadRevision = 3;
        map.mapData = { data: {}, w: 1, h: 1, infinite: true };
        map.worldController = { source, streamer: { residentChunks: chunks } };
        map.worldChunkLayers = new Map([
            ["0,0", { points: [], revision: 1 }],
            ["1,0", { points: [], revision: 1 }],
            ["4,4", { points: [], revision: 1 }]
        ]);
        map.worldRenderLayers = new WorldRenderLayerRegistry();
        map.worldRenderLayers.register({ id: "content", mountChunk: () => {}, unmountChunk: () => {}, dispose: () => {} });
        map.initializedWorldRenderLayers = new Set(["content"]);
        map.worldLayerRevision = 1;
        map.unmountRegisteredWorldRenderLayer = unmount;
        map.mountRegisteredWorldRenderLayer = mount;
        map.reportWorldRenderLayerErrors = vi.fn();
        map.updateWorldChunkVisibility = updateVisibility;

        await map.refreshTileOverridesRendering([{ x: 11, y: 5 }], source, 3);

        expect(unmount.mock.calls.map(([, key]) => key)).toEqual(["0,0", "1,0"]);
        expect(mount.mock.calls.map(([, key]) => key)).toEqual(["0,0", "1,0"]);
        expect(updateVisibility).toHaveBeenCalledOnce();
    });
});

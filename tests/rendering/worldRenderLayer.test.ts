import { describe, expect, test, vi } from "vitest";
import { Group, Object3D } from "three";

import { HexMap } from "../../src/HexMap";
import { MapInfo } from "../../src/interfaces";
import { LifecycleScope } from "../../src/runtime/LifecycleScope";
import {
    WorldRenderLayer,
    WorldRenderLayerLifecycleError,
    WorldRenderLayerRegistry
} from "../../src/rendering/WorldRenderLayer";
import { WorldChunk, WorldSource } from "../../src/world/WorldSource";
import type { WorldSurfaceAnchor } from "../../src/world/WorldSurfaceView";
import { deferred } from "../helpers/deferred";

function layer(id: string, kinds?: readonly string[]): WorldRenderLayer {
    return {
        id, kinds,
        mountChunk: vi.fn(),
        unmountChunk: vi.fn(),
        dispose: vi.fn()
    };
}

describe("WorldRenderLayerRegistry", () => {
    test("routes custom metadata kinds and rejects ownership conflicts", () => {
        const registry = new WorldRenderLayerRegistry();
        const roads = layer("roads", ["road", "bridge"]);
        registry.register(roads);
        expect(registry.forKind("road")).toBe(roads);
        expect(registry.forKind("bridge")).toBe(roads);
        expect(() => registry.register(layer("other", ["road"]))).toThrow(/already owned/);
        expect(registry.unregister("roads")).toBe(roads);
        expect(registry.forKind("road")).toBeUndefined();
    });

    test("disposes every layer even when one layer throws", () => {
        const registry = new WorldRenderLayerRegistry();
        const disposed: string[] = [];
        registry.register({
            ...layer("healthy"),
            dispose: () => { disposed.push("healthy"); }
        });
        registry.register({
            ...layer("broken"),
            dispose: () => {
                disposed.push("broken");
                throw new Error("dispose failed");
            }
        });

        expect(() => registry.dispose()).toThrow(WorldRenderLayerLifecycleError);
        expect(disposed).toEqual(["broken", "healthy"]);
        expect(registry.values()).toEqual([]);
    });
});

type LayerTestMap = {
    disposed: boolean;
    options: { size: number };
    mapData: MapInfo;
    readonly worldSource: WorldSource;
    worldController: { source: WorldSource; lifecycle: LifecycleScope; streamer?: { residentChunks: readonly WorldChunk[] } };
    worldRoot: Group;
    worldChunkLayers: Map<string, {
        chunk: WorldChunk; points: readonly { x: number; y: number }[]; revision: number;
        renderLayerPromises?: Map<string, Promise<void>>;
    }>;
    worldRenderLayers: WorldRenderLayerRegistry;
    builtinWorldRenderLayerIds: Set<string>;
    initializedWorldRenderLayers: Set<string>;
    worldRenderLayerInitRevisions: Map<string, number>;
    worldRenderLayerObjects: Map<string, Map<string, Set<Object3D>>>;
    surfaceHiddenObjects: Map<Object3D, { count: number; visible: boolean }>;
    worldSurface?: WorldSurfaceAnchor;
    worldLayerRevision: number;
    frameTasks: { cancel(key: string): boolean };
    worldChunkMountQueue: { forget(key: string): void };
    chunkScheduler: { invalidateScene(): void };
    applyWorldPatternToObject(): void;
    refreshWorldCopies(): void;
    updateWorldChunkVisibility(): void;
    registerWorldRenderLayer: HexMap["registerWorldRenderLayer"];
    unregisterWorldRenderLayer: HexMap["unregisterWorldRenderLayer"];
    refreshCustomSurfaceLayers(): Promise<void>;
    unmountWorldChunk(chunk: WorldChunk): void;
};

describe("HexMap custom world render layers", () => {
    function createLayerTestMap(chunks: WorldChunk[]): LayerTestMap {
        const map = Object.create(HexMap.prototype) as LayerTestMap;
        map.disposed = false;
        map.options = { size: 40 };
        map.mapData = { data: {}, w: 1, h: 1, infinite: true };
        map.worldController = {
            source: { map: map.mapData } as WorldSource,
            lifecycle: new LifecycleScope("layer-test-world")
        };
        map.worldRoot = new Group();
        map.worldChunkLayers = new Map(chunks.map(chunk => [
            `${chunk.chunkX},${chunk.chunkY}`,
            { chunk, points: chunk.coreTiles, revision: 1 }
        ]));
        map.worldRenderLayers = new WorldRenderLayerRegistry();
        map.builtinWorldRenderLayerIds = new Set();
        map.initializedWorldRenderLayers = new Set();
        map.worldRenderLayerInitRevisions = new Map();
        map.worldRenderLayerObjects = new Map();
        map.surfaceHiddenObjects = new Map();
        map.worldLayerRevision = 1;
        map.frameTasks = { cancel: vi.fn(() => true) };
        map.worldChunkMountQueue = { forget: vi.fn() };
        map.chunkScheduler = { invalidateScene: vi.fn() };
        map.applyWorldPatternToObject = vi.fn();
        map.refreshWorldCopies = vi.fn();
        map.updateWorldChunkVisibility = vi.fn();
        return map;
    }

    test("invalidates async contexts but keeps the record visible during unmount", async () => {
        const chunk: WorldChunk = { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 1, y: 2 }] };
        const map = createLayerTestMap([chunk]);
        let mountedIsCurrent: (() => boolean) | undefined;
        let observedDuringUnmount: { oldContext: boolean; recordVisible: boolean; unmountContext: boolean } | undefined;
        const custom: WorldRenderLayer = {
            id: "lifecycle-probe",
            mountChunk(context) { mountedIsCurrent = context.isCurrent; },
            unmountChunk(context) {
                observedDuringUnmount = {
                    oldContext: mountedIsCurrent!(),
                    recordVisible: map.worldChunkLayers.has(context.key),
                    unmountContext: context.isCurrent()
                };
            },
            dispose: vi.fn()
        };
        await map.registerWorldRenderLayer(custom);
        expect(mountedIsCurrent!()).toBe(true);

        map.unmountWorldChunk(chunk);

        expect(observedDuringUnmount).toEqual({
            oldContext: false,
            recordVisible: true,
            unmountContext: true
        });
        expect(map.worldChunkLayers.has("0,0")).toBe(false);
        expect(mountedIsCurrent!()).toBe(false);
    });

    test("cleans host objects and disposes a layer when initialize fails", async () => {
        const object = new Object3D();
        const events: string[] = [];
        const custom: WorldRenderLayer = {
            id: "broken-init",
            initialize(host) {
                events.push("initialize");
                host.addObject(object);
                throw new Error("initialize failed");
            },
            unloadWorld() {
                events.push("unload");
                throw new Error("unload failed");
            },
            mountChunk: vi.fn(),
            unmountChunk: vi.fn(),
            dispose() { events.push("dispose"); }
        };
        const map = createLayerTestMap([]);

        await expect(map.registerWorldRenderLayer(custom)).rejects.toThrow(WorldRenderLayerLifecycleError);
        expect(events).toEqual(["initialize", "unload", "dispose"]);
        expect(map.worldRoot.children).not.toContain(object);
        expect(map.worldRenderLayers.get(custom.id)).toBeUndefined();
    });

    test("aborts a stale world-layer host and rejects its late object publication", async () => {
        const map = createLayerTestMap([]);
        const lifecycle = new LifecycleScope("layer-world");
        map.worldController = { source: map.worldSource, lifecycle };
        let host: Parameters<NonNullable<WorldRenderLayer["initialize"]>>[0] | undefined;
        await map.registerWorldRenderLayer({
            id: "async-layer",
            initialize: value => { host = value; },
            mountChunk: vi.fn(),
            unmountChunk: vi.fn(),
            dispose: vi.fn()
        });
        expect(host?.signal.aborted).toBe(false);
        expect("root" in host!).toBe(false);

        await lifecycle.close();
        const late = new Object3D();
        host!.addObject(late);
        expect(host!.signal.aborted).toBe(true);
        expect(map.worldRoot.children).not.toContain(late);
    });

    test("publishes the surface anchor and hides custom objects during a surface refresh", async () => {
        const map = createLayerTestMap([]);
        const surface: WorldSurfaceAnchor = {
            revision: 3,
            minimumHeight: 0,
            maximumHeight: 12,
            getTileCenterHeight: () => 4,
            getWorldHeight: () => 4
        };
        map.worldSurface = surface;
        const object = new Object3D();
        map.worldRoot.add(object);
        const surfaceChanged = vi.fn(async host => {
            expect(host.surface).toBe(surface);
            expect(object.visible).toBe(false);
        });
        const custom: WorldRenderLayer = {
            id: "surface-probe",
            mountChunk: vi.fn(),
            unmountChunk: vi.fn(),
            surfaceChanged,
            dispose: vi.fn()
        };
        map.worldRenderLayers.register(custom);
        map.initializedWorldRenderLayers.add(custom.id);
        map.worldRenderLayerObjects.set(custom.id, new Map([["@world", new Set([object])]]));

        await map.refreshCustomSurfaceLayers();

        expect(surfaceChanged).toHaveBeenCalledOnce();
        expect(object.visible).toBe(true);
    });

    test("keeps world settlement open until an aborted asynchronous mount drains", async () => {
        const chunk: WorldChunk = {
            chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 0, y: 0 }]
        };
        const map = createLayerTestMap([chunk]);
        const lifecycle = new LifecycleScope("async-mount-world");
        map.worldController = { source: map.worldSource, lifecycle };
        const gate = deferred();
        const late = new Object3D();
        const mount = vi.fn(async (context: Parameters<WorldRenderLayer["mountChunk"]>[0]) => {
            await gate.promise;
            context.addObject(late);
        });
        const registration = map.registerWorldRenderLayer({
            id: "slow-layer",
            mountChunk: mount,
            unmountChunk: vi.fn(),
            dispose: vi.fn()
        });
        await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());

        const closing = lifecycle.close();
        map.unmountWorldChunk(chunk);
        expect(lifecycle.stats).toMatchObject({ state: "closing", pendingTasks: 1 });
        gate.resolve();
        await Promise.all([registration, closing]);

        expect(lifecycle.stats).toMatchObject({ state: "closed", pendingTasks: 0 });
        expect(map.worldRoot.children).not.toContain(late);
    });

    test("rolls back a partial mount even when its unmount hook also fails", async () => {
        const chunk: WorldChunk = { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 1, y: 2 }] };
        const object = new Object3D();
        const events: string[] = [];
        const custom: WorldRenderLayer = {
            id: "broken-mount",
            initialize: () => { events.push("initialize"); },
            mountChunk(context) {
                events.push("mount");
                context.addObject(object);
                throw new Error("mount failed");
            },
            unmountChunk() {
                events.push("unmount");
                throw new Error("unmount failed");
            },
            unloadWorld: () => { events.push("unload"); },
            dispose: () => { events.push("dispose"); }
        };
        const map = createLayerTestMap([chunk]);

        await expect(map.registerWorldRenderLayer(custom)).rejects.toThrow(WorldRenderLayerLifecycleError);
        expect(events).toEqual(["initialize", "mount", "unmount", "unload", "dispose"]);
        expect(map.worldRoot.children).not.toContain(object);
        expect(map.worldRenderLayers.get(custom.id)).toBeUndefined();
    });

    test("finishes unregistering all chunks after teardown hooks throw", async () => {
        const chunks: WorldChunk[] = [
            { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 0, y: 0 }] },
            { chunkX: 1, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 12, y: 0 }] }
        ];
        const objects = new Map<string, Object3D>();
        const unmounted: string[] = [];
        let unloaded = false;
        let disposed = false;
        const custom: WorldRenderLayer = {
            id: "broken-teardown",
            mountChunk(context) {
                const object = new Object3D();
                objects.set(context.key, object);
                context.addObject(object);
            },
            unmountChunk(context) {
                unmounted.push(context.key);
                throw new Error(`unmount ${context.key}`);
            },
            unloadWorld() {
                unloaded = true;
                throw new Error("unload failed");
            },
            dispose() {
                disposed = true;
                throw new Error("dispose failed");
            }
        };
        const map = createLayerTestMap(chunks);
        await map.registerWorldRenderLayer(custom);

        expect(() => map.unregisterWorldRenderLayer(custom.id)).toThrow(WorldRenderLayerLifecycleError);
        expect(unmounted).toEqual(["1,0", "0,0"]);
        expect(unloaded).toBe(true);
        expect(disposed).toBe(true);
        expect(map.worldRenderLayers.get(custom.id)).toBeUndefined();
        expect(map.worldRoot.children).toEqual([]);
    });

    test("mounts existing chunks and fully cleans up on unregister", async () => {
        const chunk: WorldChunk = { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 1, y: 2 }] };
        const root = new Group();
        const events: string[] = [];
        const object = new Object3D();
        const custom: WorldRenderLayer = {
            id: "roads",
            kinds: ["road"],
            initialize: () => { events.push("initialize"); },
            mountChunk: context => { events.push(`mount:${context.key}`); context.addObject(object); },
            unmountChunk: context => { events.push(`unmount:${context.key}`); },
            unloadWorld: () => { events.push("unload"); },
            dispose: () => { events.push("dispose"); }
        };
        const map = Object.create(HexMap.prototype) as LayerTestMap;
        map.disposed = false;
        map.options = { size: 40 };
        map.mapData = { data: {}, w: 1, h: 1, infinite: true };
        map.worldController = {
            source: { map: map.mapData } as WorldSource,
            lifecycle: new LifecycleScope("layer-test-world")
        };
        map.worldRoot = root;
        map.worldChunkLayers = new Map([["0,0", { chunk, points: chunk.coreTiles, revision: 1 }]]);
        map.worldRenderLayers = new WorldRenderLayerRegistry();
        map.builtinWorldRenderLayerIds = new Set();
        map.initializedWorldRenderLayers = new Set();
        map.worldRenderLayerInitRevisions = new Map();
        map.worldRenderLayerObjects = new Map();
        map.chunkScheduler = { invalidateScene: vi.fn() };
        map.applyWorldPatternToObject = vi.fn();
        map.refreshWorldCopies = vi.fn();
        map.updateWorldChunkVisibility = vi.fn();

        await map.registerWorldRenderLayer(custom);
        expect(events).toEqual(["initialize", "mount:0,0"]);
        expect(root.children).toContain(object);
        expect(map.unregisterWorldRenderLayer("roads")).toBe(true);
        expect(events).toEqual(["initialize", "mount:0,0", "unmount:0,0", "unload", "dispose"]);
        expect(root.children).not.toContain(object);
    });

    test("uses refreshTiles without remounting an incremental custom layer", async () => {
        const refreshTiles = vi.fn();
        const custom: WorldRenderLayer = {
            id: "roads",
            mountChunk: vi.fn(),
            unmountChunk: vi.fn(),
            refreshTiles,
            dispose: vi.fn()
        };
        const chunk: WorldChunk = { chunkX: 0, chunkY: 0, chunkSize: 12, coreTiles: [{ x: 1, y: 1 }] };
        const map = Object.create(HexMap.prototype) as LayerTestMap & {
            loadRevision: number;
            refreshTileOverridesRendering(
                points: readonly { x: number; y: number }[],
                source: WorldSource,
                revision: number,
                refreshKind?: "none" | "city" | "terrain"
            ): Promise<void>;
        };
        map.disposed = false;
        map.options = { size: 40 };
        map.loadRevision = 2;
        map.mapData = { data: {}, w: 1, h: 1, infinite: true };
        const source = {
            map: map.mapData, chunkSize: 12,
            resolveChunk: (x: number, y: number) => ({ x, y })
        } as WorldSource;
        map.worldController = {
            source,
            lifecycle: new LifecycleScope("layer-refresh-world"),
            streamer: { residentChunks: [chunk] }
        };
        map.worldRoot = new Group();
        map.worldChunkLayers = new Map([["0,0", { chunk, points: chunk.coreTiles, revision: 1 }]]);
        map.worldRenderLayers = new WorldRenderLayerRegistry();
        map.worldRenderLayers.register(custom);
        map.builtinWorldRenderLayerIds = new Set();
        map.initializedWorldRenderLayers = new Set(["roads"]);
        map.worldRenderLayerInitRevisions = new Map();
        map.worldRenderLayerObjects = new Map();
        map.chunkScheduler = { invalidateScene: vi.fn() };
        map.applyWorldPatternToObject = vi.fn();
        map.refreshWorldCopies = vi.fn();
        map.updateWorldChunkVisibility = vi.fn();

        await map.refreshTileOverridesRendering([{ x: 1, y: 1 }], source, 2, "city");
        expect(refreshTiles).toHaveBeenCalledOnce();
        expect(refreshTiles.mock.calls[0][0]).toMatchObject({ refreshKind: "city" });
        expect(custom.unmountChunk).not.toHaveBeenCalled();
        expect(custom.mountChunk).not.toHaveBeenCalled();
    });
});

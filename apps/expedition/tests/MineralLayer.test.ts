import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Object3D } from "three";
import { ResourceBudgetLedger, StaticWorldSource, createWorldDescriptor, getWorldChunkMetadata, Land,
    type WorldRenderChunkContext, type WorldSource, type WorldSurfaceAnchor } from "three-hex-map";
import { MineralLayer } from "../src/presentation/layers/MineralLayer";
import { MineralField } from "../src/core/resources/MineralField";

describe("MineralLayer ownership", () => {
    it("rebuilds evicted instance buffers, follows surface changes and releases its asset account", async () => {
        const ledger = new ResourceBudgetLedger({ cpuBytes: 1_000_000, gpuBytes: 1_000_000 });
        const layer = new MineralLayer(ledger.createAccount("mineral-test"));
        const data: Record<number, Record<number, { type: Land }>> = {};
        for (let x = 0; x < 24; x += 1) {
            data[x] = {};
            for (let y = 0; y < 24; y += 1) data[x][y] = { type: Land.land };
        }
        const source = new StaticWorldSource({ w: 24, h: 24, data }, { chunkSize: 24 });
        const chunk = await source.loadChunk(0, 0);
        const surface: WorldSurfaceAnchor = { revision: 0, minimumHeight: 0, maximumHeight: 100,
            getTileCenterHeight: () => 0, getWorldHeight: () => 0 };
        const objects = new Set<Object3D>();
        const context: WorldRenderChunkContext = {
            map: source.map, source: Object.assign(source, { descriptor: createWorldDescriptor({ seed: "expedition-1" }) }) as WorldSource,
            tileSize: 48, surface, signal: new AbortController().signal, chunk, points: chunk.coreTiles, key: "0,0", revision: 1,
            isCurrent: () => true, addObject: object => { objects.add(object); }, removeObject: object => { objects.delete(object); },
            invalidateVisibility: vi.fn(), requestWorldCopyRefresh: vi.fn()
        };
        layer.initialize(context);
        layer.mountChunk(context);
        expect(objects.size).toBeGreaterThan(0);
        const mesh = [...objects][0] as InstancedMesh;
        const metadata = getWorldChunkMetadata(mesh)!;
        const activation = layer.activateLod(metadata, 0, [mesh]);
        const original = [...mesh.instanceMatrix.array];
        expect(activation.resourceCost.cpuBytes).toBeGreaterThan(0);
        activation.disposeGpu();
        layer.releaseChunk(metadata, [mesh]);
        expect(mesh.instanceMatrix.array.byteLength).toBe(0);
        expect(mesh.instanceColor).toBeNull();
        layer.activateLod(metadata, 2, [mesh]);
        expect([...mesh.instanceMatrix.array]).toEqual(original);
        Object.assign(surface, { maximumHeight: 200, getWorldHeight: () => 50 });
        layer.surfaceChanged(context);
        expect(mesh.instanceMatrix.array[13]).toBeCloseTo(original[13] + 50);
        expect(metadata.bounds.maxY).toBe(248);
        const field = new MineralField("expedition-1");
        const depleted = chunk.coreTiles.map(point => field.nodeAt(point.x, point.y, { type: "land", hill: false, forest: false, lake: false }))
            .filter(node => !!node).map(node => node.id);
        layer.setDepleted(depleted);
        expect(mesh.instanceMatrix.array[0]).toBe(0);
        layer.releaseChunk(metadata, [mesh]);
        layer.activateLod(metadata, 0, [mesh]);
        expect(mesh.instanceMatrix.array[0]).toBe(0);
        layer.unmountChunk(context);
        expect(objects.size).toBe(0);
        layer.unloadWorld();
        layer.dispose();
        expect(ledger.stats).toMatchObject({ accounts: 0, reservations: 0, cpuBytes: 0, gpuBytes: 0 });
        source.dispose();
    });
});

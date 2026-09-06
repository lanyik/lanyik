import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Object3D } from "three";
import { Land, ResourceBudgetLedger, StaticWorldSource, getWorldChunkMetadata, type WorldRenderChunkContext, type WorldSurfaceAnchor } from "three-hex-map";
import { BuildingLayer } from "../src/presentation/layers/BuildingLayer";
import { Industry } from "../src/core/construction/Industry";
import { BUILDINGS, type BuildingId } from "../src/content/buildings";
import { buildingFootprint } from "../src/core/spatial/footprint";

describe("BuildingLayer residency and ownership", () => {
    it("owns each occupied tile once across source chunks, reconstructs evicted models and removes demolished buildings", async () => {
        const ledger = new ResourceBudgetLedger({ cpuBytes: 4_000_000, gpuBytes: 4_000_000 });
        const layer = new BuildingLayer(ledger.createAccount("building-test"));
        const data: Record<number, Record<number, { type: Land }>> = {};
        for (let x = 0; x < 48; x += 1) { data[x] = {}; for (let y = 0; y < 24; y += 1) data[x][y] = { type: Land.land }; }
        const source = new StaticWorldSource({ w: 48, h: 24, data }, { chunkSize: 24 });
        const objects = new Set<Object3D>();
        const surface: WorldSurfaceAnchor = { revision: 0, minimumHeight: 0, maximumHeight: 100,
            getTileCenterHeight: () => 0, getWorldHeight: () => 0 };
        const contexts: WorldRenderChunkContext[] = [];
        for (let x = 0; x < 2; x += 1) {
            const chunk = await source.loadChunk(x, 0);
            contexts.push({ source, map: source.map, chunk, points: chunk.coreTiles, key: `${x},0`, revision: 1,
                surface, tileSize: 48, signal: new AbortController().signal, isCurrent: () => true,
                addObject: object => { objects.add(object); }, removeObject: object => { objects.delete(object); },
                invalidateVisibility: vi.fn(), requestWorldCopyRefresh: vi.fn() });
        }
        layer.initialize(contexts[0]);
        for (const context of contexts) layer.mountChunk(context);
        const industry = new Industry({ readTile: () => ({ terrain: { type: "land", hill: false, forest: false, lake: false } }) });
        industry.place("command-center", { x: 23, y: 5 }, 0);
        layer.setBuildings(industry.getSnapshot().buildings);
        const activate = () => {
            let count = 0;
            for (const object of objects) {
                const metadata = getWorldChunkMetadata(object);
                if (!metadata) continue;
                layer.activateLod(metadata, 0, [object]);
                const mesh = object as InstancedMesh;
                count += mesh.count;
                const matrices = [...mesh.instanceMatrix.array];
                layer.releaseChunk(metadata, [mesh]);
                expect(mesh.instanceMatrix.array.byteLength).toBe(0);
                layer.activateLod(metadata, 2, [mesh]);
                expect([...mesh.instanceMatrix.array]).toEqual(matrices);
            }
            return count;
        };
        expect(activate()).toBe(4);
        layer.unmountChunk(contexts[0]);
        expect(activate()).toBe(2);
        layer.mountChunk(contexts[0]);
        expect(activate()).toBe(4);
        industry.place("warehouse", { x: 20, y: 5 }, 0);
        layer.setBuildings(industry.getSnapshot().buildings);
        expect(activate()).toBe(6);
        const warehouse = industry.getSnapshot().buildings[1];
        industry.demolish(warehouse.id);
        layer.setBuildings(industry.getSnapshot().buildings);
        expect(activate()).toBe(4);
        const preview = industry.preview("warehouse", { x: 20, y: 5 }, 0);
        layer.showPlacement(preview);
        expect([...objects].find(object => object.name === "building-preview")?.visible).toBe(true);
        Object.assign(surface, { getTileCenterHeight: () => 25, getWorldHeight: () => 25 });
        layer.surfaceChanged(contexts[0]);
        expect(activate()).toBe(4);
        for (const object of objects) if (getWorldChunkMetadata(object)) expect((object as InstancedMesh).instanceMatrix.array[13]).toBeCloseTo(26.92);
        const additions = (["solar-array", "power-relay", "battery", "smelter"] as BuildingId[]).map((kind, index) => ({
            id: `new-${kind}`, kind, anchor: { x: 20 + index * 3, y: 15 }, rotation: 0 as const,
            cells: buildingFootprint(kind, { x: 20 + index * 3, y: 15 }, 0), paid: BUILDINGS[kind].cost
        }));
        layer.setBuildings([...industry.getSnapshot().buildings, ...additions]);
        expect(activate()).toBe(9);
        layer.showPlacement(industry.preview("power-relay", { x: 20, y: 10 }, 0));
        const coverage = [...objects].find(object => object.name === "building-preview")!.getObjectByName("power-coverage-preview") as InstancedMesh;
        expect(coverage.visible).toBe(true);
        expect(coverage.geometry.drawRange.count).toBeLessThanOrEqual(coverage.geometry.getAttribute("position").count);
        for (const context of contexts) layer.unmountChunk(context);
        layer.unloadWorld(contexts[0]);
        expect(objects.size).toBe(0);
        layer.dispose();
        expect(ledger.stats).toMatchObject({ accounts: 0, reservations: 0, cpuBytes: 0, gpuBytes: 0 });
        source.dispose();
    });
});

import { expect, it, vi } from "vitest";
import { Object3D } from "three";
import { Land, ResourceBudgetLedger, StaticWorldSource, type WorldRenderLayerHost } from "three-hex-map";
import { Explorer } from "../src/core/exploration/Explorer";
import { ExplorerLayer } from "../src/presentation/layers/ExplorerLayer";

it("anchors the astronaut to the actual surface and releases its model account across world replacement", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 1_000_000, gpuBytes: 1_000_000 });
    const layer = new ExplorerLayer(ledger.createAccount("explorer-test"));
    const source = new StaticWorldSource({ w: 1, h: 1, data: { 0: { 0: { type: Land.land } } } });
    const objects = new Set<Object3D>();
    const host: WorldRenderLayerHost = { source, map: source.map, tileSize: 48, signal: new AbortController().signal,
        surface: { revision: 0, minimumHeight: 0, maximumHeight: 100, getTileCenterHeight: () => 20, getWorldHeight: () => 20 },
        addObject: object => { objects.add(object); }, removeObject: object => { objects.delete(object); },
        invalidateVisibility: vi.fn(), requestWorldCopyRefresh: vi.fn() };
    layer.initialize(host);
    const explorer = new Explorer({ x: 0, y: 0 }, () => true);
    layer.update(explorer.getSnapshot(), explorer.renderPoint());
    const model = [...objects][0];
    expect(model.visible).toBe(true);
    expect(model.position.y).toBeCloseTo(21.92);
    const cost = ledger.stats.gpuBytes;
    expect(cost).toBeGreaterThan(0);
    for (let time = 0; time <= 200; time += 20) {
        explorer.sample(time, { x: 1, z: 0, sprint: false, active: true });
        layer.update(explorer.getSnapshot(), explorer.renderPoint());
    }
    expect(model.position.x).toBeGreaterThan(0);
    expect(ledger.stats.gpuBytes).toBe(cost);
    layer.unloadWorld(host);
    expect(objects.size).toBe(0);
    layer.update(undefined, undefined);
    layer.initialize(host);
    expect(model.visible).toBe(false);
    layer.dispose();
    expect(objects.size).toBe(0);
    expect(ledger.stats).toMatchObject({ accounts: 0, reservations: 0, cpuBytes: 0, gpuBytes: 0 });
    source.dispose();
});

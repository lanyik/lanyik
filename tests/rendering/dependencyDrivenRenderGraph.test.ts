import { describe, expect, test, vi } from "vitest";

import {
    DependencyDrivenRenderGraph,
    WorldRenderDependencyError,
    WorldRenderLayerChunkAccess
} from "../../src/rendering/DependencyDrivenRenderGraph";

const context: WorldRenderLayerChunkAccess = {
    key: { chunkX: 0, chunkY: 0 },
    effectiveRevision: 0,
    lod: 0,
    sample: () => ({
        groundHeight: 0,
        materialWeights: [1, 0, 0, 0],
        waterLevel: 0,
        waterDepth: 0,
        shorelineDistance: 1,
        flow: [0, 0],
        waterCoverage: 0,
        waterKind: 0,
        waterProfile: 0,
        waterBody: undefined
    })
};

describe("DependencyDrivenRenderGraph", () => {
    test("mounts owners before consumers and tears down in exact reverse order", async () => {
        const calls: string[] = [];
        const graph = new DependencyDrivenRenderGraph<WorldRenderLayerChunkAccess>(["compiled-surface"]);
        graph.register({
            id: "water",
            requires: ["ground"],
            owns: ["water"],
            mount: () => { calls.push("mount-water"); },
            unmount: () => { calls.push("unmount-water"); },
            dispose: () => { calls.push("dispose-water"); }
        });
        graph.register({
            id: "ground",
            requires: ["compiled-surface"],
            owns: ["ground"],
            mount: () => { calls.push("mount-ground"); },
            unmount: () => { calls.push("unmount-ground"); },
            dispose: () => { calls.push("dispose-ground"); }
        });
        await graph.initialize();
        expect(graph.order).toEqual(["ground", "water"]);
        await graph.mount(context);
        graph.unmount(context);
        graph.dispose();
        expect(calls).toEqual([
            "mount-ground", "mount-water",
            "unmount-water", "unmount-ground",
            "dispose-water", "dispose-ground"
        ]);
    });

    test("rejects missing, duplicate and cyclic dependency ownership", () => {
        const missing = new DependencyDrivenRenderGraph<WorldRenderLayerChunkAccess>([]);
        missing.register({ id: "x", requires: ["ground"], mount: vi.fn(), unmount: vi.fn(), dispose: vi.fn() });
        expect(() => missing.order).toThrow(/missing dependency/);

        const duplicate = new DependencyDrivenRenderGraph<WorldRenderLayerChunkAccess>([]);
        duplicate.register({ id: "a", requires: [], owns: ["ground"], mount: vi.fn(), unmount: vi.fn(), dispose: vi.fn() });
        duplicate.register({ id: "b", requires: [], owns: ["ground"], mount: vi.fn(), unmount: vi.fn(), dispose: vi.fn() });
        expect(() => duplicate.order).toThrow(/duplicate owners/);

        const cyclic = new DependencyDrivenRenderGraph<WorldRenderLayerChunkAccess>([]);
        cyclic.register({ id: "a", requires: ["water"], owns: ["ground"], mount: vi.fn(), unmount: vi.fn(), dispose: vi.fn() });
        cyclic.register({ id: "b", requires: ["ground"], owns: ["water"], mount: vi.fn(), unmount: vi.fn(), dispose: vi.fn() });
        expect(() => cyclic.order).toThrow(WorldRenderDependencyError);
    });

    test("rolls back a partial mount through the same reverse dependency order", async () => {
        const calls: string[] = [];
        const graph = new DependencyDrivenRenderGraph<WorldRenderLayerChunkAccess>(["compiled-surface"]);
        graph.register({
            id: "ground",
            requires: ["compiled-surface"],
            owns: ["ground"],
            mount: () => { calls.push("mount-ground"); },
            unmount: () => { calls.push("unmount-ground"); },
            dispose: vi.fn()
        });
        graph.register({
            id: "water",
            requires: ["ground"],
            mount: () => { throw new Error("shader failed"); },
            unmount: vi.fn(),
            dispose: vi.fn()
        });
        await graph.initialize();
        await expect(graph.mount(context)).rejects.toThrow(/shader failed/);
        expect(calls).toEqual(["mount-ground", "unmount-ground"]);
    });
});

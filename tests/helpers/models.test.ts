import { describe, expect, test, vi } from "vitest";
import {
    BufferGeometry,
    DataTexture,
    Float32BufferAttribute,
    Group,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    RGBAFormat
} from "three";

import {
    LoadedModel,
    ModelAssetCache
} from "../../src/helpers/models";
import { ResourceBudgetLedger } from "../../src/runtime/ResourceBudget";
import { deferred } from "../helpers/deferred";

function model(label: string): {
    loaded: LoadedModel;
    geometryDisposed: ReturnType<typeof vi.fn>;
    materialDisposed: ReturnType<typeof vi.fn>;
    textureDisposed: ReturnType<typeof vi.fn>;
} {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0
    ], 3));
    const texture = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, RGBAFormat);
    const material = new MeshBasicMaterial({ map: texture });
    const scene = new Group();
    scene.name = label;
    scene.add(new Mesh(geometry, material));
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const textureDisposed = vi.fn();
    geometry.addEventListener("dispose", geometryDisposed);
    material.addEventListener("dispose", materialDisposed);
    texture.addEventListener("dispose", textureDisposed);
    return {
        loaded: {
            scene,
            animations: [],
            info: {
                offset: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: 1
            },
            fixup: new Matrix4()
        },
        geometryDisposed,
        materialDisposed,
        textureDisposed
    };
}

describe("ModelAssetCache", () => {
    test("coalesces loads and evicts only after the final lease is released", async () => {
        const asset = model("shared");
        const load = vi.fn(async () => asset.loaded);
        const cache = new ModelAssetCache({ maximumBytes: 0, load });

        const [first, second] = await Promise.all([cache.acquire("shared"), cache.acquire("shared")]);
        expect(load).toHaveBeenCalledTimes(1);
        expect(cache.stats).toMatchObject({ entries: 1, activeReferences: 2, cacheHits: 1, cacheMisses: 1 });

        first.release();
        expect(cache.stats.entries).toBe(1);
        expect(asset.geometryDisposed).not.toHaveBeenCalled();
        second.release();

        expect(cache.stats).toMatchObject({ entries: 0, activeReferences: 0, retainedBytes: 0, evictions: 1 });
        expect(asset.geometryDisposed).toHaveBeenCalledOnce();
        expect(asset.materialDisposed).toHaveBeenCalledOnce();
        expect(asset.textureDisposed).toHaveBeenCalledOnce();
    });

    test("charges active assets to the shared budget and releases the reservation on clear", async () => {
        const asset = model("budgeted");
        const ledger = new ResourceBudgetLedger({ cpuBytes: 0, gpuBytes: 0 });
        const cache = new ModelAssetCache({
            maximumBytes: 1024 * 1024,
            resources: ledger.createAccount("models"),
            load: async () => asset.loaded
        });

        const lease = await cache.acquire("budgeted");
        expect(cache.stats.modelBytes).toBeGreaterThan(0);
        expect(ledger.stats).toMatchObject({ reservations: 1, pinnedReservations: 1 });
        expect(ledger.stats.cpuExceededBytes).toBeGreaterThan(0);
        expect(ledger.stats.gpuExceededBytes).toBeGreaterThan(0);

        lease.release();
        expect(ledger.stats.pinnedReservations).toBe(0);
        cache.clear();
        expect(ledger.stats).toMatchObject({ reservations: 0, cpuBytes: 0, gpuBytes: 0 });
    });

    test("disposes a model that finishes loading after cache teardown", async () => {
        const asset = model("late");
        const loading = deferred<LoadedModel>();
        const cache = new ModelAssetCache({ load: () => loading.promise });
        const acquisition = cache.acquire("late");

        cache.dispose();
        loading.resolve(asset.loaded);

        await expect(acquisition).rejects.toThrow("disposed");
        expect(asset.geometryDisposed).toHaveBeenCalledOnce();
        expect(cache.stats).toMatchObject({ disposed: true, entries: 0, retainedBytes: 0 });
    });
});

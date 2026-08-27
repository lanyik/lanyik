import { describe, expect, test } from "vitest";
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Texture } from "three";

import {
    estimateBufferGeometriesBytes,
    estimateBufferGeometriesResourceBytes,
    estimateObject3DResourceCost,
    ResourceBudgetLedger
} from "../../src/runtime/ResourceBudget";

describe("ResourceBudgetLedger", () => {
    test("admits by actual bytes and never mutates accounting on rejection", () => {
        const budget = new ResourceBudgetLedger({ cpuBytes: 100, gpuBytes: 80 });
        expect(budget.reserve("terrain", { cpuBytes: 60, gpuBytes: 40 })).toBe(true);
        expect(budget.reserve("models", { cpuBytes: 50, gpuBytes: 20, modelBytes: 20 })).toBe(false);
        expect(budget.stats).toMatchObject({
            cpuBytes: 60,
            gpuBytes: 40,
            reservations: 1,
            rejectedReservations: 1
        });
        budget.forceReserve("visible", { cpuBytes: 50, gpuBytes: 50 }, true);
        expect(budget.stats).toMatchObject({
            cpuExceededBytes: 10,
            gpuExceededBytes: 10,
            pinnedReservations: 1
        });
        budget.release("terrain");
        expect(budget.stats.cpuExceededBytes).toBe(0);
        budget.clear();
        expect(budget.stats).toMatchObject({
            cpuBytes: 0,
            gpuBytes: 0,
            reservations: 0,
            pinnedReservations: 0
        });
    });

    test("counts shared geometry buffers once", () => {
        const shared = new Float32Array(30);
        const first = new BufferGeometry();
        first.setAttribute("position", new BufferAttribute(shared, 3));
        first.setAttribute("normal", new BufferAttribute(shared, 3));
        const second = new BufferGeometry();
        second.setAttribute("position", new BufferAttribute(shared, 3));
        second.setIndex(new BufferAttribute(new Uint16Array(6), 1));
        expect(estimateBufferGeometriesBytes([first, second])).toBe(shared.byteLength + 12);
        expect(estimateBufferGeometriesResourceBytes([first, second])).toEqual({
            cpuBytes: shared.byteLength + 12,
            gpuBytes: shared.byteLength * 3 + 12
        });
    });

    test("accounts cube faces and generated mip levels conservatively", () => {
        const texture = new Texture();
        texture.image = Array.from({ length: 6 }, () => ({ width: 4, height: 4 }));
        texture.generateMipmaps = true;
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
        const mesh = new Mesh(geometry, new ShaderMaterial({
            uniforms: { diffuseMap: { value: texture } }
        }));

        const cost = estimateObject3DResourceCost([mesh]);
        expect(cost).toMatchObject({
            geometryBytes: 36,
            textureBytes: 512,
            cpuBytes: 420,
            gpuBytes: 548,
            modelBytes: 420
        });
    });

    test("isolates owner keys and releases every reservation with its account", () => {
        const budget = new ResourceBudgetLedger({ cpuBytes: 200, gpuBytes: 200 });
        const units = budget.createAccount("units");
        const effects = budget.createAccount("effects");
        const unit = units.acquire("shared-key", { cpuBytes: 60, gpuBytes: 40, modelBytes: 60 });
        const effect = effects.acquire("shared-key", { cpuBytes: 30, gpuBytes: 20, textureBytes: 20 });

        expect(unit).toBeDefined();
        expect(effect).toBeDefined();
        expect(budget.stats).toMatchObject({ accounts: 2, reservations: 2, cpuBytes: 90, gpuBytes: 60 });
        expect(units.stats).toMatchObject({ label: "units", reservations: 1, cpuBytes: 60 });
        expect(unit!.update({ cpuBytes: 190, gpuBytes: 40 })).toBe(false);
        expect(unit!.reservation).toMatchObject({ cpuBytes: 60, gpuBytes: 40 });

        units.dispose();
        expect(unit!.released).toBe(true);
        expect(budget.stats).toMatchObject({ accounts: 1, reservations: 1, cpuBytes: 30, gpuBytes: 20 });
        budget.dispose();
        expect(effect!.released).toBe(true);
        expect(effects.disposed).toBe(true);
        expect(budget.stats).toMatchObject({ disposed: true, accounts: 0, reservations: 0, cpuBytes: 0, gpuBytes: 0 });
        expect(() => effects.acquire("late", { cpuBytes: 1 })).toThrow("disposed");
    });
});

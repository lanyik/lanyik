import { expect, test, vi } from "vitest";
import { ResourceBudgetLedger } from "three-hex-map";
import { CombatLayer, uploadCombatInstances } from "../src/presentation/CombatLayer";
import { BoxGeometry, Color, DataTexture, FloatType, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, RedFormat } from "three";

test("actors interpolate within a hex and across negative-coordinate edges, refreshing cached slopes on residency edits", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 64 * 1024 * 1024, gpuBytes: 64 * 1024 * 1024 });
    const layer = new CombatLayer(ledger.createAccount("surface-test"));
    let base = 20;
    const sample = vi.fn((x: number, z: number) => base + x * .2 + z * .3);
    const fixture = layer as unknown as { host: unknown; height(x: number, z: number): number };
    fixture.host = { tileSize: 34, surface: { getWorldHeight: sample }, removeObject() {} };
    try {
        for (const x of [-2, -1.5, -.76, -.75, -.74, -.1, 0, .1, .74, .75, .76, 1.5, 2]) {
            const expected = (base / 34 + x * .2 + .3) * 1.015 + .025;
            expect(fixture.height(x, 1)).toBeCloseTo(expected, 10);
        }
        const calls = sample.mock.calls.length;
        fixture.height(.1, 1); expect(sample).toHaveBeenCalledTimes(calls);
        base = 40; layer.surfaceChanged();
        expect(fixture.height(.1, 1)).toBeCloseTo((base / 34 + .02 + .3) * 1.015 + .025, 10);
        const afterEdit = sample.mock.calls.length;
        layer.mountChunk(); fixture.height(.1, 1); expect(sample.mock.calls.length).toBeGreaterThan(afterEdit);
    } finally { layer.dispose(); }
    expect(ledger.stats.gpuBytes).toBe(0);
});

test("instance uploads cover the visible prefix and skip empty pools", () => {
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geometry, material, 640);
    mesh.setColorAt(0, new Color());
    const home = new InstancedBufferAttribute(new Float32Array(640 * 2), 2); geometry.setAttribute("actorHome", home);
    mesh.morphTexture = new DataTexture(new Float32Array(640 * 17), 17, 640, RedFormat, FloatType);
    mesh.count = 3; uploadCombatInstances(mesh);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 48 }]);
    expect(mesh.instanceColor!.updateRanges).toEqual([{ start: 0, count: 9 }]);
    expect(home.updateRanges).toEqual([{ start: 0, count: 6 }]);
    expect(mesh.morphTexture.updateRanges).toEqual([{ start: 0, count: 51 }]);
    const version = mesh.instanceMatrix.version;
    mesh.count = 0; uploadCombatInstances(mesh);
    expect(mesh.instanceMatrix.version).toBe(version); expect(mesh.instanceMatrix.updateRanges).toEqual([]);
    mesh.dispose(); geometry.dispose(); material.dispose();
});

import { expect, test, vi } from "vitest";
import { ResourceBudgetLedger } from "three-hex-map";
import { CombatLayer } from "../src/presentation/CombatLayer";

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

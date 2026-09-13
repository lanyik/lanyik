import { expect, test } from "vitest";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";
import { Land } from "../../src/enums";

test.each(["rift-ember-1", "rift-pass-2", "rift-forest-3"])("%s preserves high ranges while suppressing tile-scale corrugation", seed => {
    const resolver = createWorldSurfaceResolver({ seed }), curvature: number[] = [];
    let peak = 0, steep = 0;
    for (let x = -128; x < 128; x += 2) for (let y = -128; y < 128; y += 2) {
        const a = resolver.sampleGenerated(x, y), b = resolver.sampleGenerated(x + 1, y), c = resolver.sampleGenerated(x - 1, y), d = resolver.sampleGenerated(x, y + 1);
        if ([a, b, c, d].some(sample => sample.baseTerrain === Land.sea || sample.baseTerrain === Land.coastal)) continue;
        curvature.push(Math.abs(b.relief + c.relief - 2 * a.relief) * 480);
        const slope = Math.hypot((b.relief - c.relief) * 480 / 102, (d.relief - a.relief) * 480 / 59);
        steep += Number(slope > Math.tan(40 * Math.PI / 180)); peak = Math.max(peak, a.relief * 480);
    }
    curvature.sort((a, b) => a - b);
    expect(curvature.length).toBeGreaterThan(10_000);
    expect(curvature[Math.floor(curvature.length * .95)]).toBeLessThan(3.5);
    expect(peak).toBeGreaterThan(500); expect(peak).toBeLessThan(600);
    expect(steep).toBeGreaterThan(0); expect(steep / curvature.length).toBeLessThan(.012);
});

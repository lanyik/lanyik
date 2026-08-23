import { describe, expect, test } from "vitest";

import { createHexagonGeometry, createHexagonLodGeometry } from "../../src/objects/hexagonGeometry";

function outerEdgeSamples(geometry: ReturnType<typeof createHexagonGeometry>, radius: number): string[] {
    const position = geometry.getAttribute("position");
    const samples = new Set<string>();
    const apothem = radius * Math.sqrt(3) / 2;
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const edge = Math.max(...Array.from({ length: 6 }, (_, direction) => {
            const angle = (direction * 60 + 30) * Math.PI / 180;
            return (x * Math.cos(angle) + z * Math.sin(angle)) / apothem;
        }));
        if (Math.abs(edge - 1) < 1e-5) samples.add(`${x.toFixed(5)},${z.toFixed(5)}`);
    }
    return [...samples].sort();
}

describe("hexagon LOD geometry", () => {
    test("keeps the full-detail displaced rim while reducing interior triangles", () => {
        const high = createHexagonGeometry(40, 3);
        const middle = createHexagonLodGeometry(40, 2, 3);
        const far = createHexagonLodGeometry(40, 1, 3);

        expect(outerEdgeSamples(middle, 40)).toEqual(outerEdgeSamples(high, 40));
        expect(outerEdgeSamples(far, 40)).toEqual(outerEdgeSamples(high, 40));
        expect(middle.getAttribute("position").count).toBeLessThan(high.getAttribute("position").count);
        expect(far.getAttribute("position").count).toBeLessThan(middle.getAttribute("position").count);
    });
});

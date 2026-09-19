import { expect, test } from "vitest";
import { getHexCenter } from "three-hex-map";
import { overviewPoint, overviewHeading } from "../src/adapters/HexRegionMap";
import { RegionalWorld } from "../src/core/RegionalWorld";

test("north-up heading keeps all cardinal directions and compensates map aspect ratio", () => {
    expect(overviewHeading(0, 1, 1)).toBeCloseTo(Math.PI);
    expect(overviewHeading(Math.PI / 2, 1, 1)).toBeCloseTo(Math.PI / 2);
    expect(overviewHeading(Math.PI, 1, 1)).toBeCloseTo(0);
    expect(overviewHeading(-Math.PI / 2, 1, 1)).toBeCloseTo(-Math.PI / 2);
    expect(overviewHeading(Math.PI / 4, 1.5, Math.sqrt(3))).toBeCloseTo(Math.PI * .75);
});

test("terrain overview markers align with positive and negative even-column tile centres", () => {
    for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) {
        const center = getHexCenter(x, y, 1), point = overviewPoint(center.x, center.y);
        expect(point.x).toBeCloseTo(x + .5, 10);
        expect(point.y).toBeCloseTo(y + .5, 10);
    }
});

test("moving across a terrain column keeps the marker continuous", () => {
    for (let column = -4; column <= 4; column++) {
        const before = overviewPoint(column * 1.5 - 1e-7, 7), after = overviewPoint(column * 1.5 + 1e-7, 7);
        expect(before.x).toBeCloseTo(after.x, 6);
        expect(before.y).toBeCloseTo(after.y, 6);
    }
});

test("remote map metadata matches encounter regions without loading chunks", () => {
    const world = new RegionalWorld("map-bounds", { x: 9, z: -12 });
    const regions = world.regionsInBounds(333, -40, 405, 40);
    expect(regions.map(region => [region.x, region.z])).toEqual([[9, -5], [9, -4], [10, -5], [10, -4], [11, -6], [11, -5]]);
    for (const region of regions) expect(region).toEqual(world.regionAt(region.centerX, region.centerZ));
    expect(world.chunks.size).toBe(0);
});

import { describe, expect, test } from "vitest";

import { getHexCenter } from "../../src/helpers/helpers";
import { getNeighbors } from "../../src/helpers/neighbors";
import {
    createRiverReach,
    forEachHexRiverReach,
    rasterizeHexLine,
    trimRiverReachStart,
    worldAxialToOffset,
    worldOffsetToAxial
} from "../../src/world/hexRaster";

const key = (point: { x: number; y: number }): string => `${point.x},${point.y}`;

function distanceToSegmentSquared(
    point: { x: number; y: number },
    from: { x: number; y: number },
    to: { x: number; y: number }
): number {
    const segmentX = to.x - from.x;
    const segmentY = to.y - from.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const amount = Math.max(0, Math.min(1,
        ((point.x - from.x) * segmentX + (point.y - from.y) * segmentY) / lengthSquared
    ));
    const deltaX = point.x - from.x - segmentX * amount;
    const deltaY = point.y - from.y - segmentY * amount;
    return deltaX * deltaX + deltaY * deltaY;
}

describe("render-grid hex rasterization", () => {
    test("does not collapse coincident curve endpoints when the control is distinct", () => {
        const reach = createRiverReach({ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 0 }, false);
        expect(reach.samples.length).toBeGreaterThan(2);
        expect(reach.length).toBeGreaterThan(0);
    });

    test("rounds the coarse corner instead of interpolating its hard vertex", () => {
        const from = { x: 0, y: 0 };
        const corner = { x: 8, y: 0 };
        const next = { x: 8, y: 8 };
        const reach = createRiverReach(from, corner, next, false);
        expect(reach.samples.length).toBeGreaterThan(2);
        expect(reach.samples.length).toBeLessThanOrEqual(33);
        const curved = new Set<string>();
        forEachHexRiverReach(reach, 1, 1, point => curved.add(key(point)));
        const angular = new Set<string>();
        forEachHexRiverReach(createRiverReach({ x: 4, y: 0 }, corner), 1, 1, point => angular.add(key(point)));
        forEachHexRiverReach(createRiverReach(corner, { x: 8, y: 4 }), 1, 1, point => angular.add(key(point)));
        expect(angular.has(key(corner))).toBe(true);
        expect(curved.has(key(corner))).toBe(false);
        expect(curved.has(key({ x: 4, y: 0 }))).toBe(true);
        expect(curved.has(key({ x: 8, y: 4 }))).toBe(true);
        expect(curved).not.toEqual(angular);
    });

    test("joins both tributaries to the same continuous downstream endpoint and tangent", () => {
        const confluence = { x: 8, y: 0 };
        const next = { x: 8, y: 8 };
        const outgoing = createRiverReach(confluence, next, { x: 16, y: 12 }, false);
        for (const from of [{ x: 0, y: 0 }, { x: 16, y: 0 }]) {
            const incoming = createRiverReach(from, confluence, next, false);
            const end = incoming.samples[incoming.samples.length - 1];
            const previous = incoming.samples[incoming.samples.length - 2];
            const start = outgoing.samples[0];
            const second = outgoing.samples[1];
            expect({ x: end.x, y: end.y }).toEqual({ x: start.x, y: start.y });
            const dx1 = end.x - previous.x, dy1 = end.y - previous.y;
            const dx2 = second.x - start.x, dy2 = second.y - start.y;
            expect((dx1 * dx2 + dy1 * dy2) / (Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2)))
                .toBeGreaterThan(0.95);
        }
    });

    test("round-trips the renderer's even-column offset coordinates", () => {
        for (let x = -9; x <= 9; x += 1) {
            for (let y = -7; y <= 7; y += 1) {
                expect(worldAxialToOffset(worldOffsetToAxial({ x, y }))).toEqual({ x, y });
            }
        }
    });

    test("emits only visibly adjacent cells along a line", () => {
        for (const [from, to] of [
            [{ x: 0, y: 0 }, { x: 11, y: -4 }],
            [{ x: -7, y: 5 }, { x: 8, y: 9 }],
            [{ x: 6, y: -8 }, { x: -9, y: 3 }]
        ] as const) {
            const line = rasterizeHexLine(from, to);
            expect(line[0]).toEqual(from);
            expect(line[line.length - 1]).toEqual(to);
            for (let index = 1; index < line.length; index += 1) {
                expect(new Set(getNeighbors(line[index - 1].x, line[index - 1].y).map(key)))
                    .toContain(key(line[index]));
            }
        }
    });

    test("classifies whole water cells by distance to the ideal rendered capsule", () => {
        const from = { x: -2, y: 1 };
        const to = { x: 9, y: 5 };
        const radius = 3;
        const cells = new Map<string, { x: number; y: number }>();
        forEachHexRiverReach(createRiverReach(from, to), radius, radius, point => cells.set(key(point), point));

        const fromWorld = getHexCenter(from.x, from.y, 1);
        const toWorld = getHexCenter(to.x, to.y, 1);
        const centerline = rasterizeHexLine(from, to);
        expect(cells.size).toBeGreaterThan(centerline.length);
        for (const point of centerline) expect(cells.has(key(point))).toBe(true);
        for (let x = Math.min(from.x, to.x) - radius - 1;
            x <= Math.max(from.x, to.x) + radius + 1;
            x += 1) {
            for (let y = Math.min(from.y, to.y) - radius - 1;
                y <= Math.max(from.y, to.y) + radius + 1;
                y += 1) {
                const inside = distanceToSegmentSquared(getHexCenter(x, y, 1), fromWorld, toWorld)
                    <= radius * radius * 3 + 1e-8;
                expect(cells.has(key({ x, y })), `categorical ownership at ${x},${y}`).toBe(inside);
            }
        }
    });

    test("widens gradually and is invariant under reversing the reach", () => {
        const from = { x: 0, y: -12 };
        const to = { x: 0, y: 12 };
        const cells = new Set<string>();
        const reversed = new Set<string>();
        forEachHexRiverReach(createRiverReach(from, to), 1.25, 3.25, point => {
            expect(Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)).toBe(true);
            expect(cells.has(key(point))).toBe(false);
            cells.add(key(point));
        });
        forEachHexRiverReach(createRiverReach(to, from), 3.25, 1.25, point => reversed.add(key(point)));
        expect(reversed).toEqual(cells);
        const width = (y: number) => [...cells].filter(value => Number(value.split(",")[1]) === y).length;
        expect(width(-8)).toBeLessThan(width(0));
        expect(width(0)).toBeLessThan(width(8));
        for (const point of rasterizeHexLine(from, to)) expect(cells.has(key(point))).toBe(true);
    });

    test.each([{ x: 0, y: 0 }, { x: 1, y: 0 }])(
        "handles zero-length and fully nested endpoint disks: %j", to => {
            const cells = new Set<string>();
            forEachHexRiverReach(createRiverReach({ x: 0, y: 0 }, to), 1.25, 3.25, point => cells.add(key(point)));
            const centre = getHexCenter(to.x, to.y, 1);
            for (let x = -6; x <= 7; x += 1) {
                for (let y = -6; y <= 6; y += 1) {
                    const world = getHexCenter(x, y, 1);
                    const inside = (world.x - centre.x) ** 2 + (world.y - centre.y) ** 2 <= 3.25 ** 2 * 3 + 1e-9;
                    expect(cells.has(key({ x, y }))).toBe(inside);
                }
            }
        }
    );

    test("trims by actual arc length without changing the downstream curve or tapered width", () => {
        const reach = createRiverReach({ x: -8, y: -3 }, { x: 0, y: 2 }, { x: 4, y: 12 });
        const original = new Set<string>();
        forEachHexRiverReach(reach, 1.75, 3.25, point => original.add(key(point)));
        for (const ratio of [0.1, 0.25, 0.5, 0.9]) {
            const trimmed = trimRiverReachStart(reach, reach.length * ratio);
            expect(trimmed.length).toBeCloseTo(reach.length * (1 - ratio), 12);
            expect(trimmed.samples[0].distance).toBe(0);
            expect(trimmed.samples[trimmed.samples.length - 1].x).toBe(reach.samples[reach.samples.length - 1].x);
            expect(trimmed.samples[trimmed.samples.length - 1].y).toBe(reach.samples[reach.samples.length - 1].y);
            const cells = new Set<string>();
            forEachHexRiverReach(trimmed, 1.75 + 1.5 * ratio, 3.25, point => cells.add(key(point)));
            for (const cell of cells) expect(original.has(cell)).toBe(true);
            expect(cells.size).toBeLessThan(original.size);
        }
        expect(trimRiverReachStart(reach, 0)).toBe(reach);
        for (const distance of [-1, NaN, Infinity, reach.length + 1]) {
            expect(() => trimRiverReachStart(reach, distance)).toThrow(/trim distance/);
        }
    });

    test("keeps sub-cell widths connected and rejects invalid radii", () => {
        const from = { x: -4, y: -3 };
        const to = { x: 13, y: 7 };
        const cells = new Set<string>();
        forEachHexRiverReach(createRiverReach(from, to), 0, 0.25, point => cells.add(key(point)));
        for (const point of rasterizeHexLine(from, to)) expect(cells.has(key(point))).toBe(true);
        for (const invalid of [-1, NaN, Infinity]) {
            expect(() => forEachHexRiverReach(createRiverReach(from, to), invalid, 1, () => undefined)).toThrow(/radii/);
            expect(() => forEachHexRiverReach(createRiverReach(from, to), 1, invalid, () => undefined)).toThrow(/radii/);
        }
    });
});

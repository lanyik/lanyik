import { describe, expect, test } from "vitest";

import { getHexCenter } from "../../src/helpers/helpers";
import { getNeighbors } from "../../src/helpers/neighbors";
import {
    forEachHexCapsule,
    rasterizeHexLine,
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
        forEachHexCapsule(from, to, radius, point => cells.set(key(point), point));

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
});

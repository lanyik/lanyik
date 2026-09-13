import { expect, test } from "vitest";
import { crossesCapsule } from "../src/core/EnemyStrikes";

test.each([
    [-10, 0, 10, 0, true], // Fast motion crosses the middle without either endpoint inside.
    [0, 0, 0, 0, true],
    [-1, 2.2, 1, 2.2, true], // Rounded end cap.
    [-1, 2.5, 1, 2.5, false],
    [.31, -10, .31, 10, false]
] as const)("capsule handles a player sweep from %s,%s to %s,%s", (sx, sz, ex, ez, hit) => {
    expect(crossesCapsule(sx, sz, ex, ez, 0, -2, 0, 2, .3)).toBe(hit);
});

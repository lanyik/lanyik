import { expect, test } from "vitest";
import { Land, createWorldSurfaceResolver } from "three-hex-map";
import { COMBAT_WATER_STYLE, findCombatStart } from "../src/adapters/HexCombatView";

test("combat start search is deterministic and produces finite logical coordinates", () => {
    const first = findCombatStart("rift-ember-1");
    const second = findCombatStart("rift-ember-1");
    expect(first).toEqual(second);
    expect(Number.isFinite(first.point.x)).toBe(true);
    expect(Number.isFinite(first.point.z)).toBe(true);

    const resolver = createWorldSurfaceResolver({ seed: "rift-ember-1", waterStyle: COMBAT_WATER_STYLE });
    const window = resolver.createWindow();
    try {
        for (let dx = -2; dx <= 2; dx += 1) {
            for (let dy = -2; dy <= 2; dy += 1) {
                const tile = window.resolveGeneratedTile(first.tile.x + dx, first.tile.y + dy);
                expect([Land.sea, Land.coastal, Land.mountain]).not.toContain(tile.type);
                expect(tile.modifiers ?? []).not.toContain("lake");
                expect(tile.modifiers ?? []).not.toContain("river");
            }
        }
    } finally {
        window.clear();
    }
});

import { expect, test } from "vitest";
import { EXPLORATION, Exploration, validateExploration } from "../src/core/Exploration";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";

test("discovery crosses negative page boundaries, shares idle snapshots and restores permanent cells", () => {
    const discovery = new Exploration();
    discovery.discover(-1, -1);
    const first = discovery.snapshot;
    expect(discovery.has(-1, -1)).toBe(true);
    expect(discovery.has(0, 0)).toBe(true);
    expect(discovery.has(-65, -65)).toBe(false);
    discovery.discover(-2, -2); expect(discovery.snapshot).toBe(first);
    discovery.discover(-65, -65);
    const restored = new Exploration(structuredClone(discovery.snapshot));
    expect(restored.has(-65, -65)).toBe(true);
    expect(new Exploration(first).has(-65, -65)).toBe(false);
    expect(Object.isFrozen(first.pages[0].rows)).toBe(true);
});

test("automatic visibility is strictly below player level and does not materialize unexplored regions", () => {
    const discovery = new Exploration(), world = new RegionalWorld("fog-level", { x: 0, z: 0 });
    const region = world.regionAt(360, 0);
    expect(discovery.allows(360, 0, region.level, world)).toBe(false);
    expect(discovery.allows(360, 0, region.level + 1, world)).toBe(true);
    expect(discovery.snapshot.pages).toHaveLength(0);
    discovery.discover(360, 0);
    expect(discovery.allows(360, 0, 1, world)).toBe(true);
});

test("malformed pages and capacity overflow fail without partially changing exploration", () => {
    const rows = Array<number>(16).fill(0);
    expect(() => validateExploration({ revision: 1, pages: [{ x: 0, z: 0, rows }, { x: 0, z: 0, rows }] })).toThrow();
    expect(() => validateExploration({ revision: 1, pages: [{ x: 0, z: 0, rows: [...rows.slice(1), 65536] }] })).toThrow();
    const discovery = new Exploration({ revision: 0, pages: Array.from({ length: EXPLORATION.maxPages }, (_, x) => ({ x, z: 0, rows })) });
    const before = discovery.snapshot;
    expect(() => discovery.discover(-640, -640)).toThrow(/容量/);
    expect(discovery.snapshot).toBe(before);
});

test("authority rejects fog destinations and teleporting to a discovered edge does not reveal a chain", () => {
    const combat = new CombatSimulation("fog-travel"), before = combat.getSnapshot();
    combat.teleport(360, 0);
    expect(combat.getSnapshot()).toBe(before);
    expect(combat.drainNotices()[0].message).toContain("迷雾");
    const exploration = combat.explorationSnapshot;
    combat.teleport(8, 0); expect(combat.getSnapshot().player.x).toBe(8);
    combat.step({ x: 0, z: 0, active: false });
    expect(combat.explorationSnapshot).toBe(exploration);
    combat.teleport(16, 0); expect(combat.getSnapshot().player.x).toBe(8);
    combat.step({ x: 1, z: 0, active: true });
    expect(new Exploration(combat.explorationSnapshot).has(16, 0)).toBe(true);
    combat.dispose();
});

test("the protocol sends discovery at initialization and on change, independent of ordinary snapshots", async () => {
    const transport = new LoopbackCombatTransport();
    const initial = await transport.start("fog-protocol", { x: 0, z: 0 });
    expect(initial.exploration!.pages.length).toBeGreaterThan(0);
    const idle = await transport.advance({ steps: 0, commands: [], input: { x: 0, z: 0, active: false } });
    expect(idle.snapshot).toBeDefined(); expect(idle.exploration).toBeUndefined();
    const jump = await transport.advance({ steps: 0, commands: [{ type: "teleport", x: 8, z: 0 }], input: { x: 0, z: 0, active: false } });
    expect(jump.exploration).toBeUndefined();
    const moved = await transport.advance({ steps: 1, commands: [], input: { x: 1, z: 0, active: true } });
    expect(moved.exploration!.revision).toBeGreaterThan(initial.exploration!.revision);
    expect(moved.snapshot).toBeUndefined();
    transport.dispose();
});

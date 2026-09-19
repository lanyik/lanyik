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

test("discovery area queries respect negative pages, row gaps and half-open cell boundaries", () => {
    const rows = Array<number>(16).fill(0); rows[15] = 1 << 15;
    const discovery = new Exploration({ revision: 1, pages: [{ x: -1, z: -1, rows }] });
    expect(discovery.intersects(-4, -4, 0, 0)).toBe(true);
    expect(discovery.intersects(-5, -5, -3.99, -3.99)).toBe(true);
    expect(discovery.intersects(-8, -8, -4, -4)).toBe(false);
    expect(discovery.intersects(0, 0, 64, 64)).toBe(false);
    expect(discovery.intersects(-64, -64, 0, -4)).toBe(false);
    expect(discovery.intersects(-4, -4, -4, 0)).toBe(false);
    expect(discovery.intersects(-128, -128, 128, 128)).toBe(true);
});

test("level bounds reject distant fog without omitting any eligible region", () => {
    const world = new RegionalWorld("fog-bounds", { x: -13, z: 21 });
    expect(world.mayContainLowerLevel(-100, -100, 100, 100, 1)).toBe(false);
    expect(world.mayContainLowerLevel(1000, 1000, 2000, 2000, 20)).toBe(false);
    for (const level of [2, 6, 7, 10, 20, 31]) for (const region of world.nearbyRegions(world.regionAtHex(0, 0), 8)) {
        if (region.level >= level) continue;
        for (let i = 0; i < 6; i++) {
            const x = region.centerX + Math.cos(i * Math.PI / 3) * 23.99, z = region.centerZ + Math.sin(i * Math.PI / 3) * 23.99;
            expect(world.mayContainLowerLevel(x - .01, z - .01, x + .01, z + .01, level)).toBe(true);
        }
    }
    expect(world.chunks.size).toBe(0);
});

test("every point at the 3D visible horizon is revealed even across quantization and negative boundaries", () => {
    for (const origin of [{ x: -4.01, z: -0.01 }, { x: 3.99, z: 3.99 }]) {
        const discovery = new Exploration(); discovery.discover(origin.x, origin.z);
        for (let degrees = 0; degrees < 360; degrees++) {
            const angle = degrees * Math.PI / 180;
            expect(discovery.has(origin.x + Math.cos(angle) * 50, origin.z + Math.sin(angle) * 50)).toBe(true);
        }
        expect(discovery.has(origin.x + 65, origin.z)).toBe(false);
    }
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

test("authority rejects unknown destinations and reveals the 3D-visible surroundings after arrival", () => {
    const combat = new CombatSimulation("fog-travel"), before = combat.getSnapshot();
    combat.teleport(360, 0);
    expect(combat.getSnapshot()).toBe(before);
    expect(combat.drainNotices()[0].message).toContain("迷雾");
    const exploration = combat.explorationSnapshot;
    combat.teleport(48, 0); expect(combat.getSnapshot().player.x).toBe(48);
    combat.step({ x: 0, z: 0, active: false });
    expect(combat.explorationSnapshot.revision).toBeGreaterThan(exploration.revision);
    expect(new Exploration(exploration).has(80, 0)).toBe(false);
    expect(new Exploration(combat.explorationSnapshot).has(80, 0)).toBe(true);
    combat.teleport(120, 0); expect(combat.getSnapshot().player.x).toBe(48);
    combat.dispose();
});

test("a full exploration ledger rejects arrival before changing the player's position", () => {
    const combat = new CombatSimulation("full-exploration"), before = combat.getSnapshot();
    const discovery = new Exploration({ revision: 0, pages: Array.from({ length: EXPLORATION.maxPages }, (_, x) => ({ x, z: 0, rows: Array<number>(16).fill(65535) })) });
    Object.assign(combat, { exploration: discovery });
    expect(() => combat.teleport(48, 0)).toThrow(/容量/);
    expect(combat.getSnapshot()).toBe(before);
    combat.dispose();
});

test("the protocol sends discovery at initialization and on change, independent of ordinary snapshots", async () => {
    const transport = new LoopbackCombatTransport();
    const initial = await transport.start("fog-protocol", { x: 0, z: 0 });
    expect(initial.exploration!.pages.length).toBeGreaterThan(0);
    const idle = await transport.advance({ steps: 0, commands: [], input: { x: 0, z: 0, active: false } });
    expect(idle.snapshot).toBeDefined(); expect(idle.exploration).toBeUndefined();
    const jump = await transport.advance({ steps: 0, commands: [{ type: "teleport", x: 8, z: 0 }], input: { x: 0, z: 0, active: false } });
    expect(jump.exploration!.revision).toBeGreaterThan(initial.exploration!.revision);
    const moved = await transport.advance({ steps: 1, commands: [], input: { x: 1, z: 0, active: true } });
    expect(moved.exploration).toBeUndefined();
    expect(moved.snapshot).toBeUndefined();
    transport.dispose();
});

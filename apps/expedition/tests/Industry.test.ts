import { describe, expect, it, vi } from "vitest";
import { getNeighbors } from "three-hex-map";
import { Industry, type ConstructionTile, type ConstructionWorld } from "../src/core/construction/Industry";
import { buildingFootprint, tileKey, type Rotation } from "../src/core/spatial/footprint";
import { BUILDINGS, LANDING_CARGO } from "../src/content/buildings";
import { materials } from "../src/content/items";
import { RECIPES, RECIPE_IDS } from "../src/content/recipes";
import type { MineralId, MineralNode } from "../src/content/minerals";

const land: ConstructionTile = { terrain: { type: "land", hill: false, forest: false, lake: false } };
const sea: ConstructionTile = { terrain: { type: "sea", hill: false, forest: false, lake: false } };
const node = (x: number, y: number, initialAmount = 10_000, mineral: MineralId = "iron"): MineralNode =>
    Object.freeze({ x, y, initialAmount, mineral, id: `ore:${x},${y}`, depositId: `deposit:${x},${y}` });
function fixture(nodes = [node(4, 0)]) {
    const tiles = new Map<string, ConstructionTile>(nodes.map(mineral => [tileKey(mineral), { ...land, mineral }]));
    const world: ConstructionWorld = { readTile: vi.fn(position => Math.abs(position.x) < 48 && Math.abs(position.y) < 48
        ? tiles.get(tileKey(position)) ?? land : undefined) };
    const industry = new Industry(world);
    expect(industry.place("command-center", { x: 0, y: 0 }, 0).ok).toBe(true);
    return { industry, world, tiles };
}

describe("hex construction", () => {
    it("rotates connected footprints through all six neighbors at negative and chunk-boundary coordinates", () => {
        for (const anchor of [{ x: -1, y: -24 }, { x: 23, y: 11 }, { x: 0, y: 0 }]) {
            const ends = new Set<string>();
            for (let rotation = 0; rotation < 6; rotation += 1) {
                const miner = buildingFootprint("miner", anchor, rotation as Rotation);
                ends.add(tileKey(miner[1]));
                expect(getNeighbors(anchor.x, anchor.y).map(tileKey)).toContain(tileKey(miner[1]));
                const center = buildingFootprint("command-center", anchor, rotation as Rotation);
                expect(new Set(center.map(tileKey)).size).toBe(4);
                expect(center.every(cell => getNeighbors(cell.x, cell.y).some(neighbor => center.some(other => tileKey(other) === tileKey(neighbor))))).toBe(true);
            }
            expect(ends.size).toBe(6);
        }
    });

    it("lands once, revalidates occupied previews, and debits every construction material atomically", () => {
        const { industry } = fixture();
        expect(industry.getSnapshot().inventory.amounts).toEqual(LANDING_CARGO);
        expect(industry.place("command-center", { x: -8, y: 0 }, 0).ok).toBe(false);
        expect(industry.preview("miner", { x: 4, y: 0 }, 0).valid).toBe(true);
        expect(industry.place("miner", { x: 4, y: 0 }, 0).ok).toBe(true);
        const built = industry.getSnapshot();
        expect(built.inventory.amounts).toEqual(materials({ iron: 100, copper: 50, stone: 110 }));
        expect(industry.place("miner", { x: 4, y: 0 }, 0)).toMatchObject({ ok: false, message: expect.stringContaining("重叠") });
        expect(industry.getSnapshot()).toBe(built);
        expect(industry.demolish(built.buildings[0].id).ok).toBe(false);
        expect(industry.getSnapshot().buildings).toHaveLength(2);
    });

    it("rejects unserved resources across water and invalid resource/work ends", () => {
        const { industry, world, tiles } = fixture();
        const read = world.readTile.bind(world);
        world.readTile = position => position.x === 2 ? sea : read(position);
        expect(industry.preview("miner", { x: 4, y: 0 }, 0).message).toContain("通行路线");
        world.readTile = read;
        const work = buildingFootprint("miner", { x: 4, y: 0 }, 0)[1];
        tiles.set(tileKey(work), sea);
        expect(industry.preview("miner", { x: 4, y: 0 }, 0).message).toContain("作业端");
        expect(industry.preview("miner", { x: 4, y: 0 }, 1).valid).toBe(true);
        expect(industry.preview("miner", { x: 8, y: 8 }, 0).valid).toBe(false);
        expect(industry.preview("warehouse", { x: 80, y: 0 }, 0).message).toContain("已勘察区域");
    });

    it("cannot spend one available material when another construction material is exhausted", () => {
        const nodes = Array.from({ length: 7 }, (_, i) => node(4, i * 3));
        const { industry } = fixture(nodes);
        for (const mineral of nodes.slice(0, 6)) expect(industry.place("miner", mineral, 0).ok).toBe(true);
        const before = industry.getSnapshot();
        expect(industry.place("miner", nodes[6], 0)).toMatchObject({ ok: false, message: expect.stringContaining("材料不足") });
        expect(industry.getSnapshot()).toBe(before);
        expect(before.inventory.amounts).toEqual(materials({ iron: 0, copper: 0, stone: 60 }));
    });
});

describe("direct-to-warehouse extraction", () => {
    it("conserves finite ore across batches and demolition, independent of terrain residency", () => {
        const mineral = node(4, 0, 7);
        const { industry, world } = fixture([mineral]);
        industry.place("miner", mineral, 0);
        const initial = industry.getSnapshot().inventory.amounts.iron;
        world.readTile = () => { throw new Error("Renderer terrain is unloaded"); };
        industry.advance(9);
        expect(industry.getSnapshot().inventory.amounts.iron).toBe(initial);
        industry.advance(1);
        expect(industry.remaining(mineral)).toBe(2);
        industry.advance(100);
        expect(industry.getSnapshot().inventory.amounts.iron).toBe(initial + 7);
        expect(industry.getSnapshot().depleted).toEqual([mineral.id]);
        expect(industry.getSnapshot().buildings[1].status).toBe("depleted");
        expect(industry.getSnapshot().buildings[1].progress).toBe(0);
    });

    it("stops at warehouse capacity, resumes after expansion, and refuses inventory-destroying demolition", () => {
        const { industry } = fixture();
        industry.place("miner", { x: 4, y: 0 }, 0);
        industry.advance(4000);
        const full = industry.getSnapshot();
        expect(full.inventory.total).toBe(full.inventory.capacity);
        expect(full.buildings[1].status).toBe("warehouse-full");
        industry.advance(100);
        expect(industry.getSnapshot().inventory).toBe(full.inventory);
        expect(industry.place("warehouse", { x: -4, y: 0 }, 0).ok).toBe(true);
        const warehouse = industry.getSnapshot().buildings[2];
        expect(industry.getSnapshot().inventory.capacity).toBe(7000);
        industry.advance(500);
        expect(industry.getSnapshot().inventory.total).toBeGreaterThan(2000);
        expect(industry.demolish(warehouse.id).ok).toBe(false);
        expect(industry.getSnapshot().buildings[1].status).toBe("mining");
    });

    it("recomputes blocked work access on layout changes and retains partial cycle progress", () => {
        const mineral = node(10, 5);
        const path = new Set(Array.from({ length: 13 }, (_, x) => tileKey({ x, y: Math.ceil(x / 2) })));
        for (const cell of buildingFootprint("command-center", { x: 0, y: 0 }, 0)) path.add(tileKey(cell));
        const world: ConstructionWorld = { readTile: position => tileKey(position) === tileKey(mineral)
            ? { ...land, mineral } : path.has(tileKey(position)) ? land : sea };
        const industry = new Industry(world);
        expect(industry.place("command-center", { x: 0, y: 0 }, 0).ok).toBe(true);
        expect(industry.place("miner", mineral, 3).ok).toBe(true);
        industry.advance(5);
        expect(industry.place("warehouse", { x: 4, y: 2 }, 0).ok).toBe(true);
        industry.advance(100);
        expect(industry.getSnapshot().buildings[1]).toMatchObject({ status: "disconnected", progress: 5 });
        expect(industry.demolish(industry.getSnapshot().buildings[2].id).ok).toBe(true);
        industry.advance(5);
        expect(industry.remaining(mineral)).toBe(mineral.initialAmount - 5);
    });

    it("returns only paid construction materials, preserves extracted amounts, and keeps tick grouping deterministic", () => {
        const mineral = node(4, 0, 12, "copper");
        const first = fixture([mineral]).industry;
        const second = fixture([mineral]).industry;
        for (const industry of [first, second]) industry.place("miner", mineral, 0);
        first.advance(13);
        for (let i = 0; i < 13; i += 1) second.advance(1);
        expect(first.getSnapshot()).toEqual(second.getSnapshot());
        expect(first.demolish(first.getSnapshot().buildings[1].id).ok).toBe(true);
        expect(first.getSnapshot().inventory.amounts.copper).toBe(LANDING_CARGO.copper + 5);
        expect(first.place("miner", mineral, 0).ok).toBe(true);
        first.advance(100);
        expect(first.getSnapshot().inventory.amounts.copper).toBe(LANDING_CARGO.copper + 12 - BUILDINGS.miner.cost.copper);
        expect(first.remaining(mineral)).toBe(0);
    });
});

describe("powered production", () => {
    it("spends a batch once, retains its recipe through a requested switch, and returns unfinished inputs on demolition", () => {
        const { industry } = fixture();
        expect(industry.place("smelter", { x: -4, y: 0 }, 0).ok).toBe(true);
        const furnace = industry.getSnapshot().buildings[1].id;
        const before = industry.getSnapshot().inventory.amounts;
        industry.advance(15);
        expect(industry.getSnapshot().inventory.amounts.iron).toBe(before.iron - 2);
        expect(industry.configure(furnace, { recipe: "copper-plate" }).ok).toBe(true);
        expect(industry.getSnapshot().buildings[1]).toMatchObject({ recipe: "copper-plate", batch: { recipe: "iron-plate", progress: 15 } });
        industry.advance(15);
        expect(industry.getSnapshot().inventory.amounts["iron-plate"]).toBe(0);
        industry.advance(1);
        expect(industry.getSnapshot().inventory.amounts).toMatchObject({ "iron-plate": 1, copper: before.copper - 2 });
        expect(industry.getSnapshot().buildings[1].batch).toEqual({ recipe: "copper-plate", progress: 1 });
        expect(industry.demolish(furnace).ok).toBe(true);
        expect(industry.getSnapshot().inventory.amounts).toEqual(materials({ iron: LANDING_CARGO.iron - 2,
            copper: LANDING_CARGO.copper, stone: LANDING_CARGO.stone, "iron-plate": 1 }));
    });

    it("uses priority and explicit shutdown to reallocate limited supply without spending inputs or losing partial work", () => {
        const { industry } = fixture();
        industry.place("miner", { x: 4, y: 0 }, 0);
        industry.place("smelter", { x: -4, y: 0 }, 0);
        const miner = industry.getSnapshot().buildings[1].id, furnace = industry.getSnapshot().buildings[2].id;
        const initialIron = industry.getSnapshot().inventory.amounts.iron;
        industry.advance(5);
        expect(industry.getSnapshot().buildings[2]).toMatchObject({ status: "insufficient-power", batch: undefined });
        expect(industry.getSnapshot().inventory.amounts.iron).toBe(initialIron);
        industry.configure(furnace, { priority: 0 });
        industry.advance(5);
        expect(industry.getSnapshot().buildings[1]).toMatchObject({ status: "insufficient-power", progress: 5 });
        expect(industry.getSnapshot().buildings[2].batch?.progress).toBe(5);
        industry.configure(furnace, { enabled: false });
        industry.advance(5);
        expect(industry.getSnapshot().buildings[2]).toMatchObject({ status: "disabled", batch: { progress: 5 } });
        expect(industry.getSnapshot().inventory.amounts.iron).toBe(initialIron - 2 + 5);
        industry.configure(furnace, { enabled: true });
        industry.configure(miner, { enabled: false });
        industry.advance(25);
        expect(industry.getSnapshot().buildings[2].batch?.progress).toBe(30);
        const before = industry.getSnapshot();
        expect(() => industry.configure(furnace, { priority: 9 as never, recipe: "copper-plate" })).toThrow("priority");
        expect(industry.getSnapshot()).toBe(before);
    });

    it("retains exactly one finished batch while storage is full, draws no power, then delivers once after expansion", () => {
        const { industry } = fixture();
        industry.place("miner", { x: 4, y: 0 }, 0);
        industry.place("smelter", { x: -4, y: 0 }, 0);
        industry.place("solar-array", { x: -2, y: 3 }, 0);
        const furnace = industry.getSnapshot().buildings[2].id;
        industry.configure(furnace, { enabled: false });
        industry.advance(4000);
        expect(industry.getSnapshot().inventory.total).toBe(2000);
        industry.configure(furnace, { enabled: true });
        industry.advance(30);
        const full = industry.getSnapshot();
        expect(full.buildings[2]).toMatchObject({ status: "output-full", batch: { progress: 30 } });
        industry.advance(100);
        expect(industry.getSnapshot().power.consumedKW).toBe(0);
        expect(industry.getSnapshot().inventory).toBe(full.inventory);
        expect(industry.demolish(furnace).ok).toBe(false);
        expect(industry.place("warehouse", { x: -7, y: 0 }, 0).ok).toBe(true);
        industry.configure(furnace, { enabled: false });
        industry.advance(1);
        expect(industry.getSnapshot().inventory.amounts["iron-plate"]).toBe(1);
        industry.advance(10);
        expect(industry.getSnapshot().inventory.amounts["iron-plate"]).toBe(1);
    });

    it("builds storage from real refined materials and preserves exact energy under grouped industry ticks", () => {
        const prepare = () => {
            const { industry } = fixture();
            industry.place("smelter", { x: -4, y: 0 }, 0);
            const furnace = industry.getSnapshot().buildings[1].id;
            expect(industry.place("battery", { x: -2, y: 2 }, 0).ok).toBe(false);
            for (const recipe of RECIPE_IDS) {
                industry.configure(furnace, { recipe });
                industry.advance(RECIPES[recipe].ticks * 10);
            }
            industry.configure(furnace, { enabled: false });
            industry.advance(1);
            expect(industry.getSnapshot().inventory.amounts).toMatchObject({ "iron-plate": 10, "copper-plate": 10, "stone-brick": 10 });
            expect(industry.place("battery", { x: -2, y: 2 }, 0).ok).toBe(true);
            expect(industry.getSnapshot().power.storedJ).toBe(0);
            industry.advance(1000);
            expect(industry.getSnapshot().power.storedJ).toBe(6_000_000);
            industry.place("miner", { x: 4, y: 0 }, 0);
            industry.configure(furnace, { enabled: true });
            return industry;
        };
        const first = prepare(), second = prepare();
        first.advance(5);
        for (let tick = 0; tick < 5; tick += 1) second.advance(1);
        expect(first.getSnapshot()).toEqual(second.getSnapshot());
        expect(first.getSnapshot().power).toMatchObject({ consumedKW: 80, dischargeKW: 20, chargeKW: 0, storedJ: 5_990_000 });
        const battery = first.getSnapshot().buildings.find(building => building.kind === "battery")!;
        expect(first.demolish(battery.id).ok).toBe(true);
        expect(first.getSnapshot().power.storedJ).toBe(0);
        expect(first.getSnapshot().inventory.amounts).toMatchObject({ "iron-plate": 10, "copper-plate": 10, "stone-brick": 10 });
    });
});

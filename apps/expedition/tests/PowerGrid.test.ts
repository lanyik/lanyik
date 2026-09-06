import { describe, expect, it } from "vitest";
import { PowerGrid, type PowerParticipant } from "../src/core/power/PowerGrid";
import { BUILDINGS, type BuildingId } from "../src/content/buildings";
import { DAYLIGHT_TICKS, DAY_CYCLE_TICKS } from "../src/content/energy";

const participant = (id: string, kind: BuildingId, x: number, y = Math.ceil(x / 2)): PowerParticipant => ({
    id, position: { x, y }, definition: BUILDINGS[kind].power!, enabled: true
});
const step = (grid: PowerGrid, tick: number, loads: string[] = []) => {
    grid.beginTick(tick);
    const results = loads.map(id => grid.request(id));
    grid.finishTick(true);
    return results;
};

describe("power networks and stored joules", () => {
    it("keeps battery energy with its device through network merge, split and reattachment; loads and batteries cannot bridge", () => {
        const grid = new PowerGrid();
        const parts = [participant("a", "solar-array", 0), participant("b", "solar-array", 12), participant("battery", "battery", 6)];
        grid.rebuild(parts);
        step(grid, 1);
        expect(grid.getSnapshot().networks).toHaveLength(2);
        expect(grid.getSnapshot().devices.battery).toMatchObject({ networkId: "a", storedJ: 6000, chargeKW: 60, dischargeKW: 0 });
        grid.rebuild([...parts, participant("relay", "power-relay", 6)]);
        expect(grid.getSnapshot().networks).toHaveLength(1);
        expect(grid.getSnapshot().storedJ).toBe(6000);
        grid.rebuild(parts);
        expect(grid.getSnapshot().networks).toHaveLength(2);
        expect(grid.getSnapshot().storedJ).toBe(6000);
        grid.rebuild(parts.slice(1));
        expect(grid.getSnapshot().devices.battery).toMatchObject({ networkId: "b", storedJ: 6000 });
        grid.rebuild([parts[2]]);
        step(grid, 2);
        expect(grid.getSnapshot().devices.battery).toMatchObject({ networkId: undefined, storedJ: 6000, chargeKW: 0, dischargeKW: 0 });
        grid.rebuild([]);
        grid.rebuild(parts);
        expect(grid.getSnapshot().storedJ).toBe(0);
    });

    it("charges only surplus, respects capacity/rate and discharges exact consumed joules at night without simultaneous charging", () => {
        const grid = new PowerGrid();
        grid.rebuild([participant("sun", "solar-array", 0), participant("battery", "battery", 1), participant("load", "smelter", 2)]);
        for (let tick = 1; tick <= 1100; tick += 1) expect(step(grid, tick, ["load"])).toEqual([undefined]);
        expect(grid.getSnapshot()).toMatchObject({ storedJ: 6_000_000, generationKW: 120, consumedKW: 60, chargeKW: 0 });
        step(grid, DAYLIGHT_TICKS, ["load"]);
        expect(grid.getSnapshot()).toMatchObject({ daylight: false, generationKW: 0, consumedKW: 60, storedJ: 5_994_000, chargeKW: 0, dischargeKW: 60 });
        grid.setEnabled("battery", false);
        expect(step(grid, DAYLIGHT_TICKS + 1, ["load"])).toEqual(["insufficient-power"]);
        expect(grid.getSnapshot().storedJ).toBe(5_994_000);
        grid.setEnabled("battery", true);
        step(grid, DAY_CYCLE_TICKS, ["load"]);
        expect(grid.getSnapshot()).toMatchObject({ day: 2, daylight: true, storedJ: 6_000_000, chargeKW: 60, dischargeKW: 0 });
        const before = grid.getSnapshot().storedJ;
        grid.beginTick(DAYLIGHT_TICKS); grid.request("load"); grid.finishTick(false);
        expect(grid.getSnapshot().storedJ).toBe(before);
    });

    it("allocates whole loads in the supplied order, cannot steal generation from an isolated network and preserves dark relay links", () => {
        const grid = new PowerGrid();
        const parts = [participant("center", "command-center", 0), participant("sun", "solar-array", 20),
            participant("near", "smelter", 2), participant("far", "smelter", 19), participant("small", "miner", 3), participant("outside", "miner", 40)];
        grid.rebuild(parts);
        expect(step(grid, DAYLIGHT_TICKS, ["near", "small", "far", "outside"])).toEqual([undefined, "insufficient-power", "insufficient-power", "no-grid"]);
        grid.rebuild([...parts, participant("relay", "power-relay", 10)]);
        expect(grid.getSnapshot().networks).toHaveLength(1);
        expect(step(grid, DAYLIGHT_TICKS, ["small", "near", "far"])).toEqual([undefined, "insufficient-power", "insufficient-power"]);
        expect(grid.getSnapshot()).toMatchObject({ consumedKW: 20, generationKW: 60, chargeKW: 0, dischargeKW: 0 });
        expect(grid.connection({ x: -10, y: -5 })?.networkId).toBe("center");
        expect(grid.connection({ x: -11, y: -5 })).toBeUndefined();
        grid.beginTick(1); grid.request("near");
        expect(() => grid.request("near")).toThrow("once per tick");
        expect(() => grid.beginTick(NaN)).toThrow("Invalid power tick");
    });
});

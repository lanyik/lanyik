import { describe, expect, it } from "vitest";
import { getNeighbors } from "three-hex-map";
import { MINERAL_IDS, type MineralNode, type SurveyTerrain } from "../src/content/minerals";
import { LandingSurveyWindow, SURVEY_WINDOW_SIZE, type TerrainWindow } from "../src/scenarios/landingSurvey";

const land: SurveyTerrain = { type: "land", hill: false, forest: false, lake: false };
function fixture() {
    const tiles = Array.from({ length: SURVEY_WINDOW_SIZE ** 2 }, () => ({ ...land }));
    const terrain: TerrainWindow = { originX: -48, originY: -48, size: SURVEY_WINDOW_SIZE, tiles };
    const set = (x: number, y: number, changes: Partial<SurveyTerrain>) => Object.assign(tiles[(y + 48) * SURVEY_WINDOW_SIZE + x + 48], changes);
    for (let x = -12; x <= -9; x += 1) for (let y = 4; y <= 6; y += 1) set(x, y, { forest: true });
    const nodes = new Map<string, MineralNode>();
    for (const [index, mineral] of MINERAL_IDS.entries()) {
        const [x, y] = [[8, -5], [-8, -5], [0, 10]][index];
        nodes.set(`${x},${y}`, Object.freeze({ x, y, mineral, id: `node:${mineral}`, depositId: `deposit:${mineral}`, initialAmount: 15_000 }));
    }
    nodes.set("25,0", Object.freeze({ x: 25, y: 0, mineral: "iron", id: "expansion", depositId: "second-iron", initialAmount: 8000 }));
    const window = () => new LandingSurveyWindow(terrain, { nodeAt: (x, y) => nodes.get(`${x},${y}`) });
    return { tiles, terrain, set, nodes, window };
}

describe("LandingSurveyWindow", () => {
    it("proves clear construction space, reachable reserves and a distinct expansion deposit", () => {
        const { window } = fixture();
        const result = window().evaluate({ x: 0, y: 0 });
        expect(typeof result).toBe("object");
        if (typeof result === "string") throw new Error(result);
        expect(result.buildingTiles).toBeGreaterThanOrEqual(60);
        expect(result.forestTiles).toBe(12);
        expect(result.resources.map(resource => resource.amount)).toEqual([15_000, 15_000, 15_000]);
        expect(result.resources.every(resource => resource.tiles === 1)).toBe(true);
        expect(result.expansion.node.depositId).toBe("second-iron");
        expect(result.expansion.distance).toBeGreaterThan(18);
        expect(Object.isFrozen(result.resources)).toBe(true);
    });

    it("rejects nearby resources behind water instead of treating straight-line proximity as access", () => {
        const { set, window } = fixture();
        for (let y = -48; y < 48; y += 1) set(4, y, { type: "sea" });
        expect(window().evaluate({ x: 0, y: 0 })).toBe("minerals");
    });

    it("allows a mountain resource face with a reachable work tile and never counts it six times", () => {
        const { set, window } = fixture();
        set(8, -5, { type: "mountain" });
        const result = window().evaluate({ x: 0, y: 0 });
        if (typeof result === "string") throw new Error(result);
        expect(result.resources[0]).toMatchObject({ amount: 15_000, tiles: 1 });
    });

    it("does not turn an outer part of the starting vein into a second mining district", () => {
        const { nodes, window } = fixture();
        nodes.set("25,0", { ...nodes.get("25,0")!, depositId: "deposit:iron" });
        expect(window().evaluate({ x: 0, y: 0 })).toBe("expansion");
    });

    it("rejects a blocked command-centre patch and a small isolated clearing", () => {
        const { set, window, tiles } = fixture();
        set(0, 0, { forest: true });
        expect(window().evaluate({ x: 0, y: 0 })).toBe("clearing");
        for (const tile of tiles) Object.assign(tile, { ...land, type: "sea" });
        const patch = new Map([["0,0", { x: 0, y: 0 }]]);
        for (let ring = 0; ring < 2; ring += 1) {
            for (const point of [...patch.values()]) {
                for (const neighbor of getNeighbors(point.x, point.y)) patch.set(`${neighbor.x},${neighbor.y}`, neighbor);
            }
        }
        for (const point of patch.values()) set(point.x, point.y, land);
        expect(window().evaluate({ x: 0, y: 0 })).toBe("building-space");
    });

    it("stops after the fixed candidate set and reports why an all-water window failed", () => {
        const { tiles, window } = fixture();
        for (const tile of tiles) tile.type = "sea";
        const result = window().findLanding();
        expect(result.landing).toBeUndefined();
        expect(result.failures).toEqual({ clearing: 25, "building-space": 0, forest: 0, minerals: 0, expansion: 0 });
    });
});

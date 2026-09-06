import { describe, expect, it } from "vitest";
import { getHexCenter, getNeighbors } from "three-hex-map";
import { Explorer, groundCenter, groundTile, touchesTile, type MovementInput } from "../src/core/exploration/Explorer";
import { tileKey, hexDistance } from "../src/core/spatial/footprint";
import { EXPLORER } from "../src/content/explorer";
import type { TilePosition } from "../src/content/minerals";

const idle: MovementInput = { x: 0, z: 0, active: true, sprint: false };
const ground = (tile: TilePosition) => Math.abs(tile.x) < 12 && Math.abs(tile.y) < 12;
const advance = (explorer: Explorer, from: number, until: number, input = idle) => {
    for (let time = from; time <= until; time += 20) explorer.sample(time, input);
};

describe("Explorer movement and navigation", () => {
    it("matches the public hex layout at positive/negative columns and blocks the full body at hex edges", () => {
        for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) {
            const point = getHexCenter(x, y, 1);
            expect(groundTile({ x: point.x, z: point.y })).toEqual({ x, y });
        }
        const start = groundCenter({ x: 0, y: 0 });
        for (const neighbor of getNeighbors(0, 0)) {
            const center = groundCenter(neighbor);
            const nearEdge = { x: (start.x + center.x) / 2, z: (start.z + center.z) / 2 };
            expect(touchesTile(nearEdge, neighbor)).toBe(true);
            expect(touchesTile(start, neighbor)).toBe(false);
        }
    });
    it("has equal diagonal speed and refresh-rate-independent fixed steps, bounded catch-up and input suspension", () => {
        const distances = [30, 60, 144].map(hz => {
            const explorer = new Explorer({ x: -3, y: -2 }, ground);
            for (let frame = 0; frame <= hz; frame++) explorer.sample(frame * 1000 / hz, { ...idle, x: 1, z: 1 });
            return explorer.getSnapshot().distance;
        });
        for (const distance of distances) expect(distance).toBeCloseTo(EXPLORER.speed, 10);
        const explorer = new Explorer({ x: 0, y: 0 }, ground);
        advance(explorer, 0, 1000, { ...idle, x: 1 });
        expect(explorer.getSnapshot().distance).toBeCloseTo(distances[0]);
        explorer.sample(5000, { ...idle, x: 1, active: false });
        explorer.sample(9000, { ...idle, x: 1 });
        expect(explorer.getSnapshot().distance).toBeCloseTo(EXPLORER.speed);
        explorer.sample(90_000, { ...idle, x: 1 });
        expect(explorer.getSnapshot().distance).toBeLessThanOrEqual(EXPLORER.speed * 1.25 + 1e-9);
        expect(() => explorer.sample(89_000, idle)).toThrow("monotonic");
        expect(() => explorer.sample(NaN, idle)).toThrow();
    });
    it("cannot cross occupied hexes or a water barrier, including sprinting and sliding along corners", () => {
        const blocked = new Set([tileKey({ x: 1, y: 0 })]);
        const walkable = (tile: TilePosition) => ground(tile) && tile.x < 3 && !blocked.has(tileKey(tile));
        const explorer = new Explorer({ x: 0, y: 0 }, walkable);
        advance(explorer, 0, 4000, { ...idle, x: 1, sprint: true });
        expect(explorer.getSnapshot().tile.x).toBeLessThan(3);
        expect(touchesTile(explorer.getSnapshot(), { x: 1, y: 0 })).toBe(false);
        advance(explorer, 4020, 6000, { ...idle, x: 1, z: 1, sprint: true });
        expect(walkable(explorer.getSnapshot().tile)).toBe(true);
        for (const neighbor of getNeighbors(explorer.getSnapshot().tile.x, explorer.getSnapshot().tile.y)) {
            if (!walkable(neighbor)) expect(touchesTile(explorer.getSnapshot(), neighbor)).toBe(false);
        }
    });
    it("routes around obstacles to an adjacent work tile, replans after construction and yields to manual input", () => {
        const blocked = new Set(["1,0", "2,0", "3,0"]);
        const walkable = (tile: TilePosition) => ground(tile) && !blocked.has(tileKey(tile));
        const explorer = new Explorer({ x: 0, y: 0 }, walkable);
        const target = { x: 5, y: 0 };
        expect(explorer.navigate(target)).toBe(true);
        expect(explorer.getSnapshot().distance).toBe(0);
        advance(explorer, 0, 500);
        blocked.add("2,-1"); explorer.layoutChanged();
        advance(explorer, 520, 12_000);
        expect(explorer.getSnapshot().status).toBe("arrived");
        expect(hexDistance(explorer.getSnapshot().tile, target)).toBe(1);
        explorer.navigate({ x: 0, y: 0 });
        explorer.sample(12_020, { ...idle, x: 1 });
        expect(explorer.getSnapshot().target).toBeUndefined();
        explorer.stop();
        expect(explorer.getSnapshot().status).toBe("idle");
        expect(explorer.navigate({ x: 50, y: 50 })).toBe(false);
        expect(explorer.getSnapshot().status).toBe("unreachable");
    });
});

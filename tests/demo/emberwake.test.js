import { describe, expect, it } from "vitest";
import { getNeighbors } from "../../src/helpers/neighbors";
import { PathFinder } from "../../src/helpers/pathfinder";
import { decodeWorldChunkTile, generateWorldChunk } from "../../src/world/generateWorldChunk";
import { CombatWorld } from "../../public/emberwake/world.js";
import { createRun, distance, FortressSimulation, frontX, LIMITS, samePoint, SEED, validateRun } from "../../public/emberwake/rules.js";

const plain = { type: "land", modifiers: [] };
const flatWorld = {
    tile: () => plain,
    path(from, to) {
        const path = []; let point = from;
        while (!samePoint(point, to)) {
            point = getNeighbors(point.x, point.y).reduce((best, next) => distance(next, to) < distance(best, to) ? next : best);
            path.push({ x: point.x, y: point.y });
        }
        return path;
    },
    nearby(center, radius) {
        const points = [];
        for (let x = center.x - radius; x <= center.x + radius; x++) for (let y = center.y - radius; y <= center.y + radius; y++) {
            if (distance(center, { x, y }) <= radius) points.push({ x, y });
        }
        return points;
    }
};
const advance = (game, ticks) => { for (let i = 0; i < ticks; i++) game.step(); };

describe("moving fortress", () => {
    it("only credits cargo after a miner reaches the moving base, and can recall a partial load", () => {
        const game = new FortressSimulation(flatWorld);
        game.command({ type: "mine", point: { x: 3, y: 0 } });
        advance(game, 25);
        expect(game.state.rovers[0].cargo).toBeGreaterThan(0);
        expect(game.state.metal).toBe(38);
        expect(game.state.fuel).toBe(14);
        const cargo = game.state.rovers[0].cargo;
        game.command({ type: "recall" });
        game.command({ type: "move", point: { x: 5, y: 0 } });
        advance(game, 35);
        expect(game.state.rovers).toHaveLength(0);
        expect(game.state.delivered).toBe(cargo);
        expect(game.state.metal).toBe(38 + cargo);
        expect(game.state.base.x).toBe(5);
        expect(validateRun(game.snapshot())).toEqual(game.state);
    });

    it("makes packing suppress fire and only refunds after the three-second recovery finishes", () => {
        const game = new FortressSimulation(flatWorld);
        game.command({ type: "build", kind: "gun", point: { x: -2, y: 0 } });
        expect(game.state.metal).toBe(22);
        game.command({ type: "salvage", point: { x: -2, y: 0 } });
        advance(game, 14);
        expect(game.state.towers).toHaveLength(1);
        expect(game.state.metal).toBe(22);
        game.step();
        expect(game.state.towers).toHaveLength(0);
        expect(game.state.metal).toBe(34);
    });

    it("creates real attackers, supports aimed delayed bombardment, and ends an abandoned defense", () => {
        const game = new FortressSimulation(flatWorld);
        advance(game, 61);
        expect(game.state.enemies.length).toBeGreaterThan(0);
        const target = game.state.enemies[0];
        const hp = target.hp;
        game.command({ type: "barrage", point: { x: target.x, y: target.y } });
        expect(game.state.fuel).toBe(10);
        expect(target.hp).toBe(hp);
        expect(() => game.command({ type: "barrage", point: { x: target.x, y: target.y } })).toThrow("冷却");
        advance(game, 6);
        expect(game.state.kills).toBeGreaterThan(0);
        expect(game.drainEvents().some(event => event.type === "blast")).toBe(true);
        advance(game, 500);
        expect(game.state.status).toBe("lost");
        expect(game.state.base.hp).toBe(0);
        expect(frontX(game.state)).toBeGreaterThan(frontX(createRun()));
        expect(game.state.enemies.length).toBeLessThanOrEqual(LIMITS.enemies);
    });

    it("does not grant cargo from a destroyed rover or duplicate it after save recovery", () => {
        const game = new FortressSimulation(flatWorld);
        game.command({ type: "mine", point: { x: 3, y: 0 } });
        advance(game, 35);
        const restored = new FortressSimulation(flatWorld, game.snapshot());
        restored.state.rovers[0].hp = 0;
        restored.step();
        expect(restored.state.crews).toBe(1);
        expect(restored.state.delivered).toBe(0);
        expect(restored.state.metal).toBe(38);
        expect(restored.state.lostRovers).toBe(1);
        restored.command({ type: "replace-rover" });
        expect(restored.state.metal).toBe(16);
        expect(restored.state.crews).toBe(2);
    });

    it("preserves deterministic combat and movement across a checkpoint", () => {
        const game = new FortressSimulation(flatWorld);
        game.command({ type: "build", kind: "gun", point: { x: -2, y: 0 } });
        game.command({ type: "mine", point: { x: 3, y: 0 } });
        advance(game, 81);
        const restored = new FortressSimulation(flatWorld, game.snapshot());
        advance(game, 70); advance(restored, 70);
        expect(restored.state).toEqual(game.state);
    });

    it("keeps rejected orders atomic and respects actual water passability", () => {
        const game = new FortressSimulation({ ...flatWorld, tile: point => point.x === 2 ? { type: "sea" } : plain });
        const before = game.snapshot();
        for (const action of [
            { type: "move", point: { x: 2, y: 0 } }, { type: "build", kind: "gun", point: { x: 8, y: 0 } },
            { type: "barrage", point: { x: Infinity, y: 0 } }, { type: "upgrade", upgrade: "firepower" },
            { type: "build", kind: "constructor", point: { x: 1, y: 0 } }
        ]) { expect(() => game.command(action)).toThrow(); expect(game.state).toEqual(before); }
        expect(() => validateRun({ ...createRun(), crews: -1 })).toThrow("存档");
        expect(() => validateRun({ ...createRun(), base: { ...createRun().base, path: [{ x: 5, y: 0 }] } })).toThrow("存档");
    });

    it("can evacuate through real terrain with mining and defense, while the same unprotected convoy loses its supply line", async () => {
        const source = { chunkSize: 24, sampleBaseChunk: (chunkX, chunkY) => Promise.resolve(generateWorldChunk({ seed: SEED, chunkSize: 24, chunkX, chunkY })) };
        const outcomes = [];
        for (const defended of [false, true]) {
            const world = new CombatWorld(source, { PathFinder, decodeWorldChunkTile });
            const game = new FortressSimulation(world);
            let campAt = 0, lastCamp = -1, crossedSourceBoundary = false;
            for (let t = 0; t < 1200 && game.state.status === "playing"; t++) {
                const s = game.state;
                await world.load(s.base);
                crossedSourceBoundary ||= s.base.x >= 24;
                expect(world.stats.chunks).toBe(9);
                if (s.pendingUpgrade) game.command({ type: "upgrade", upgrade: s.upgrades.includes("firepower") ? "logistics" : "firepower" });
                if (s.base.hp < 100 && s.metal >= 18) game.command({ type: "repair" });
                if (s.crews < 2 && s.metal >= 22) game.command({ type: "replace-rover" });
                if (!s.base.path.length) {
                    if (lastCamp !== s.base.x) { lastCamp = s.base.x; campAt = t; }
                    const departureFuel = Math.min(20, s.goal - s.base.x + 3);
                    if (s.fuel < departureFuel) {
                        if (defended && !s.towers.length && s.metal >= 16) {
                            const point = world.nearby(s.base, 3).find(p => p.x === s.base.x - 2 && p.y === s.base.y && p.x > frontX(s));
                            if (point) game.command({ type: "build", kind: "gun", point });
                        }
                        for (const mine of world.mines(s, 8)) {
                            if (s.rovers.length >= s.crews) break;
                            if (samePoint(mine, s.base) || mine.x <= frontX(s) + 1 || s.rovers.some(r => samePoint(r.mine, mine)) || !world.path(s.base, mine).length) continue;
                            game.command({ type: "mine", point: mine });
                        }
                    }
                    if (s.fuel >= departureFuel || t - campAt > 135) {
                        if (s.rovers.some(r => r.job !== "returning")) game.command({ type: "recall" });
                        for (const tower of s.towers) if (!tower.packing && distance(tower, s.base) <= 4 && tower.x > frontX(s)) game.command({ type: "salvage", point: tower });
                        if (!s.towers.some(tower => tower.packing) && s.fuel > 0) {
                            const point = [0, 1, -1, 2, -2, 3, -3].map(y => ({ x: Math.min(s.base.x + 8, s.goal), y: s.base.y + y })).find(p => world.path(s.base, p).length);
                            if (point) game.command({ type: "move", point });
                        }
                    }
                }
                game.step();
                if (t % 25 === 0) expect(validateRun(game.snapshot())).toEqual(game.state);
            }
            expect(crossedSourceBoundary).toBe(true);
            outcomes.push(game.snapshot()); world.dispose();
        }
        expect(outcomes[0].status).toBe("lost");
        expect(outcomes[0].lostRovers).toBeGreaterThan(0);
        expect(outcomes[1].status).toBe("won");
        expect(outcomes[1].delivered).toBeGreaterThanOrEqual(80);
        expect(outcomes[1].kills).toBeGreaterThan(10);
        expect(outcomes[1].lostRovers).toBe(0);
    });

    it("keeps negative chunk parity and leaves a failed terrain-window migration unpublished", async () => {
        let fail = false, samples = 0;
        const source = { chunkSize: 24, async sampleBaseChunk(chunkX, chunkY) {
            samples++;
            if (fail && chunkX === 1) throw new Error("terrain failed");
            return generateWorldChunk({ seed: SEED, chunkSize: 24, chunkX, chunkY });
        } };
        const world = new CombatWorld(source, { PathFinder, decodeWorldChunkTile });
        await world.load({ x: -1, y: 0 });
        expect(samples).toBe(9);
        const path = world.path({ x: -2, y: 0 }, { x: 3, y: 0 });
        expect(path.length).toBeGreaterThan(0);
        path.forEach((p, i) => expect(getNeighbors(i ? path[i - 1].x : -2, i ? path[i - 1].y : 0)).toContainEqual(expect.objectContaining(p)));
        fail = true;
        await expect(world.load({ x: 0, y: 0 })).rejects.toThrow("terrain failed");
        expect(world.readyAt({ x: -1, y: 0 })).toBe(true);
        expect(world.stats.chunks).toBe(9);
        fail = false;
        await world.load({ x: 0, y: 0 });
        expect(world.readyAt({ x: 0, y: 0 })).toBe(true);
        expect(world.stats.chunks).toBe(9);
        world.dispose();
    });
});

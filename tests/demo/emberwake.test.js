import { describe, expect, it } from "vitest";
import { getNeighbors } from "../../src/helpers/neighbors";
import {
    DEFAULT_SEED, HOME, TURN_LIMIT, UPGRADES, act, beacons, capacity, createExpedition,
    distance, flightCost, keyOf, samePoint, siteAt, validateExpedition
} from "../../public/emberwake/rules.js";

const plain = { type: "land", modifiers: [] };
const snowyHill = { type: "snow", modifiers: ["hill"] };

function flyTo(state, destination, tile = plain) {
    while (!samePoint(state.position, destination)) {
        const next = getNeighbors(state.position.x, state.position.y).reduce((best, point) =>
            distance(point, destination) < distance(best, destination) ? point : best);
        if (state.fuel < flightCost(state, tile)) state = act(state, { type: "charge" });
        state = act(state, { type: "move", to: next, tile });
    }
    return state;
}

describe("Emberwake expedition", () => {
    it("uses the foundation's six neighbors across positive and negative odd columns", () => {
        for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) {
            const point = { x, y };
            expect(distance(point, point)).toBe(0);
            for (const neighbor of getNeighbors(x, y)) {
                expect(distance(point, neighbor)).toBe(1);
                expect(distance(neighbor, point)).toBe(1);
            }
        }
    });

    it("places reproducible stations beyond the starting source chunk", () => {
        for (const seed of [DEFAULT_SEED, "archipelago", "负坐标", "long-night"]) {
            const sites = beacons(seed);
            expect(Math.abs(sites[2].x)).toBeGreaterThan(24);
            expect(new Set(sites.map(keyOf)).size).toBe(3);
            for (const site of sites) expect(siteAt(seed, site)).toEqual(site);
            expect(siteAt(seed, HOME).kind).toBe("home");
        }
    });

    it("can finish a full voyage, including a costly snowy world, without luck or supply stations", () => {
        for (const seed of [DEFAULT_SEED, "archipelago", "负坐标", "long-night"]) {
            let state = createExpedition(seed);
            const choices = Object.keys(UPGRADES);
            for (const [index, site] of beacons(seed).entries()) {
                state = flyTo(state, site, snowyHill);
                state = act(state, { type: "interact" });
                expect(state.pendingUpgrade).toBe(true);
                expect(() => act(state, { type: "charge" })).toThrow("改装");
                state = act(state, { type: "upgrade", upgrade: choices[index] });
                expect(validateExpedition(state, seed)).toEqual(state);
            }
            state = flyTo(state, HOME, snowyHill);
            expect(state.status).toBe("won");
            expect(state.turn).toBeLessThan(TURN_LIMIT);
            expect(validateExpedition(state, seed)).toEqual(state);
        }
    });

    it("rejects illegal movement and insufficient fuel atomically, while zero fuel can charge", () => {
        const state = { ...createExpedition(), fuel: 0 };
        const original = structuredClone(state);
        expect(() => act(state, { type: "move", to: { x: 10, y: 0 }, tile: plain })).toThrow("相邻");
        expect(() => act(state, { type: "move", to: { x: 1, y: 0 }, tile: plain })).toThrow("燃料不足");
        expect(state).toEqual(original);
        const charged = act(state, { type: "charge" });
        expect(charged.fuel).toBe(6);
        expect(charged.turn).toBe(3);
    });

    it("consumes supplies once and caps fuel at the installed tank capacity", () => {
        let site;
        for (let x = -10; x <= 10 && !site; x++) for (let y = -10; y <= 10; y++) {
            const candidate = siteAt(DEFAULT_SEED, { x, y });
            if (candidate?.kind === "supply") { site = candidate; break; }
        }
        const state = { ...createExpedition(), position: { x: site.x, y: site.y }, fuel: 47 };
        const claimed = act(state, { type: "interact" });
        expect(claimed.fuel).toBe(capacity(claimed));
        expect(claimed.turn).toBe(1);
        expect(() => act(claimed, { type: "interact" })).toThrow("已经访问");
        expect(state.collected).toEqual([]);
    });

    it("ends at the storm deadline, with a final-hour return still counting as victory", () => {
        const late = { ...createExpedition(), turn: TURN_LIMIT - 1, fuel: 1 };
        const lost = act(late, { type: "charge" });
        expect(lost.status).toBe("lost");
        expect(lost.turn).toBe(TURN_LIMIT);
        expect(() => act(lost, { type: "charge" })).toThrow("已经结束");
        const inbound = { ...late, position: { x: 1, y: 0 }, lit: beacons(late.seed).map(site => site.id) };
        expect(act(inbound, { type: "move", to: HOME, tile: plain }).status).toBe("won");
    });

    it("validates recovery rather than accepting broken or different-world state", () => {
        const state = createExpedition();
        const restored = validateExpedition(state, state.seed);
        restored.visited.push("1,0");
        expect(state.visited).toEqual(["0,0"]);
        for (const bad of [
            { ...state, fuel: -1 }, { ...state, turn: Infinity }, { ...state, seed: "other" },
            { ...state, upgrades: ["unknown"] }, { ...state, position: { x: 1.5, y: 0 } },
            { ...state, status: "won" }, { ...state, pendingUpgrade: true },
            { ...state, visited: ["0,0", "0,0"] }
        ]) expect(() => validateExpedition(bad, state.seed)).toThrow("存档");
    });
});

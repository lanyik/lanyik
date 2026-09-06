import { describe, expect, it } from "vitest";
import { MINERALS, MINERAL_IDS, type MineralNode, type SurveyTerrain } from "../src/content/minerals";
import { MineralField } from "../src/core/resources/MineralField";

const ground: SurveyTerrain = { type: "land", hill: false, forest: false, lake: false };
function collect(field: MineralField, originX: number, originY: number, size: number): MineralNode[] {
    const nodes: MineralNode[] = [];
    for (let y = originY; y < originY + size; y += 1) {
        for (let x = originX; x < originX + size; x += 1) {
            const node = field.nodeAt(x, y, ground);
            if (node) nodes.push(node);
        }
    }
    return nodes;
}

describe("MineralField", () => {
    it("generates the same veins across chunk boundaries, traversal orders and reconstructed fields", () => {
        const field = new MineralField("expedition-1");
        const whole = collect(field, -48, -48, 96);
        const parts = [[0, 0], [-48, 0], [0, -48], [-48, -48]]
            .flatMap(([x, y]) => collect(new MineralField("expedition-1"), x, y, 48));
        const byId = (a: MineralNode, b: MineralNode) => a.id.localeCompare(b.id);
        expect(parts.sort(byId)).toEqual([...whole].sort(byId));
        const chunksByDeposit = new Map<string, Set<string>>();
        for (const node of whole) {
            const chunks = chunksByDeposit.get(node.depositId) ?? new Set<string>();
            chunks.add(`${Math.floor(node.x / 24)},${Math.floor(node.y / 24)}`);
            chunksByDeposit.set(node.depositId, chunks);
        }
        expect([...chunksByDeposit.values()].some(chunks => chunks.size > 1)).toBe(true);
        expect(new Set(whole.map(node => node.id)).size).toBe(whole.length);
    });

    it("provides all three useful mineral kinds with finite immutable integer reserves", () => {
        const nodes = collect(new MineralField("expedition-2"), -48, -48, 96);
        expect([...new Set(nodes.map(node => node.mineral))].sort()).toEqual([...MINERAL_IDS].sort());
        for (const node of nodes) {
            expect(Number.isSafeInteger(node.initialAmount)).toBe(true);
            expect(node.initialAmount).toBeGreaterThanOrEqual(MINERALS[node.mineral].minimum);
            expect(node.initialAmount).toBeLessThanOrEqual(MINERALS[node.mineral].maximum);
            expect(Object.isFrozen(node)).toBe(true);
        }
        expect(nodes.length).toBeGreaterThan(300);
        expect(nodes.length).toBeLessThan(96 * 96 / 3);
    });

    it("excludes water and lakes while forest clearing does not replace an existing deposit", () => {
        const field = new MineralField("expedition-1");
        const node = collect(field, -24, -24, 48)[0];
        for (const type of ["sea", "coastal"] as const) {
            expect(field.nodeAt(node.x, node.y, { ...ground, type })).toBeUndefined();
        }
        expect(field.nodeAt(node.x, node.y, { ...ground, lake: true })).toBeUndefined();
        expect(field.nodeAt(node.x, node.y, { ...ground, forest: true })).toEqual(node);
        expect(field.nodeAt(node.x, node.y, { ...ground, type: "mountain" })).toEqual(node);
    });

    it("separates seeds and full coordinate words and rejects invalid coordinates", () => {
        const field = new MineralField("expedition-1");
        const original = collect(field, 0, 0, 48);
        expect(collect(new MineralField("expedition-2"), 0, 0, 48)).not.toEqual(original);
        const offset = 0x1_0000_0000 * 16;
        const far = collect(field, offset, 0, 48).map(node => [node.x - offset, node.y, node.mineral, node.initialAmount]);
        expect(far).not.toEqual(original.map(node => [node.x, node.y, node.mineral, node.initialAmount]));
        for (const coordinate of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => field.nodeAt(coordinate, 0, ground)).toThrow(RangeError);
        }
    });
});

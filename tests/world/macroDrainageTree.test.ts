import { describe, expect, test } from "vitest";

import {
    MACRO_DRAINAGE_INVALID,
    MACRO_DRAINAGE_INVALID_RANK,
    MACRO_DRAINAGE_TERMINAL,
    MacroDrainageRaster,
    buildMacroDrainageTree,
    macroDrainageIndex
} from "../../src/world/MacroDrainageTree";

function raster(
    width: number,
    height: number,
    heightAt: (x: number, y: number) => number,
    oceanAt: (x: number, y: number) => boolean = () => false,
    validAt: (x: number, y: number) => boolean = () => true,
    seaLevel = 100
): MacroDrainageRaster {
    const length = width * height;
    const valid = new Uint8Array(length);
    const groundHeight = new Uint16Array(length);
    const ocean = new Uint8Array(length);
    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            const index = macroDrainageIndex(x, y, height);
            valid[index] = validAt(x, y) ? 1 : 0;
            groundHeight[index] = heightAt(x, y);
            ocean[index] = oceanAt(x, y) ? 1 : 0;
        }
    }
    return { width, height, valid, groundHeight, ocean, seaLevel };
}

function assertAllPathsTerminate(tree: ReturnType<typeof buildMacroDrainageTree>, valid: Uint8Array): void {
    for (let start = 0; start < valid.length; start += 1) {
        if (valid[start] === 0) continue;
        let index = start;
        let steps = 0;
        while (tree.downstream[index] !== MACRO_DRAINAGE_TERMINAL) {
            index = tree.downstream[index];
            steps += 1;
            expect(steps).toBeLessThanOrEqual(tree.maxDrainageRank);
        }
    }
}

describe("MacroDrainageTree", () => {
    test("routes a sloped basin to stable ocean terminals", () => {
        const input = raster(
            6,
            5,
            (x, y) => x === 0 ? 80 + y : 110 + x * 20 + Math.abs(y - 2),
            x => x === 0
        );
        const tree = buildMacroDrainageTree(input);
        expect(tree.terminalKind).toBe("ocean");
        expect([...tree.terminalIndices]).toEqual([0, 1, 2, 3, 4]);
        expect(tree.validNodeCount).toBe(30);
        expect(tree.maxDrainageRank).toBe(25);
        assertAllPathsTerminate(tree, input.valid);
        for (let index = 0; index < input.valid.length; index += 1) {
            const parent = tree.downstream[index];
            if (parent < 0) continue;
            expect(tree.drainageRank[parent]).toBeLessThan(tree.drainageRank[index]);
            expect(tree.spillLevel[parent]).toBeLessThanOrEqual(tree.spillLevel[index]);
            expect(tree.discharge[parent]).toBeGreaterThanOrEqual(tree.discharge[index]);
        }
    });

    test("creates a canonical lake terminal for a landlocked basin", () => {
        const input = raster(5, 5, (x, y) => 120 + Math.abs(x - 2) * 7 + Math.abs(y - 2) * 5);
        const tree = buildMacroDrainageTree(input);
        expect(tree.terminalKind).toBe("lake");
        expect([...tree.terminalIndices]).toEqual([macroDrainageIndex(2, 2, 5)]);
        expect(tree.downstream[macroDrainageIndex(2, 2, 5)]).toBe(MACRO_DRAINAGE_TERMINAL);
        expect(tree.discharge[macroDrainageIndex(2, 2, 5)]).toBe(25);
        assertAllPathsTerminate(tree, input.valid);
    });

    test("uses x-major index order as the deterministic plateau tie-break", () => {
        const input = raster(3, 3, () => 200);
        const groundBefore = input.groundHeight.slice();
        const validBefore = input.valid.slice();
        const first = buildMacroDrainageTree(input);
        const second = buildMacroDrainageTree(input);
        expect([...first.terminalIndices]).toEqual([0]);
        expect([...first.downstream]).toEqual([...second.downstream]);
        expect([...first.drainageRank]).toEqual([...second.drainageRank]);
        expect([...first.spillLevel]).toEqual(new Array(9).fill(200));
        expect(first.discharge[0]).toBe(9);
        expect(input.groundHeight).toEqual(groundBefore);
        expect(input.valid).toEqual(validBefore);
    });

    test("keeps invalid cells empty and rejects disconnected basin masks", () => {
        const connected = raster(
            3,
            3,
            (x, y) => 100 + x + y,
            () => false,
            (x, y) => !(x === 2 && y === 2)
        );
        const tree = buildMacroDrainageTree(connected);
        const invalid = macroDrainageIndex(2, 2, 3);
        expect(tree.downstream[invalid]).toBe(MACRO_DRAINAGE_INVALID);
        expect(tree.drainageRank[invalid]).toBe(MACRO_DRAINAGE_INVALID_RANK);
        expect(tree.discharge[invalid]).toBe(0);

        const disconnected = raster(
            3,
            3,
            () => 100,
            () => false,
            (x, y) => (x === 0 && y === 0) || (x === 2 && y === 2)
        );
        expect(() => buildMacroDrainageTree(disconnected)).toThrow(/connected/);
    });

    test("rejects invalid masks and ocean levels before publication", () => {
        const invalidOcean = raster(2, 2, () => 120, () => true, () => true, 100);
        expect(() => buildMacroDrainageTree(invalidOcean)).toThrow(/ocean ground/);
        const invalidMask = raster(2, 2, () => 100);
        invalidMask.valid[0] = 2;
        expect(() => buildMacroDrainageTree(invalidMask)).toThrow(/zero or one/);
    });

    test("handles a canonical 64x64 basin working set without recursion", () => {
        const input = raster(
            64,
            64,
            (x, y) => 100 + Math.floor(Math.hypot(x - 31, y - 31) * 16),
            () => false
        );
        const tree = buildMacroDrainageTree(input);
        expect(tree.validNodeCount).toBe(4096);
        expect(tree.maxDrainageRank).toBe(4095);
        expect(tree.discharge[tree.terminalIndices[0]]).toBe(4096);
    });
});

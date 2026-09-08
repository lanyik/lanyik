import { describe, expect, test } from "vitest";
import { DeterministicRandom } from "../src/core/DeterministicRandom";

describe("DeterministicRandom", () => {
    test("clones the current position without sharing subsequent mutations", () => {
        const random = new DeterministicRandom("reward-transaction");
        random.nextUint32(); random.nextUint32();
        const trial = random.clone();
        const sequence = Array.from({ length: 32 }, () => trial.nextUint32());
        expect(Array.from({ length: 32 }, () => random.nextUint32())).toEqual(sequence);
    });
    test("replays the same bounded sequence for the same seed", () => {
        const first = new DeterministicRandom("same-run");
        const second = new DeterministicRandom("same-run");
        expect(Array.from({ length: 32 }, () => first.nextUint32()))
            .toEqual(Array.from({ length: 32 }, () => second.nextUint32()));
        expect(new Set(Array.from({ length: 16 }, () => first.integer(7))).size).toBeGreaterThan(1);
    });

    test("rejects invalid domains instead of hiding content errors", () => {
        const random = new DeterministicRandom(1);
        expect(() => random.integer(0)).toThrow("positive safe integer");
        expect(() => random.chance(1.1)).toThrow("between zero and one");
        expect(() => random.pick([])).toThrow("empty");
    });
});

import { describe, expect, test } from "vitest";

import { hashSafeIntegerCoordinates } from "../../src/world/DeterministicHash";

describe("v2 deterministic coordinate hashing", () => {
    test("freezes signed safe-integer vectors without 32-bit coordinate truncation", () => {
        const vectors = [
            [0, 0, 0, 0],
            [0x1234_5678, -1, 1, 0x9abc_def0],
            [0xffff_ffff, 0x1_0000_0000, 0, 17],
            [0xffff_ffff, 0, 0x1_0000_0000, 17],
            [123, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 456]
        ] as const;
        expect(vectors.map(([seed, x, y, salt]) =>
            hashSafeIntegerCoordinates(seed, x, y, salt)
        )).toEqual([
            1_304_746_181,
            4_190_752_061,
            1_334_150_946,
            2_052_863_429,
            2_511_487_597
        ]);
    });

    test("distinguishes signs and high coordinate words", () => {
        const seed = 0x1020_3040;
        const base = hashSafeIntegerCoordinates(seed, 0, 0);
        expect(hashSafeIntegerCoordinates(seed, -0, 0)).toBe(base);
        expect(hashSafeIntegerCoordinates(seed, -1, 0)).not.toBe(hashSafeIntegerCoordinates(seed, 1, 0));
        expect(hashSafeIntegerCoordinates(seed, 0x1_0000_0000, 0)).not.toBe(base);
        expect(hashSafeIntegerCoordinates(seed, 0, 0x1_0000_0000)).not.toBe(base);
    });

    test("rejects values outside the frozen integer domain", () => {
        expect(() => hashSafeIntegerCoordinates(-1, 0, 0)).toThrow(/uint32/);
        expect(() => hashSafeIntegerCoordinates(0, Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(/safe integers/);
        expect(() => hashSafeIntegerCoordinates(0, 0, 0, 0x1_0000_0000)).toThrow(/uint32/);
    });
});

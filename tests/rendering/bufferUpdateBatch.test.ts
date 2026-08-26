import { BufferAttribute } from "three";
import { describe, expect, test } from "vitest";

import { commitBufferAttributeRanges, mergeBufferUpdateRanges } from "../../src/index";

describe("GPU buffer update batching", () => {
    test("sorts and merges overlapping or touching component ranges", () => {
        expect(mergeBufferUpdateRanges([
            { start: 20, count: 3 },
            { start: 2, count: 4 },
            { start: 5, count: 8 },
            { start: 18, count: 2 },
            { start: 40, count: 0 }
        ])).toEqual([
            { start: 2, count: 11 },
            { start: 18, count: 5 }
        ]);
    });

    test("coalesces ranges already queued on a Three.js attribute", () => {
        const attribute = new BufferAttribute(new Float32Array(64), 1);
        attribute.addUpdateRange(8, 4);
        const version = attribute.version;
        commitBufferAttributeRanges(attribute, [
            { start: 2, count: 3 },
            { start: 5, count: 3 },
            { start: 12, count: 2 }
        ]);
        expect(attribute.updateRanges).toEqual([{ start: 2, count: 12 }]);
        expect(attribute.version).toBe(version + 1);
    });
});

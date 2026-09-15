import { describe, expect, test } from "vitest";
import { setOptions } from "../../src/helpers/setoptions";

describe("setOptions", () => {
    test("setOptions only copies known own keys", () => {
        const target = { options: { enabled: true } };
        const inherited = Object.create({ enabled: false }) as { enabled?: boolean; extra?: number };
        inherited.extra = 3;
        setOptions(target, inherited);
        expect(target.options).toEqual({ enabled: true });

        setOptions(target, { enabled: false, unknown: true, __proto__: { polluted: true } });
        expect(target.options).toEqual({ enabled: false });
        expect((target.options as { polluted?: boolean }).polluted).toBeUndefined();
    });
});

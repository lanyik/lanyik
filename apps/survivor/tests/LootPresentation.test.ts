import { afterEach, expect, test, vi } from "vitest";
import { BoxGeometry, BufferGeometryLoader, Vector2 } from "three";
import { LootModels } from "../src/presentation/LootModels";
import { LootEffects } from "../src/presentation/LootEffects";
import { MAX_GROUND_EQUIPMENT } from "../src/core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../src/core/RegionalWorld";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test("a partial loot-model decode failure releases every decoded geometry", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('{"chest":{},"potion":{},"weapon-sword":{},"shield-round":{}}').buffer }));
    const disposed = vi.fn(), geometry = new BoxGeometry(); geometry.addEventListener("dispose", disposed);
    vi.spyOn(BufferGeometryLoader.prototype, "parse").mockReturnValueOnce(geometry).mockImplementationOnce(() => { throw new Error("Malformed loot geometry"); });
    await expect(LootModels.load(new Vector2(), new AbortController().signal)).rejects.toThrow("Malformed loot geometry");
    expect(disposed).toHaveBeenCalledTimes(1);
});

test("loot effects bound both pools, tier the beam population and reset upload ranges after shrinking", () => {
    const effects = new LootEffects(); effects.begin(1);
    for (let i = 0; i < MAX_GROUND_EQUIPMENT + MAX_COMBAT_CHUNKS; i++) effects.add(i, 0, 0, i % 6, i);
    effects.upload();
    expect(effects.halo.count).toBe(MAX_GROUND_EQUIPMENT + MAX_COMBAT_CHUNKS);
    expect(effects.beam.count).toBeLessThan(effects.halo.count);
    expect(effects.halo.instanceMatrix.updateRanges).toEqual([{ start: 0, count: effects.halo.count * 16 }]);
    effects.begin(2); effects.add(0, 0, 0, 5, 0); effects.upload();
    expect(effects.halo.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }]);
    expect(effects.beam.count).toBe(1);
    effects.reset(); effects.upload(); expect(effects.halo.instanceMatrix.updateRanges).toEqual([]);
    effects.dispose();
});

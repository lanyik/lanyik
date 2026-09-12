import { createWorldDescriptor, createWorldSurfaceResolver, generateWorldOverviewWithResolver } from "three-hex-map";
import { COMBAT_WATER_STYLE } from "../adapters/CombatEnvironment";

self.onmessage = (event: MessageEvent<string>) => {
    try {
        const seed = event.data;
        if (typeof seed !== "string" || !seed.trim() || seed.length > 128) throw new Error("请输入 1–128 字的种子");
        const descriptor = createWorldDescriptor({ seed, waterStyle: COMBAT_WATER_STYLE });
        const overview = generateWorldOverviewWithResolver({ descriptor, originX: -256, originY: -256, tileSpanX: 512, tileSpanY: 512, pixelWidth: 192, pixelHeight: 192 },
            createWorldSurfaceResolver({ seed, waterStyle: COMBAT_WATER_STYLE }));
        self.postMessage({ seed, pixels: overview.pixels }, { transfer: [overview.pixels.buffer] });
    } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};

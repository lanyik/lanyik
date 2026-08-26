import { expect, test } from "@playwright/test";

test("reports the browser render-backend capabilities", async ({ page }, testInfo) => {
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    const capabilities = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        const gpu = navigator.gpu as GPU | undefined;
        let adapter: GPUAdapter | null = null;
        let adapterError: string | undefined;
        if (gpu) {
            try {
                adapter = await gpu.requestAdapter();
            } catch (reason) {
                adapterError = reason instanceof Error ? reason.message : String(reason);
            }
        }
        return {
            secureContext: window.isSecureContext,
            webgl2: Boolean(gl),
            webglRenderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : undefined,
            webgpuApi: Boolean(gpu),
            webgpuAdapter: Boolean(adapter),
            webgpuFeatures: adapter ? [...adapter.features].sort() : [],
            adapterError
        };
    });

    console.log(`[render-capabilities] ${JSON.stringify(capabilities)}`);
    await testInfo.attach("render-capabilities.json", {
        body: JSON.stringify(capabilities, null, 2),
        contentType: "application/json"
    });
    expect(capabilities.webgl2).toBe(true);
    expect(typeof capabilities.webgpuApi).toBe("boolean");
});

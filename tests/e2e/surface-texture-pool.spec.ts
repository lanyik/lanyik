import { expect, test } from "@playwright/test";

interface SurfaceTextureGpuProbe {
    supported: boolean;
    firstPixel?: number[];
    restoredPixel?: number[];
    expectedPixel?: number[];
    uploadErrors?: number[];
    firstRenderError?: number;
    firstReadError?: number;
    restoredRenderError?: number;
    restoredReadError?: number;
    rendererTextures?: number;
    pendingAfterFirstRender?: number;
    pendingBeforeRestoreRender?: number;
    pendingAfterRestoreRender?: number;
    poolStats?: {
        pageCount: number;
        textureCount: number;
        gpuBytes: number;
        uploadedSlots: number;
        contextRestores: number;
    };
}

test("uploads and restores a paged v2 surface field in real WebGL2", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/textures/land-atlas.json", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
        const threeModulePath = "/js/vendor/three.module.js";
        const three = await import(threeModulePath) as typeof import("three");
        (window as unknown as { THREE: typeof three }).THREE = three;
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "/js/hex-map.global.js";
            script.addEventListener("load", () => resolve(), { once: true });
            script.addEventListener("error", () => reject(new Error("failed to load HexMap global bundle")), {
                once: true
            });
            document.head.append(script);
        });
    });

    const initial = await page.evaluate((): SurfaceTextureGpuProbe => {
        const three = (window as unknown as { THREE: typeof import("three") }).THREE;
        const api = (window as unknown as { HexMap: Record<string, any> }).HexMap;
        const size = api.SURFACE_EFFECTIVE_WINDOW_SIZE as number;
        const count = size * size;
        const biomeWeights = new Uint8Array(count * 4);
        for (let index = 0; index < count; index += 1) biomeWeights[index * 4] = 255;
        const key = { chunkX: -2, chunkY: 3 };
        const effectiveWindow = {
            worldIdentity: "surface-texture-gpu-probe",
            effectiveRevision: 0,
            key,
            dependencyKey: {
                worldIdentity: "surface-texture-gpu-probe",
                renderKey: key,
                compilerRevision: api.SURFACE_COMPILER_REVISION,
                compileProfileVersion: 1,
                semanticChunks: [],
                hydrologyRegions: []
            },
            validBounds: { minX: 0, minY: 0, maxXExclusive: 16, maxYExclusive: 16 },
            substrateClass: new Uint8Array(count).fill(1),
            macroHeight: new Uint16Array(count).fill(50_000),
            biomeWeights,
            climate: new Uint8Array(count * 2).fill(127),
            vegetationDensity: new Uint8Array(count),
            vegetationProfile: new Uint8Array(count),
            rivers: [],
            lakes: []
        };
        const chunk = api.compileSurfaceChunk(effectiveWindow);
        const pool = new api.SurfaceTexturePool({ gpuBudgetBytes: api.SURFACE_GPU_PAGE_BYTES });
        const slot = pool.allocate(key);
        pool.upload(slot, chunk);
        const binding = pool.getBinding(slot);

        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const renderer = new three.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(2, 2, false);
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const extension = gl.getExtension("WEBGL_lose_context");
        if (!extension) {
            pool.dispose();
            renderer.dispose();
            return { supported: false };
        }
        while (gl.getError() !== gl.NO_ERROR) { /* clear constructor diagnostics */ }
        const uploadErrors = [
            binding.valuesTexture,
            binding.materialTexture,
            binding.flowTexture,
            binding.waterTexture
        ].map(texture => {
            renderer.initTexture(texture);
            return gl.getError();
        });

        const geometry = new three.PlaneGeometry(2, 2);
        const material = new three.ShaderMaterial({
            glslVersion: three.GLSL3,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                surfaceValues: { value: binding.valuesTexture },
                surfaceMaterial: { value: binding.materialTexture },
                surfaceFlow: { value: binding.flowTexture },
                surfaceWater: { value: binding.waterTexture },
                surfaceLayer: { value: slot.layerIndex }
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform highp sampler2DArray surfaceValues;
                uniform lowp sampler2DArray surfaceMaterial;
                uniform lowp sampler2DArray surfaceFlow;
                uniform lowp sampler2DArray surfaceWater;
                uniform int surfaceLayer;
                out vec4 outputColor;
                void main() {
                    ivec3 location = ivec3(7, 19, surfaceLayer);
                    vec4 values = texelFetch(surfaceValues, location, 0);
                    vec4 material = texelFetch(surfaceMaterial, location, 0);
                    vec2 flow = texelFetch(surfaceFlow, location, 0).rg;
                    vec3 water = texelFetch(surfaceWater, location, 0).rgb;
                    outputColor = vec4(values.r, material.r, water.r, flow.r * 0.5 + 0.5);
                }
            `
        });
        const scene = new three.Scene();
        scene.add(new three.Mesh(geometry, material));
        const camera = new three.Camera();
        const target = new three.WebGLRenderTarget(1, 1, {
            format: three.RGBAFormat,
            type: three.UnsignedByteType,
            magFilter: three.NearestFilter,
            minFilter: three.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        });

        let lastRenderError = 0;
        let lastReadError = 0;
        const renderProbe = (): number[] => {
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            lastRenderError = gl.getError();
            const pixel = new Uint8Array(4);
            renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
            lastReadError = gl.getError();
            return [...pixel];
        };
        const firstPixel = renderProbe();
        const firstRenderError = lastRenderError;
        const firstReadError = lastReadError;
        const pendingAfterFirstRender = pool.stats.pendingLayerUploads;
        const physicalX = 7;
        const physicalY = 19;
        const source = physicalX * api.SURFACE_FIELD_TEXTURE_SIZE + physicalY;
        const expectedPixel = [
            Math.round(api.decodeFloat16(chunk.field.groundHeight[source]) * 255),
            chunk.field.materialWeights[source * 4],
            chunk.field.waterCoverage[source],
            Math.round((chunk.field.flow[source * 2] / 127 * 0.5 + 0.5) * 255)
        ];

        const probe = {
            state: "ready",
            extension,
            gl,
            renderer,
            target,
            material,
            geometry,
            pool,
            renderProbe,
            getLastErrors: () => [lastRenderError, lastReadError],
            firstPixel,
            expectedPixel,
            firstRenderError,
            firstReadError,
            pendingAfterFirstRender,
            uploadErrors
        };
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            pool.handleContextLost();
            probe.state = "lost";
        });
        canvas.addEventListener("webglcontextrestored", () => {
            pool.handleContextRestored();
            probe.state = "restored";
        });
        (window as unknown as { surfaceTextureProbe: typeof probe }).surfaceTextureProbe = probe;
        return {
            supported: true,
            firstPixel,
            expectedPixel,
            uploadErrors,
            firstRenderError,
            firstReadError,
            pendingAfterFirstRender
        };
    });

    test.skip(!initial.supported, "WEBGL_lose_context is unavailable");
    await page.evaluate(() => {
        const probe = (window as unknown as {
            surfaceTextureProbe: { extension: WEBGL_lose_context };
        }).surfaceTextureProbe;
        probe.extension.loseContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        surfaceTextureProbe?: { state: string };
    }).surfaceTextureProbe?.state === "lost");
    await page.evaluate(() => {
        const probe = (window as unknown as {
            surfaceTextureProbe: { extension: WEBGL_lose_context };
        }).surfaceTextureProbe;
        probe.extension.restoreContext();
    });
    await page.waitForFunction(() => (window as unknown as {
        surfaceTextureProbe?: { state: string };
    }).surfaceTextureProbe?.state === "restored");

    const result = await page.evaluate((): SurfaceTextureGpuProbe => {
        const probe = (window as unknown as {
            surfaceTextureProbe: {
                gl: WebGL2RenderingContext;
                renderer: import("three").WebGLRenderer;
                target: import("three").WebGLRenderTarget;
                material: import("three").ShaderMaterial;
                geometry: import("three").BufferGeometry;
                pool: {
                    stats: {
                        pageCount: number;
                        textureCount: number;
                        gpuBytes: number;
                        uploadedSlots: number;
                        contextRestores: number;
                        pendingLayerUploads: number;
                    };
                    dispose(): void;
                };
                renderProbe(): number[];
                getLastErrors(): number[];
                firstPixel: number[];
                expectedPixel: number[];
                firstRenderError: number;
                firstReadError: number;
                pendingAfterFirstRender: number;
                uploadErrors: number[];
            };
        }).surfaceTextureProbe;
        const pendingBeforeRestoreRender = probe.pool.stats.pendingLayerUploads;
        const restoredPixel = probe.renderProbe();
        const [restoredRenderError, restoredReadError] = probe.getLastErrors();
        const pendingAfterRestoreRender = probe.pool.stats.pendingLayerUploads;
        const rendererTextures = probe.renderer.info.memory.textures;
        const poolStats = probe.pool.stats;

        probe.target.dispose();
        probe.material.dispose();
        probe.geometry.dispose();
        probe.pool.dispose();
        probe.renderer.dispose();
        return {
            supported: true,
            firstPixel: probe.firstPixel,
            restoredPixel,
            expectedPixel: probe.expectedPixel,
            uploadErrors: probe.uploadErrors,
            firstRenderError: probe.firstRenderError,
            firstReadError: probe.firstReadError,
            restoredRenderError,
            restoredReadError,
            rendererTextures,
            pendingAfterFirstRender: probe.pendingAfterFirstRender,
            pendingBeforeRestoreRender,
            pendingAfterRestoreRender,
            poolStats
        };
    });

    expect(pageErrors).toEqual([]);
    expect(result.uploadErrors).toEqual([0, 0, 0, 0]);
    expect({ render: result.firstRenderError, read: result.firstReadError }).toEqual({ render: 0, read: 0 });
    expect({ render: result.restoredRenderError, read: result.restoredReadError }).toEqual({ render: 0, read: 0 });
    expect(result.rendererTextures).toBeGreaterThanOrEqual(5);
    expect(result.pendingAfterFirstRender).toBe(0);
    expect(result.pendingBeforeRestoreRender).toBe(1);
    expect(result.pendingAfterRestoreRender).toBe(0);
    expect(result.poolStats).toMatchObject({
        pageCount: 1,
        textureCount: 4,
        gpuBytes: 9_478_656,
        uploadedSlots: 1,
        contextRestores: 1
    });
    expect(result.firstPixel).toHaveLength(4);
    expect(result.restoredPixel).toHaveLength(4);
    for (let index = 0; index < 4; index += 1) {
        expect(Math.abs(result.firstPixel![index] - result.expectedPixel![index])).toBeLessThanOrEqual(1);
        expect(Math.abs(result.restoredPixel![index] - result.expectedPixel![index])).toBeLessThanOrEqual(1);
    }
});

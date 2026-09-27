import { expect, test } from "@playwright/test";

test("forest wind anchors roots, shares colour/depth motion and survives LODs, clock wrap and rebasing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/?quality=gallery&shadows");
    await page.waitForFunction(() => (window as any).getWorldDiagnostics?.().status === "generated");
    const result = await page.evaluate(() => {
        const { THREE: t, HexMap: api, hexWorld: map } = window as any;
        const renderer = map.rendererHost.renderer, scene = new t.Scene(); scene.background = new t.Color(0);
        scene.add(new t.AmbientLight(0xffffff, 2));
        const camera = new t.OrthographicCamera(-20, 20, 105, -5, 1, 400); camera.position.z = 200;
        const target = new t.WebGLRenderTarget(256, 512), bytes = new Uint8Array(256 * 512 * 4);
        const colour = new t.MeshStandardMaterial({ color: 0xffffff, side: t.DoubleSide });
        const depth = new t.MeshDepthMaterial({ side: t.DoubleSide });
        const clock = { value: 0 };
        api.installForestWind(colour, clock, 100); api.installForestWind(depth, clock, 100);
        const geometries = [20, 10, 5].map(segments => new t.PlaneGeometry(12, 100, 1, segments).translate(0, 50, 0));
        const mesh = new t.InstancedMesh(geometries[0], colour, 1);
        mesh.setMatrixAt(0, new t.Matrix4()); mesh.frustumCulled = false; scene.add(mesh);
        const sample = () => {
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, 256, 512, bytes);
            const band = (low: number, high: number) => {
                let count = 0, sum = 0;
                for (let y = low; y < high; y++) for (let x = 0; x < 256; x++) {
                    if (bytes[(y * 256 + x) * 4] > 20) { count++; sum += x; }
                }
                if (!count) throw new Error("Wind sample has no visible geometry");
                return sum / count;
            };
            return { root: band(24, 34), crown: band(410, 440) };
        };
        try {
            const initial = sample(); clock.value = 3; const moved = sample();
            mesh.material = depth; const shadow = sample(); mesh.material = colour;
            const lods = geometries.map(geometry => { mesh.geometry = geometry; return sample(); });
            mesh.geometry = geometries[0]; clock.value = 20 * Math.PI; const wrapped = sample();
            mesh.position.set(-4096, 0, 8192); camera.position.set(-4096, 0, 8392);
            const rebased = sample();
            return { initial, moved, shadow, lods, wrapped, rebased };
        } finally {
            renderer.setRenderTarget(null); target.dispose(); mesh.dispose();
            geometries.forEach(geometry => geometry.dispose()); colour.dispose(); depth.dispose();
        }
    });
    expect(errors).toEqual([]);
    expect(Math.abs(result.moved.crown - result.initial.crown)).toBeGreaterThan(3);
    expect(Math.abs(result.moved.root - result.initial.root)).toBeLessThan(1);
    for (const sample of [result.shadow, ...result.lods]) {
        expect(Math.abs(sample.crown - result.moved.crown)).toBeLessThan(1);
        expect(Math.abs(sample.root - result.moved.root)).toBeLessThan(1);
    }
    for (const sample of [result.wrapped, result.rebased]) {
        expect(Math.abs(sample.crown - result.initial.crown)).toBeLessThan(1);
        expect(Math.abs(sample.root - result.initial.root)).toBeLessThan(1);
    }
});

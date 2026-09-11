import { expect, test } from "@playwright/test";

test("terrain receives one ground projection across slopes in both shader qualities", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/?quality=gallery", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).getWorldDiagnostics?.().status === "generated");
    await page.addStyleTag({ content: ".performance-panel,.world-status,.dg,.minimap-panel{display:none!important}" });
    for (const quality of ["full", "fast"]) {
        const result = await page.evaluate(async quality => {
            const { hexWorld: map, HexMap: api, THREE } = window as any;
            map.options.terrainShaderQuality = quality;
            const data: Record<number, Record<number, object>> = {};
            for (let x = 0; x < 18; x++) {
                data[x] = {};
                for (let y = 0; y < 18; y++) data[x][y] = { type: x < 9 ? api.Land.land : api.Land.mountain };
            }
            await map.load({ data, w: 18, h: 18 });
            map.mountainHeight = 160;
            const center = api.getHexCenter(9, 9, 1);
            const projection = new api.GroundProjection(12, 512);
            projection.setCenter(center.x, center.y, map.size);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: .8, depthTest: false, depthWrite: false });
            const stamp = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
            stamp.position.set(center.x, 0, center.y); stamp.rotation.x = -Math.PI / 2;
            projection.root.add(stamp);
            await map.registerWorldRenderLayer({ id: "ground-fixture", groundProjection: projection,
                mountChunk() {}, unmountChunk() {}, dispose() { projection.dispose(); stamp.geometry.dispose(); material.dispose(); } });
            // The stamp stays at zero. Terrain fragments at every height receive its colour.
            map.setCameraTargetTile(9, 9);
            const target = map.getCameraTarget(), camera = map.getCamera();
            camera.position.set(target.x - 100, target.y + 420, target.z + 270); camera.lookAt(target); camera.updateMatrixWorld();
            map.terrain.setGroundProjection(projection);
            map.rendererHost.render(projection);
            const gl = map.renderer.getContext() as WebGL2RenderingContext;
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const samples = [-1.1, -.4, .4, 1.1].map(dx => {
                const x = (center.x + dx) * map.size, z = center.y * map.size;
                const height = map.worldSurface.getWorldHeight(x, z);
                const point = new THREE.Vector3(x, height, z).project(camera);
                const px = Math.floor((point.x + 1) * gl.drawingBufferWidth / 2), py = Math.floor((point.y + 1) * gl.drawingBufferHeight / 2);
                const offset = (py * gl.drawingBufferWidth + px) * 4;
                return { height, red: pixels[offset], green: pixels[offset + 1], blue: pixels[offset + 2] };
            });
            const array = map.terrain.landMaterial.uniforms.map.value;
            const format = { array: array.isDataArrayTexture, mipmaps: array.generateMipmaps, anisotropy: array.anisotropy };
            return { samples, format };
        }, quality);
        expect(result.format).toEqual({ array: true, mipmaps: true, anisotropy: 8 });
        expect(Math.max(...result.samples.map(sample => sample.height)) - Math.min(...result.samples.map(sample => sample.height))).toBeGreaterThan(30);
        for (const sample of result.samples) {
            expect(sample.red).toBeGreaterThan(150);
            expect(sample.red).toBeGreaterThan(sample.green * 2);
            expect(sample.red).toBeGreaterThan(sample.blue * 2);
        }
        await page.screenshot({ path: testInfo.outputPath(`terrain-${quality}.png`) });
        await page.evaluate(() => (window as any).hexWorld.unregisterWorldRenderLayer("ground-fixture"));
    }
    expect(errors).toEqual([]);
});

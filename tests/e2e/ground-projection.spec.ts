/// <reference types="node" />
import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

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
            // Source coordinates are relative to the projection center, including on remote worlds.
            stamp.position.set(0, 0, 0); stamp.rotation.x = -Math.PI / 2;
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

test("remote ground projections retain their footprint across a streamed render-chunk seam", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/?quality=gallery", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).getWorldDiagnostics?.().status === "generated");

    for (const quality of ["full", "fast"]) {
        const result = await page.evaluate(async quality => {
            const { HexMap: api, THREE } = window as any;
            const canvas = document.createElement("canvas");
            canvas.id = "remote-ground-projection";
            canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:10000";
            document.body.append(canvas);
            const map = new api.HexMap({ element: "#remote-ground-projection", terrainShaderQuality: quality,
                size: 40, mountainHeight: 0, grassDensity: 0, treesPerTile: 0, skyVisible: false,
                antialias: false, maxPixelRatio: 1 });
            try {
                // One real generated 24x24 source chunk contains the boundary between
                // two 12x12 render chunks. World size does not increase fixture memory.
                const base = Math.ceil(1e8 / 24) * 24;
                const tileX = base + 12, tileY = -base + 6;
                const source = new api.ProceduralWorldSource({ seed: "remote-ground-projection",
                    workerUrl: new URL("./js/world-generator.worker.mjs", window.location.href),
                    workerCount: 1, chunkSize: 24, workCoordinator: map.workCoordinator });
                const edits = [];
                for (let dx = -8; dx <= 8; dx++) for (let dy = -5; dy <= 5; dy++) {
                    edits.push({ x: tileX + dx, y: tileY + dy,
                        changes: { type: api.Land.land, modifiers: [], rivers: [] } });
                }
                source.setTileOverrides(edits);
                await map.loadWorld({ source, initialTile: { x: tileX, y: tileY },
                    loadRadius: 0, retentionRadius: 0, maxResidentChunks: 1,
                    predictionMaxChunks: 0, adaptiveStreaming: false });

                const left = api.getHexCenter(tileX - 1, tileY, 1);
                const right = api.getHexCenter(tileX, tileY, 1);
                const seam = { x: (left.x + right.x) / 2, z: (left.y + right.y) / 2 };
                // A fractional footprint prevents a rounded remote origin from accidentally matching.
                const center = { x: seam.x + .173, z: seam.z + .117 };
                const projection = new api.GroundProjection(8, 512);
                projection.setCenter(center.x, center.z, map.size);
                const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true,
                    opacity: .8, depthTest: false, depthWrite: false });
                const stamp = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), material);
                stamp.rotation.x = -Math.PI / 2;
                projection.root.add(stamp);
                await map.registerWorldRenderLayer({ id: "remote-ground-fixture", groundProjection: projection,
                    mountChunk() {}, unmountChunk() {}, dispose() {
                        projection.dispose(); stamp.geometry.dispose(); material.dispose();
                    } });
                map.setCameraTarget(center.x * map.size, center.z * map.size);

                // Use the public Object3D placement contract to project probes after rebasing.
                // No renderer matrix, uniform or WebGL state is patched by this fixture.
                const anchor = new THREE.Group();
                anchor.position.set(center.x * map.size, 0, center.z * map.size);
                map.add(anchor);
                const requiredChunks = [tileX - 1, tileX].map(x => `${Math.floor(x / api.WORLD_CHUNK_SIZE)},${Math.floor(tileY / api.WORLD_CHUNK_SIZE)}`);
                const probes = [
                    ...[-.9, -.6, -.3, -.12, 0, .12, .3, .6, .9].map(distance => ({
                        x: Math.sqrt(3) / 2 * distance - .173, z: .5 * distance - .117, inside: true
                    })),
                    { x: -2.2, z: 0, inside: false }, { x: 2.2, z: 0, inside: false }
                ];
                return await new Promise<{
                    probes: { inside: boolean; redPixels: number; totalPixels: number }[];
                    renderedChunks: string[]; requiredChunks: string[];
                    logicalTarget: number[]; renderAnchor: number[]; png: string;
                }>((resolve, reject) => {
                    const readFrame = () => {
                        map.off("afterframe", readFrame);
                        try {
                            const gl = canvas.getContext("webgl2")!;
                            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                            const observations = probes.map(probe => {
                                const world = new THREE.Vector3(probe.x * map.size, 0, probe.z * map.size);
                                anchor.localToWorld(world).project(map.getCamera());
                                const px = Math.floor((world.x + 1) * gl.drawingBufferWidth / 2);
                                const py = Math.floor((world.y + 1) * gl.drawingBufferHeight / 2);
                                if (px < 1 || py < 1 || px >= gl.drawingBufferWidth - 1 || py >= gl.drawingBufferHeight - 1) {
                                    throw new Error("Remote projection probe left the viewport");
                                }
                                let redPixels = 0;
                                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                                    const offset = ((py + dy) * gl.drawingBufferWidth + px + dx) * 4;
                                    if (pixels[offset] > 150 && pixels[offset] > pixels[offset + 1] * 2
                                        && pixels[offset] > pixels[offset + 2] * 2) redPixels++;
                                }
                                return { inside: probe.inside, redPixels, totalPixels: 9 };
                            });
                            const renderedChunks: string[] = [];
                            map.getScene().traverse((object: any) => {
                                const chunk = api.getWorldChunkMetadata(object);
                                if (chunk?.kind === "land" && object.visible && object.geometry.getAttribute("position")) renderedChunks.push(chunk.key);
                            });
                            resolve({ probes: observations, renderedChunks, requiredChunks,
                                logicalTarget: map.getCameraTarget().toArray(),
                                renderAnchor: anchor.getWorldPosition(new THREE.Vector3()).toArray(),
                                png: canvas.toDataURL("image/png").split(",")[1] });
                        } catch (error) { reject(error); }
                    };
                    // Read in the real renderer's completion event, before the browser clears
                    // a non-preserved drawing buffer. This also runs the normal projection pass.
                    map.on("afterframe", readFrame);
                });
            } finally {
                await map.disposeAsync();
                canvas.remove();
            }
        }, quality);
        await testInfo.attach(`remote-ground-${quality}.png`, { body: Buffer.from(result.png, "base64"), contentType: "image/png" });
        expect(result.logicalTarget[0]).toBeGreaterThan(1e9);
        expect(result.logicalTarget[2]).toBeLessThan(-1e9);
        expect(Math.hypot(result.renderAnchor[0], result.renderAnchor[2])).toBeLessThan(100);
        expect(new Set(result.requiredChunks).size).toBe(2);
        for (const key of result.requiredChunks) expect(result.renderedChunks).toContain(key);
        for (const probe of result.probes) expect(probe.redPixels).toBe(probe.inside ? probe.totalPixels : 0);
    }
    expect(errors).toEqual([]);
});

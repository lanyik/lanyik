import { expect, test } from "@playwright/test";

test("linear HDR composition shares output, preserves highlights and lights metal from the sky", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/?quality=gallery");
    await page.waitForFunction(() => Boolean((window as any).HexMap?.HexMapRendererHost));
    const result = await page.evaluate(() => {
        const { HexMap: api, THREE: t } = window as any;
        const ledger = new api.ResourceBudgetLedger({ cpuBytes: 1048576, gpuBytes: 64000000 });
        const canvas = document.createElement("canvas"); document.body.append(canvas);
        const host = new api.HexMapRendererHost({ canvas, antialias: false, skyVisible: false,
            horizonFogColor: 0, horizonFogStart: 100, horizonFogEnd: 1000, resources: ledger.createAccount("lighting-test") });
        const geometry = new t.PlaneGeometry(2, 2), material = new t.MeshBasicMaterial({ fog: false });
        const plane = new t.Mesh(geometry, material); host.worldRoot.add(plane);
        const meshes = [plane], materials = [material], geometries = [geometry];
        const read = () => {
            host.render();
            const pixel = new Uint8Array(4), gl = host.renderer.getContext();
            gl.readPixels(48, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return Array.from(pixel).slice(0, 3);
        };
        try {
            host.resize(96, 96, 1);
            host.camera.near = .1; host.camera.far = 100;
            host.camera.position.set(0, 0, 3); host.camera.lookAt(0, 0, 0); host.camera.updateProjectionMatrix();
            const highlights = [.18, 1, 4].map(value => { material.color.setRGB(value, value, value); return read()[0]; });
            material.color.setRGB(.59, .59, .59); const reference = read();
            material.color.setRGB(.18, .18, .18);
            const overlayMaterial = new t.MeshBasicMaterial({ color: new t.Color(1, 1, 1), transparent: true, opacity: .5, fog: false });
            const overlay = new t.Mesh(geometry, overlayMaterial); overlay.position.z = .1;
            materials.push(overlayMaterial); meshes.push(overlay); host.worldRoot.add(overlay);
            const blended = read(); overlay.visible = false;
            const raw = new t.RawShaderMaterial({
                vertexShader: "precision highp float; attribute vec3 position; uniform mat4 modelViewMatrix, projectionMatrix; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
                fragmentShader: "precision highp float; void main(){gl_FragColor=vec4(.59,.59,.59,1.);}"
            });
            materials.push(raw); plane.material = raw; const rawOutput = read();
            plane.visible = false;
            const metal = new t.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: .4, fog: false });
            const sphereGeometry = new t.SphereGeometry(.8, 32, 24), sphere = new t.Mesh(sphereGeometry, metal);
            materials.push(metal); geometries.push(sphereGeometry); meshes.push(sphere); host.worldRoot.add(sphere);
            host.scene.children.filter((object: any) => object.isLight).forEach((light: any) => { light.visible = false; });
            const lit = read(); host.scene.environment = null; const dark = read();
            const before = ledger.stats;
            host.resize(192, 96, 1); const resized = ledger.stats;
            host.resize(96, 96, 1); const returned = ledger.stats;
            return { highlights, reference, blended, rawOutput, lit, dark, before, resized, returned };
        } finally {
            for (const mesh of meshes) host.worldRoot.remove(mesh);
            for (const item of materials) item.dispose(); for (const item of geometries) item.dispose();
            host.dispose(); canvas.remove();
            if (ledger.stats.reservations !== 0 || ledger.stats.gpuBytes !== 0) throw new Error("Host resources leaked");
        }
    });
    expect(errors).toEqual([]);
    expect(result.highlights[0]).toBeGreaterThan(70); expect(result.highlights[0]).toBeLessThan(150);
    expect(result.highlights[1]).toBeGreaterThan(result.highlights[0] + 50);
    expect(result.highlights[2]).toBeGreaterThan(result.highlights[1] + 15);
    for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(result.blended[channel] - result.reference[channel])).toBeLessThanOrEqual(3);
        expect(Math.abs(result.rawOutput[channel] - result.reference[channel])).toBeLessThanOrEqual(2);
    }
    expect(result.lit.reduce((a, b) => a + b, 0)).toBeGreaterThan(result.dark.reduce((a, b) => a + b, 0) + 50);
    expect(result.resized.gpuBytes - result.before.gpuBytes).toBe(96 * 96 * 12);
    expect(result.returned.gpuBytes).toBe(result.before.gpuBytes);
    expect(result.returned.reservations).toBe(result.before.reservations);
});

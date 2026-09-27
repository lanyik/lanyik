import { expect, test } from "@playwright/test";

test("near shadows darken raw full/fast terrain and Standard receivers, honor alpha and survive rebasing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error" || message.type() === "warning" && /INVALID_|OUT_OF_MEMORY|Shader Error/.test(message.text())) errors.push(message.text());
    });
    await page.goto("/?quality=gallery&shadows");
    await page.waitForFunction(() => (window as any).getWorldDiagnostics?.().status === "generated");
    const samples = await page.evaluate(async () => {
        const { hexWorld: map, HexMap: api, THREE: t } = window as any;
        const data: Record<number, Record<number, object>> = {};
        for (let x = 0; x < 18; x++) {
            data[x] = {};
            for (let y = 0; y < 18; y++) data[x][y] = { type: api.Land.land };
        }
        const results = [];
        for (const quality of ["full", "fast"]) {
            map.options.terrainShaderQuality = quality;
            await map.load({ data, w: 18, h: 18 });
            map.setCameraTargetTile(9, 9);
            const host = map.rendererHost, target = map.controls.target.clone(), camera = map.getCamera();
            target.y = map.worldSurface.getWorldHeight(target.x, target.z);
            camera.position.copy(target).add(new t.Vector3(-80, 280, 190)); camera.lookAt(target); camera.updateMatrixWorld();
            const sun = host.scene.children.find((object: any) => object.isDirectionalLight);
            const direction = sun.position.clone().sub(sun.target.position).normalize();
            const bytes = new Uint8Array([255, 255, 255, 255]);
            const texture = new t.DataTexture(bytes, 1, 1); texture.needsUpdate = true;
            const casterMaterial = new t.MeshStandardMaterial({ map: texture, alphaTest: .5, side: t.DoubleSide });
            const casterGeometry = new t.PlaneGeometry(50, 50);
            const movedPositions = casterGeometry.attributes.position.clone();
            for (let i = 0; i < movedPositions.count; i++) movedPositions.setX(i, movedPositions.getX(i) + 180);
            casterGeometry.morphAttributes.position = [movedPositions];
            const pose = new t.Mesh(casterGeometry), caster = new t.InstancedMesh(casterGeometry, casterMaterial, 1);
            caster.setMatrixAt(0, new t.Matrix4()); caster.setMorphAt(0, pose); caster.morphTexture.needsUpdate = true; caster.frustumCulled = false;
            caster.position.copy(target).addScaledVector(direction, 90); caster.lookAt(target);
            caster.castShadow = true; host.worldRoot.add(caster);
            const material = new t.MeshStandardMaterial({ color: 0x808080, roughness: 1 });
            const receiver = new t.Mesh(new t.PlaneGeometry(40, 40), material);
            receiver.rotation.x = -Math.PI / 2; receiver.position.copy(target); receiver.position.y += 1;
            receiver.receiveShadow = true; receiver.visible = false; host.worldRoot.add(receiver);
            const read = () => {
                host.prepareShadows(map.controls.target, map.renderOrigin); map.updateWorldChunkVisibility(); host.render(undefined, map.controls.target);
                const gl = host.renderer.getContext(), pixel = new Uint8Array(4);
                const point = receiver.position.clone().add(host.worldRoot.position).project(camera);
                gl.readPixels(Math.floor((point.x + 1) * gl.drawingBufferWidth / 2),
                    Math.floor((point.y + 1) * gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                return (pixel[0] + pixel[1] + pixel[2]) / 3;
            };
            try {
                caster.visible = false; const rawLit = read();
                caster.visible = true; const rawShade = read();
                receiver.visible = true; const standardShade = read();
                caster.visible = false; const standardLit = read();
                caster.visible = true; pose.morphTargetInfluences[0] = 1; caster.setMorphAt(0, pose); caster.morphTexture.needsUpdate = true;
                const animatedAway = read();
                pose.morphTargetInfluences[0] = 0; caster.setMorphAt(0, pose); caster.morphTexture.needsUpdate = true;
                caster.visible = true; bytes[3] = 0; texture.needsUpdate = true; const alphaCutout = read();
                bytes[3] = 255; texture.needsUpdate = true; const beforeRebase = read();
                const shift = new t.Vector3(4096, 0, -8192);
                host.worldRoot.position.sub(shift); camera.position.sub(shift); map.controls.target.sub(shift);
                map.renderOrigin.set(shift.x, shift.z); camera.updateMatrixWorld(); map.chunkScheduler.invalidateScene();
                const afterRebase = read();
                results.push({ quality, rawLit, rawShade, standardLit, standardShade, animatedAway, alphaCutout, beforeRebase, afterRebase });
                host.worldRoot.position.set(0, 0, 0); map.renderOrigin.set(0, 0);
            } finally {
                caster.removeFromParent(); receiver.removeFromParent(); caster.geometry.dispose(); receiver.geometry.dispose();
                casterMaterial.dispose(); material.dispose(); texture.dispose();
                caster.dispose();
            }
        }
        return results;
    });
    expect(errors).toEqual([]);
    for (const sample of samples) {
        expect(sample.rawShade, JSON.stringify(sample)).toBeLessThan(sample.rawLit * .85);
        expect(sample.standardLit - sample.standardShade, JSON.stringify(sample)).toBeGreaterThan(10);
        expect(sample.rawShade).toBeGreaterThan(12); expect(sample.standardShade).toBeGreaterThan(12);
        expect(Math.abs(sample.alphaCutout - sample.standardLit)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.animatedAway - sample.standardLit)).toBeLessThanOrEqual(2);
        expect(Math.abs(sample.afterRebase - sample.beforeRebase)).toBeLessThanOrEqual(2);
    }
});

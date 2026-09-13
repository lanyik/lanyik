import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BufferAttribute, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import sharp from "sharp";
import { sourceReader } from "./actor-source.mjs";

const up = new Vector3(0, 1, 0);
const vertex = new Vector3();

function assembly() {
    const parts = [];
    const add = (geometry, color, glowing = false) => {
        const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
        if (mesh !== geometry) geometry.dispose();
        const count = mesh.attributes.position.count, colors = new Float32Array(count * 3), tint = new Color(color);
        const uv = mesh.attributes.uv;
        for (let i = 0; i < count; i++) {
            tint.toArray(colors, i * 3);
            // Left atlas half is the body; right half is the emissive eye/core.
            uv.setXY(i, glowing ? .75 : .01 + uv.getX(i) * .48, glowing ? .5 : .01 + uv.getY(i) * .98);
        }
        mesh.setAttribute("color", new Float32BufferAttribute(colors, 3));
        mesh.setAttribute("partId", new Float32BufferAttribute(new Float32Array(count).fill(parts.length), 1));
        parts.push(mesh);
    };
    const ellipsoid = (position, scale, color, glowing = false) => {
        const geometry = new SphereGeometry(1, 20, 12); geometry.scale(...scale).translate(...position); add(geometry, color, glowing);
    };
    const limb = (from, to, radius, tip, color) => {
        const start = new Vector3(...from), end = new Vector3(...to), direction = end.clone().sub(start);
        const geometry = new CylinderGeometry(tip, radius, direction.length(), 8, 1);
        geometry.applyQuaternion(new Quaternion().setFromUnitVectors(up, direction.normalize()));
        geometry.translate(...start.add(end).multiplyScalar(.5).toArray()); add(geometry, color);
    };
    const rock = (position, scale, seed, color, glowing = false) => {
        const geometry = new IcosahedronGeometry(1, 2), positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);
            const relief = 1 + .12 * Math.sin(vertex.x * 7 + seed) * Math.sin(vertex.y * 9 - seed) * Math.cos(vertex.z * 8 + seed);
            vertex.multiplyScalar(relief); positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        geometry.computeVertexNormals(); geometry.scale(...scale).translate(...position); add(geometry, color, glowing);
    };
    return { ellipsoid, limb, rock, finish: () => { const result = mergeGeometries(parts); for (const part of parts) part.dispose(); return result; } };
}

function spiderPose(action, phase) {
    const shape = assembly(), wave = Math.sin(phase * Math.PI * 2);
    const strike = action === "attack" ? Math.sin(Math.PI * phase) : 0;
    const breathing = action === "idle" ? wave * .006 : 0;
    const bodyY = .38 + breathing + (action === "move" ? Math.abs(wave) * .018 : strike * .07);
    shape.ellipsoid([0, bodyY, -.23], [.24, .21 + breathing, .35], "#8a9ca3");
    shape.ellipsoid([0, bodyY, .13 + strike * .08], [.21, .15, .23], "#bdc6bf");
    // Overlapping dorsal plates, fang pair and six eyes define a readable predator.
    for (let plate = 0; plate < 3; plate++) shape.ellipsoid([0, bodyY + .13, -.14 - plate * .13], [.2 - plate * .035, .08, .09], "#51666d");
    for (const side of [-1, 1]) {
        for (let eye = 0; eye < 3; eye++) shape.ellipsoid([side * (.055 + eye * .045), bodyY + .065 + eye * .013, .323 - eye * .03 + strike * .08], [.018, .022, .015], "#ffe3ac", true);
        shape.limb([side * .075, bodyY - .06, .3 + strike * .08], [side * .11, .13, .43 + strike * .16], .045, .006, "#dad0ae");
        for (let leg = 0; leg < 4; leg++) {
            const step = action === "move" ? Math.sin(phase * Math.PI * 2 + leg * Math.PI + (side === 1 ? Math.PI : 0)) : 0;
            const z = .24 - leg * .17, spread = .47 + Math.sin((leg + .5) / 4 * Math.PI) * .13;
            const lift = action === "attack" && leg === 0 ? strike * .23 : 0;
            const hip = [side * .14, bodyY, z * .65];
            const knee = [side * spread, .42 + lift, z * 1.5 + step * .055];
            const ankle = [side * (spread + .075), .13 + Math.max(0, step) * .075 + lift, z * 2 + step * .09];
            const foot = [side * (spread + .12), .02 + Math.max(0, step) * .075 + lift, z * 2 + .06 + step * .12];
            shape.limb(hip, knee, .045, .032, "#6c838d");
            shape.limb(knee, ankle, .035, .018, "#abc0c2");
            shape.limb(ankle, foot, .02, .002, "#d0c9ad");
            shape.ellipsoid(knee, [.047, .045, .045], "#394b54");
        }
    }
    return shape.finish();
}

function golemPose(action, phase) {
    const shape = assembly(), wave = Math.sin(phase * Math.PI * 2);
    const stride = action === "move" ? wave : 0;
    const strike = action === "attack" ? Math.sin(phase * Math.PI) : 0;
    const breathe = action === "idle" ? wave * .009 : 0;
    const torso = .92 + breathe + Math.abs(stride) * .025;
    shape.rock([0, torso, 0], [.32, .35, .2], 2, "#788281");
    shape.rock([0, .59, 0], [.22, .18, .17], 3, "#535f61");
    shape.rock([0, 1.32 + breathe, .015], [.155, .17, .145], 7, "#aeb6ac");
    shape.rock([0, torso + .03, .197], [.069, .12, .025], 5, "#ffd29d", true);
    for (const side of [-1, 1]) {
        shape.ellipsoid([side * .061, 1.35 + breathe, .145], [.032, .012, .013], "#fff1c4", true);
        const step = stride * side, footZ = step * .13, footY = .10 + Math.max(0, step) * .065;
        shape.rock([side * .16, .43, footZ * .4], [.13, .22, .13], 8 + side, "#89938a");
        shape.rock([side * .17, .23 + Math.max(0, step) * .04, footZ * .8], [.115, .17, .12], 12 + side, "#707f80");
        shape.rock([side * .18, footY, footZ + .065], [.14, .1, .21], 15 + side, "#b1b1a0");
        shape.rock([side * .37, torso + .13, 0], [.22, .2, .19], 20 + side, "#a0a89c");
        shape.rock([side * (.43 - strike * .06), torso - .12 + strike * .22, -step * .075 + strike * .16], [.125, .22, .125], 25 + side, "#677878");
        shape.rock([side * (.45 - strike * .1), torso - .38 + strike * .22, -step * .13 + strike * .42], [.17, .21, .17], 30 + side, "#a4ada3");
    }
    return shape.finish();
}

export async function prepareSurvivorCreatures(environment, output) {
    const read = await sourceReader(environment);
    const descriptors = [
        { name: "RiftSpider", pose: spiderPose, cycle: .72, height: .6 },
        { name: "StoneSentinel", pose: golemPose, cycle: 1.5, height: 1.5, texture: "rocky_terrain", saturation: .4, brightness: 1.15 }
    ];
    const manifest = JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"));
    for (const descriptor of descriptors) {
        let geometry = descriptor.pose("idle", 0);
        geometry.morphAttributes.position = []; geometry.morphAttributes.normal = [];
        for (const [action, frames] of [["move", 8], ["attack", 8], ["idle", 4]]) for (let frame = 0; frame < frames; frame++) {
            const target = descriptor.pose(action, frame / (action === "attack" ? frames - 1 : frames));
            if (target.attributes.position.count !== geometry.attributes.position.count) throw new Error(`${descriptor.name}: unstable pose topology`);
            geometry.morphAttributes.position.push(new BufferAttribute(new Float32Array(target.attributes.position.array), 3));
            geometry.morphAttributes.normal.push(new BufferAttribute(new Float32Array(target.attributes.normal.array), 3));
            target.dispose();
        }
        // Weld within each independently moving part and remap every pose with
        // the same indices. The temporary part identity prevents joined limbs.
        const compact = mergeVertices(geometry, 1e-5); geometry.dispose(); geometry = compact;
        geometry.deleteAttribute("partId");
        const material = new MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 1, metalness: .15, emissive: 0xffffff, emissiveIntensity: 1.6 });
        const mesh = new Mesh(geometry, material); mesh.name = descriptor.name;
        mesh.userData = { cycle: descriptor.cycle, idleCycle: 3, frames: 20, idle: "Breathing", attack: "Strike", height: descriptor.height };
        const binary = await new GLTFExporter().parseAsync(mesh, { binary: true });
        await writeFile(resolve(output, `${descriptor.name}.glb`), Buffer.from(binary));
        let bytes = binary.byteLength;
        for (const channel of ["color", "normal", "orm", "emissive"]) {
            let body;
            if (!descriptor.texture) {
                const pixels = Buffer.alloc(256 * 512 * 3);
                for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
                    const grain = Math.sin(x * .47 + Math.sin(y * .17)) * Math.cos(y * .53);
                    const bands = Math.pow(Math.abs(Math.sin(x * .061 + Math.sin(y * .018))), 12);
                    const value = 62 + grain * 4 - bands * 14;
                    const rgb = channel === "color" ? [value * .78, value * .96, value * 1.1]
                        : channel === "normal" ? [128 + grain * 8, 128 + Math.cos(y * .53) * 7, 254]
                        : channel === "orm" ? [255, 95 + bands * 35, 255] : [0, 0, 0];
                    for (let c = 0; c < 3; c++) pixels[(y * 256 + x) * 3 + c] = Math.round(rgb[c]);
                }
                body = sharp(pixels, { raw: { width: 256, height: 512, channels: 3 } });
            }
            if (descriptor.texture && channel === "color") body = sharp(await read(`${descriptor.texture}_diff_1k.jpg`)).greyscale().tint("#b9c4ca").modulate({ brightness: descriptor.brightness });
            if (descriptor.texture && channel === "normal") body = sharp(await read(`${descriptor.texture}_nor_gl_1k.jpg`));
            if (descriptor.texture && channel === "orm") {
                const rough = await sharp(await read(`${descriptor.texture}_rough_1k.jpg`)).resize(256, 512).greyscale().raw().toBuffer(), pixels = Buffer.alloc(256 * 512 * 3);
                for (let i = 0; i < rough.length; i++) { pixels[i * 3] = 255; pixels[i * 3 + 1] = rough[i]; pixels[i * 3 + 2] = 255; }
                body = sharp(pixels, { raw: { width: 256, height: 512, channels: 3 } });
            }
            if (descriptor.texture && channel === "emissive") body = sharp({ create: { width: 256, height: 512, channels: 3, background: "#000" } });
            const background = { color: "#ffffff", normal: "#8080ff", orm: "#ffb000", emissive: "#eeb777" }[channel];
            const image = await sharp({ create: { width: 512, height: 512, channels: 3, background } })
                .composite([{ input: await body.resize(256, 512).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
            await writeFile(resolve(output, `${descriptor.name}-${channel}.png`), image); bytes += image.length;
        }
        manifest.actors.push({ name: descriptor.name, ...mesh.userData, vertices: geometry.attributes.position.count, triangles: geometry.index.count / 3, primitives: 1, atlasSize: 512, bytes });
        console.log(`${descriptor.name}: ${geometry.index.count / 3} triangles, 20 poses, ${Math.round(bytes / 1024)} KiB`);
        geometry.dispose(); material.dispose();
    }
    await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

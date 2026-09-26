import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { MeshoptSimplifier } from "meshoptimizer";
import { Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { actorPoser, disposeActorSource, loadActorSource, sourceReader } from "./actor-source.mjs";

const FRAMES = 8;
const IDLE_FRAMES = 4;
const ACTORS = [
    { name: "Ranger", model: "ranger/Male_Ranger.gltf", height: 1.6, idle: "Idle_Loop", walk: "Jog_Fwd_Loop", head: true },
    { name: "Puglin", model: "bestiary/Puglin.glb", height: 1, idle: "Idle_Loop", walk: "Walk_Loop", attack: "Punch_Cross", color: "bestiary/T_Puglin_BaseColor_2.png" },
    { name: "Puglin_Brute", model: "bestiary/Puglin.glb", height: 1, idle: "Idle_Loop", walk: "Walk_Loop", attack: "Sword_Attack" },
    { name: "Imp_Shaman", model: "bestiary/Imp.glb", height: 1.25, idle: "Idle_Loop", walk: "Jog_Fwd_Loop", attack: "Spell_Simple_Shoot", socket: "hand_l", color: "bestiary/T_Imp_BaseColor_3.png", omit: ["Imp_Mace"] }
];
const HEAD_IMAGES = { "T_Hair_1_Normal_png.png": "T_Hair_1_Normal.png", "T_Eye_Normal_png.png": "T_Eye_Normal.png" };
class NodeFileReader {
    async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
    async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`; this.onloadend?.(); }
}

/** Compact the selected triangles, so the unseen body under the outfit never reaches the GPU. */
function actorParts(rigs, descriptor) {
    const parts = [], materialSlots = new Map();
    for (let rigIndex = 0; rigIndex < rigs.length; rigIndex++) {
        const rig = rigs[rigIndex];
        const neck = rigIndex === 1 ? rig.scene.getObjectByName("neck_01").getWorldPosition(new Vector3()).y + .025 : undefined;
        for (const mesh of rig.meshes) {
            if (descriptor.omit?.includes(mesh.name)) continue;
            const geometry = mesh.geometry;
            const attributes = geometry.attributes;
            const originalIndices = new Uint32Array(geometry.index?.array ?? Array.from({ length: attributes.position.count }, (_, i) => i));
            // Preserve texture, shading and skin-weight changes while reducing tiny surface triangles.
            const simplificationAttributes = new Float32Array(attributes.position.count * 13);
            for (let i = 0; i < attributes.position.count; i++) {
                for (let c = 0; c < 3; c++) simplificationAttributes[i * 13 + c] = attributes.normal.getComponent(i, c);
                for (let c = 0; c < 2; c++) simplificationAttributes[i * 13 + 3 + c] = attributes.uv.getComponent(i, c);
                for (let c = 0; c < 4; c++) {
                    simplificationAttributes[i * 13 + 5 + c] = attributes.skinWeight.getComponent(i, c);
                    simplificationAttributes[i * 13 + 9 + c] = attributes.skinIndex.getComponent(i, c) / mesh.skeleton.bones.length;
                }
            }
            const [simplified] = MeshoptSimplifier.simplifyWithAttributes(originalIndices, attributes.position.array, 3,
                simplificationAttributes, 13, [.25, .25, .25, 1, 1, .25, .25, .25, .25, .5, .5, .5, .5], null,
                Math.floor(originalIndices.length * .4 / 3) * 3, .008);
            const selected = [], remap = new Map(), indices = [], point = new Vector3();
            for (let i = 0; i < simplified.length; i += 3) {
                const triangle = [simplified[i], simplified[i + 1], simplified[i + 2]];
                if (neck !== undefined && triangle.some(index => point.fromBufferAttribute(geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld).y < neck)) continue;
                for (const index of triangle) {
                    if (!remap.has(index)) { remap.set(index, selected.length); selected.push(index); }
                    indices.push(remap.get(index));
                }
            }
            if (!indices.length) continue;
            if (!materialSlots.has(mesh.material)) materialSlots.set(mesh.material, {
                slot: materialSlots.size, textures: rig.materials.get(mesh.material.name)
            });
            parts.push({ mesh, selected, indices, slot: materialSlots.get(mesh.material).slot });
        }
    }
    if (!parts.length) throw new Error(`${descriptor.name}: empty actor`);
    return { parts, materials: [...materialSlots.values()] };
}

async function bakeAtlases(read, output, descriptor, materials) {
    const size = descriptor.head ? 1024 : 512, columns = Math.ceil(Math.sqrt(materials.length));
    const cell = Math.floor(size / columns), gutter = 4, inner = cell - gutter * 2;
    let bytes = 0;
    for (const channel of ["color", "normal", "orm", "emissive"]) {
        const tiles = [];
        for (const { slot, textures } of materials) {
            let input = channel === "color" && descriptor.color ? await read(descriptor.color) : textures[channel];
            const defaults = { color: [255, 255, 255], normal: [128, 128, 255], orm: [255, 255, 255], emissive: [0, 0, 0] };
            const [r, g, b] = defaults[channel];
            let pipeline = input ? sharp(input).resize(inner, inner, { fit: "fill" }) : sharp({ create: { width: inner, height: inner, channels: 3, background: { r, g, b } } });
            if (channel === "orm") pipeline = pipeline.pipelineColourspace("srgb").removeAlpha().linear([1, textures.roughness, textures.metalness], [0, 0, 0]);
            if (channel === "emissive") pipeline = pipeline.removeAlpha().linear(textures.emission / 2, 0);
            input = await pipeline.extend({ top: gutter, bottom: gutter, left: gutter, right: gutter, extendWith: "copy" }).png().toBuffer();
            tiles.push({ input, left: slot % columns * cell, top: Math.floor(slot / columns) * cell });
        }
        const atlas = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite(tiles).png().toBuffer();
        await writeFile(resolve(output, `${descriptor.name}-${channel}.png`), atlas); bytes += atlas.length;
    }
    return { size, columns, cell, gutter, inner, bytes };
}

/** Bake authored skin normals as well as positions, preserving smooth faces across UV seams. */
function capture(parts) {
    const positions = [], normals = [], point = new Vector3(), normal = new Vector3();
    const skin = new Matrix4(), world = new Matrix4(), normalMatrix = new Matrix3();
    for (const { mesh, selected } of parts) {
        mesh.skeleton.update();
        const attributes = mesh.geometry.attributes;
        for (const index of selected) {
            mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld); positions.push(point.x, point.y, point.z);
            skin.elements.fill(0);
            for (let component = 0; component < 4; component++) {
                const weight = attributes.skinWeight.getComponent(index, component);
                const offset = attributes.skinIndex.getComponent(index, component) * 16;
                for (let j = 0; j < 16; j++) skin.elements[j] += mesh.skeleton.boneMatrices[offset + j] * weight;
            }
            world.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(skin).multiply(mesh.bindMatrix);
            normalMatrix.getNormalMatrix(world);
            normal.fromBufferAttribute(attributes.normal, index).applyMatrix3(normalMatrix).normalize(); normals.push(normal.x, normal.y, normal.z);
        }
    }
    if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite)) throw new Error("Non-finite baked actor pose");
    return { positions, normals };
}

/** Offline rigs become one PBR primitive with separate locomotion, attack and relaxed idle clips. */
export async function prepareSurvivorActors(source, output, socketOutput, heroOutput) {
    globalThis.FileReader = NodeFileReader;
    await MeshoptSimplifier.ready;
    await mkdir(output, { recursive: true });
    const read = await sourceReader(source);
    const animation = await loadActorSource(read, "animation/UAL1_Standard.glb");
    const manifest = { frames: FRAMES, idleFrames: IDLE_FRAMES, actors: [] };
    try {
        for (const descriptor of ACTORS) {
            const rigs = [await loadActorSource(read, descriptor.model)];
            let poser;
            try {
                if (descriptor.head) rigs.push(await loadActorSource(read, "head/Superhero_Male_FullBody.gltf", HEAD_IMAGES));
                const { parts, materials } = actorParts(rigs, descriptor);
                const atlas = await bakeAtlases(read, output, descriptor, materials);
                poser = actorPoser(animation, rigs);
                poser.pose(descriptor.idle, 0);
                const base = capture(parts), bounds = new Box3().setFromArray(base.positions);
                const scale = descriptor.height / (bounds.max.y - bounds.min.y);
                if (!Number.isFinite(scale) || scale <= 0) throw new Error(`${descriptor.name}: invalid pose bounds`);
                const normalize = values => values.map((value, i) => (value - (i % 3 === 1 ? bounds.min.y : 0)) * scale);
                const castingHand = [], socket = descriptor.socket && rigs[0].scene.getObjectByName(descriptor.socket);
                if (descriptor.socket && !socket?.isBone) throw new Error(`${descriptor.name}: missing casting bone`);
                const captureSocket = () => { if (socket) castingHand.push(...normalize(socket.getWorldPosition(new Vector3()).toArray())); };
                const geometry = new BufferGeometry(), uv = [], indices = [];
                let offset = 0;
                for (const part of parts) {
                    const attr = part.mesh.geometry.attributes.uv;
                    for (const index of part.selected) uv.push(
                        (part.slot % atlas.columns * atlas.cell + atlas.gutter + attr.getX(index) * atlas.inner) / atlas.size,
                        (Math.floor(part.slot / atlas.columns) * atlas.cell + atlas.gutter + attr.getY(index) * atlas.inner) / atlas.size);
                    for (const index of part.indices) indices.push(offset + index);
                    offset += part.selected.length;
                }
                geometry.setIndex(indices); geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
                geometry.setAttribute("position", new Float32BufferAttribute(normalize(base.positions), 3));
                geometry.setAttribute("normal", new Float32BufferAttribute(base.normals, 3));
                geometry.morphAttributes.position = []; geometry.morphAttributes.normal = [];
                const walk = animation.animations.find(clip => clip.name === descriptor.walk);
                if (!walk) throw new Error(`${descriptor.name}: missing movement ${descriptor.walk}`);
                for (let frame = 0; frame < FRAMES; frame++) {
                    poser.pose(descriptor.walk, walk.duration * frame / FRAMES);
                    captureSocket();
                    const target = capture(parts);
                    geometry.morphAttributes.position.push(new Float32BufferAttribute(normalize(target.positions), 3));
                    geometry.morphAttributes.normal.push(new Float32BufferAttribute(target.normals, 3));
                }
                if (descriptor.attack) {
                    const attack = animation.animations.find(clip => clip.name === descriptor.attack);
                    if (!attack) throw new Error(`${descriptor.name}: missing attack ${descriptor.attack}`);
                    for (let frame = 0; frame < FRAMES; frame++) {
                        const progress = frame / (FRAMES - 1);
                        if (descriptor.socket) {
                            const name = progress < .43 ? "Spell_Simple_Enter" : progress < .64 ? descriptor.attack : "Spell_Simple_Exit";
                            const phase = progress < .43 ? progress / .43 : progress < .64 ? (progress - .43) / .21 : (progress - .64) / .36;
                            const clip = animation.animations.find(candidate => candidate.name === name);
                            if (!clip) throw new Error(`Missing casting sequence clip ${name}`);
                            poser.pose(name, phase * clip.duration);
                        } else poser.pose(descriptor.attack, attack.duration * progress);
                        captureSocket();
                        const target = capture(parts);
                        geometry.morphAttributes.position.push(new Float32BufferAttribute(normalize(target.positions), 3));
                        geometry.morphAttributes.normal.push(new Float32BufferAttribute(target.normals, 3));
                    }
                }
                const heroClips = {};
                if (descriptor.head) {
                    const sequences = {
                        attack: ["Spell_Simple_Shoot", 6, false], windup: ["Spell_Simple_Enter", 4, false],
                        channel: ["Spell_Simple_Idle_Loop", 4, true], recovery: ["Spell_Simple_Exit", 4, false],
                        hurt: ["Hit_Chest", 4, false], death: ["Death01", 8, false]
                    };
                    heroClips.move = { offset: 0, count: FRAMES, duration: walk.duration, loop: true };
                    for (const [name, [sourceClip, count, loop]] of Object.entries(sequences)) {
                        const clip = animation.animations.find(candidate => candidate.name === sourceClip);
                        if (!clip) throw new Error(`Ranger: missing ${sourceClip}`);
                        heroClips[name] = { offset: geometry.morphAttributes.position.length, count, duration: clip.duration, loop };
                        for (let frame = 0; frame < count; frame++) {
                            poser.pose(sourceClip, clip.duration * frame / (loop ? count : count - 1));
                            const target = capture(parts);
                            geometry.morphAttributes.position.push(new Float32BufferAttribute(normalize(target.positions), 3));
                            geometry.morphAttributes.normal.push(new Float32BufferAttribute(target.normals, 3));
                        }
                    }
                }
                const idle = animation.animations.find(clip => clip.name === descriptor.idle);
                if (!idle) throw new Error(`${descriptor.name}: missing idle ${descriptor.idle}`);
                if (descriptor.head) heroClips.idle = { offset: geometry.morphAttributes.position.length, count: IDLE_FRAMES, duration: idle.duration, loop: true };
                for (let frame = 0; frame < IDLE_FRAMES; frame++) {
                    poser.pose(descriptor.idle, idle.duration * frame / IDLE_FRAMES);
                    captureSocket();
                    const target = capture(parts);
                    geometry.morphAttributes.position.push(new Float32BufferAttribute(normalize(target.positions), 3));
                    geometry.morphAttributes.normal.push(new Float32BufferAttribute(target.normals, 3));
                }
                const material = new MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 1, emissive: 0xffffff, emissiveIntensity: 2, side: DoubleSide });
                material.name = descriptor.name;
                const mesh = new Mesh(geometry, material); mesh.name = descriptor.name;
                // Gameplay supplies phase from the real clip duration, independently for each actor type.
                const frames = geometry.morphAttributes.position.length;
                mesh.userData = { cycle: walk.duration, idleCycle: idle.duration, frames, idle: descriptor.idle, attack: descriptor.attack, height: descriptor.height };
                if (descriptor.head) {
                    mesh.userData.heroClips = heroClips;
                    await writeFile(heroOutput, `// Generated by scripts/lib/survivor-actors.mjs; offsets and durations match Ranger.glb.\nexport const HERO_CLIPS = ${JSON.stringify(heroClips, null, 4)} as const;\nexport const HERO_POSES = ${frames};\n`);
                }
                if (socket) {
                    mesh.userData.castingHand = castingHand;
                    const release = [0, 1, 2].map(axis => (castingHand[(FRAMES + 3) * 3 + axis] + castingHand[(FRAMES + 4) * 3 + axis]) / 2);
                    await writeFile(socketOutput,
                        `// Generated by scripts/lib/survivor-actors.mjs; same normalized hand as the baked release pose.\nexport const SHAMAN_CAST_SOCKET = ${JSON.stringify(release)} as const;\n`);
                }
                const exported = await new GLTFExporter().parseAsync(mesh, { binary: true });
                await writeFile(resolve(output, `${descriptor.name}.glb`), Buffer.from(exported));
                manifest.actors.push({ name: descriptor.name, frames, idle: descriptor.idle, idleCycle: idle.duration, attack: descriptor.attack, cycle: walk.duration, height: descriptor.height,
                    ...(descriptor.head ? { heroClips } : {}), vertices: offset, triangles: indices.length / 3, primitives: 1, atlasSize: atlas.size, bytes: exported.byteLength + atlas.bytes });
                geometry.dispose(); material.dispose();
            } finally { poser?.dispose(); for (const rig of rigs) disposeActorSource(rig); }
        }
    } finally { disposeActorSource(animation); }
    await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Prepared ${ACTORS.length} animated actors (${Math.round(manifest.actors.reduce((sum, actor) => sum + actor.bytes, 0) / 1024)} KiB)`);
}

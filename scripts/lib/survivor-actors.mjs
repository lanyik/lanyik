import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { AnimationMixer, Box3, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const ACTORS = ["Rogue_Hooded", "Skeleton_Minion", "Skeleton_Rogue", "Skeleton_Warrior", "Skeleton_Mage"];
const FRAMES = 8;
class NodeFileReader {
    async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
    async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`; this.onloadend?.(); }
}

function withoutTextures(bytes) {
    if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error("Expected GLB 2.0 actor");
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const bin = bytes.subarray(28 + jsonLength);
    if (json.images.length !== 1) throw new Error("Actor must have one embedded atlas");
    const view = json.bufferViews[json.images[0].bufferView];
    const atlas = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    delete json.images; delete json.textures; delete json.samplers;
    for (const material of json.materials) delete material.pbrMetallicRoughness.baseColorTexture;
    const encoded = Buffer.from(JSON.stringify(json));
    const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32); encoded.copy(padded);
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + padded.length + bin.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4);
    return { buffer: Buffer.concat([header, padded, binHeader, bin]), atlas };
}

/** Bake rigged source meshes once at build time. Runtime actors share eight GPU morph poses. */
export async function prepareSurvivorActors(source, output) {
    globalThis.FileReader = NodeFileReader;
    await mkdir(output, { recursive: true });
    const sources = JSON.parse(await readFile(resolve(source, "sources.json"), "utf8"));
    const manifest = { frames: FRAMES, actors: [] };
    for (const name of ACTORS) {
        const raw = await readFile(resolve(source, `${name}.glb`));
        const digest = createHash("sha256").update(raw).digest("hex");
        if (sources.find(entry => entry.file === `${name}.glb`)?.sha256 !== digest) throw new Error(`${name}: source asset hash mismatch`);
        const { buffer, atlas } = withoutTextures(raw);
        const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
        const meshes = []; gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
        const mixer = new AnimationMixer(gltf.scene);
        const idle = gltf.animations.find(clip => clip.name === "Idle");
        const walk = gltf.animations.find(clip => clip.name === "Running_A");
        if (!idle || !walk || meshes.length === 0) throw new Error(`${name}: missing required poses or meshes`);
        const uv = [], indices = [], groups = []; let offset = 0;
        const sourceMaterials = [...new Set(meshes.map(mesh => mesh.material))];
        for (const mesh of meshes) {
            const attr = mesh.geometry.attributes.uv;
            if (!attr) throw new Error(`${name}: missing atlas coordinates`);
            for (let i = 0; i < attr.count; i++) uv.push(attr.getX(i), attr.getY(i));
            const index = mesh.geometry.index;
            groups.push({ start: indices.length, count: index?.count ?? attr.count, material: sourceMaterials.indexOf(mesh.material) });
            for (let i = 0; i < (index?.count ?? attr.count); i++) indices.push(offset + (index ? index.getX(i) : i));
            offset += attr.count;
        }
        const point = new Vector3();
        const pose = (clip, time) => {
            mixer.stopAllAction(); mixer.clipAction(clip).reset().play(); mixer.setTime(time);
            gltf.scene.updateMatrixWorld(true);
            const vertices = [];
            for (const mesh of meshes) {
                if (mesh.isSkinnedMesh) mesh.skeleton.update();
                for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
                    vertices.push(point.x, point.y, point.z);
                }
            }
            return vertices;
        };
        const base = pose(idle, 0);
        const bounds = new Box3().setFromArray(base);
        const scale = 1.25 / (bounds.max.y - bounds.min.y);
        const normalize = vertices => vertices.map((value, index) => (value - (index % 3 === 1 ? bounds.min.y : 0)) * scale);
        const geometry = new BufferGeometry();
        geometry.setIndex(indices); geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        geometry.setAttribute("position", new Float32BufferAttribute(normalize(base), 3)); geometry.computeVertexNormals();
        geometry.morphAttributes.position = []; geometry.morphAttributes.normal = [];
        for (let frame = 0; frame < FRAMES; frame++) {
            const target = new BufferGeometry(); target.setIndex(indices);
            target.setAttribute("position", new Float32BufferAttribute(normalize(pose(walk, walk.duration * frame / FRAMES)), 3)); target.computeVertexNormals();
            geometry.morphAttributes.position.push(target.attributes.position);
            geometry.morphAttributes.normal.push(target.attributes.normal);
        }
        for (const group of groups) geometry.addGroup(group.start, group.count, group.material);
        const material = sourceMaterials.map(source => { const material = new MeshStandardMaterial({ color: source.color, emissive: source.emissive, side: source.side, roughness: .9 }); material.name = source.name; return material; });
        const mesh = new Mesh(geometry, material); mesh.name = name;
        const exported = await new GLTFExporter().parseAsync(mesh, { binary: true });
        await writeFile(resolve(output, `${name}.glb`), Buffer.from(exported));
        await writeFile(resolve(output, `${name}.png`), atlas);
        manifest.actors.push({ name, frames: FRAMES, cycle: walk.duration, vertices: offset, triangles: indices.length / 3,
            sourceSha256: digest, bytes: exported.byteLength + atlas.length });
        geometry.dispose(); for (const entry of material) entry.dispose(); mixer.uncacheRoot(gltf.scene);
        for (const sourceMesh of meshes) { sourceMesh.geometry.dispose(); sourceMesh.material.dispose(); }
    }
    await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Prepared ${ACTORS.length} animated actors (${Math.round(manifest.actors.reduce((sum, actor) => sum + actor.bytes, 0) / 1024)} KiB)`);
}

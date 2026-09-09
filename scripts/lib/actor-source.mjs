import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** All model, texture and license reads must match the checked-in source inventory. */
export async function sourceReader(directory) {
    const entries = JSON.parse(await readFile(resolve(directory, "sources.json"), "utf8"));
    const inventory = new Map(entries.map(entry => [entry.file, entry]));
    return async file => {
        const entry = inventory.get(file);
        if (!entry) throw new Error(`Unregistered actor source: ${file}`);
        const bytes = await readFile(resolve(directory, file));
        if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
            throw new Error(`${file}: source asset hash mismatch`);
        }
        return bytes;
    };
}

/** Node loads geometry and rigs; sharp handles image decoding separately during baking. */
export async function loadActorSource(read, file, imageAliases = {}) {
    const bytes = await read(file);
    let json, bin;
    if (file.endsWith(".glb")) {
        if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error(`${file}: expected GLB 2.0`);
        const length = bytes.readUInt32LE(12);
        json = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
        bin = bytes.subarray(28 + length);
    } else {
        json = JSON.parse(bytes.toString("utf8"));
        bin = await read(`${dirname(file)}/${json.buffers[0].uri}`);
    }
    if (json.buffers.length !== 1) throw new Error(`${file}: expected one source buffer`);
    const images = await Promise.all((json.images ?? []).map(async img => {
        if (img.uri) return read(`${dirname(file)}/${imageAliases[img.uri] ?? img.uri}`);
        const view = json.bufferViews[img.bufferView];
        return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    }));
    const materials = new Map((json.materials ?? []).map(material => {
        const texture = info => info ? images[json.textures[info.index].source] : undefined;
        const pbr = material.pbrMetallicRoughness ?? {};
        return [material.name, {
            color: texture(pbr.baseColorTexture), normal: texture(material.normalTexture), orm: texture(pbr.metallicRoughnessTexture),
            emissive: texture(material.emissiveTexture), metalness: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
            emission: material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1
        }];
    }));
    delete json.images; delete json.textures; delete json.samplers;
    for (const material of json.materials ?? []) {
        delete material.normalTexture; delete material.emissiveTexture; delete material.occlusionTexture;
        delete material.pbrMetallicRoughness?.baseColorTexture;
        delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
    }
    delete json.buffers[0].uri;
    const encoded = Buffer.from(JSON.stringify(json));
    const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32); encoded.copy(padded);
    const binary = Buffer.alloc(Math.ceil(bin.length / 4) * 4); bin.copy(binary);
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
    const packed = Buffer.concat([header, padded, binHeader, binary]);
    const gltf = await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength), "");
    const meshes = [];
    gltf.scene.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
    if (!meshes.length) throw new Error(`${file}: missing skinned meshes`);
    gltf.scene.updateMatrixWorld(true);
    return { ...gltf, meshes, materials };
}

function restBones(scene) {
    const bones = new Map();
    scene.updateMatrixWorld(true);
    scene.traverse(bone => {
        if (bone.isBone) bones.set(bone.name, { bone, position: bone.position.clone(),
            worldPosition: bone.getWorldPosition(new Vector3()), rotation: bone.getWorldQuaternion(new Quaternion()).normalize() });
    });
    return bones;
}

/** Retarget world-space rotation deltas, retaining each creature's original limb lengths. */
export function actorPoser(animation, targets) {
    const skeletons = new Set(animation.meshes.map(mesh => mesh.skeleton));
    for (const skeleton of skeletons) skeleton.pose();
    const source = restBones(animation.scene);
    const targetRests = targets.map(target => restBones(target.scene));
    for (const rest of targetRests) for (const name of rest.keys()) {
        if (!source.has(name)) throw new Error(`Animation rig is missing bone ${name}`);
    }
    const mixer = new AnimationMixer(animation.scene);
    const rotation = new Quaternion(), parentRotation = new Quaternion(), position = new Vector3();
    return {
        pose(name, time) {
            const clip = animation.animations.find(clip => clip.name === name);
            if (!clip) throw new Error(`Missing animation ${name}`);
            mixer.stopAllAction();
            const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play(); mixer.setTime(time);
            animation.scene.updateMatrixWorld(true);
            for (const rest of targetRests) {
                const hip = rest.get("pelvis"), sourceHip = source.get("pelvis");
                const heightRatio = hip.worldPosition.y / sourceHip.worldPosition.y;
                // Scene traversal is parent-first, so parents already contain the new pose.
                for (const [name, target] of rest) {
                    const from = source.get(name);
                    from.bone.getWorldQuaternion(rotation).normalize().multiply(from.rotation.clone().invert()).multiply(target.rotation);
                    target.bone.parent.getWorldQuaternion(parentRotation).normalize().invert();
                    target.bone.quaternion.copy(parentRotation.multiply(rotation)).normalize();
                    target.bone.position.copy(target.position);
                    if (name === "pelvis") {
                        from.bone.getWorldPosition(position);
                        position.set(hip.worldPosition.x, hip.worldPosition.y + (position.y - sourceHip.worldPosition.y) * heightRatio, hip.worldPosition.z);
                        target.bone.position.copy(target.bone.parent.worldToLocal(position));
                    }
                    target.bone.updateMatrixWorld(true);
                }
            }
        },
        dispose() { mixer.stopAllAction(); mixer.uncacheRoot(animation.scene); }
    };
}

export function disposeActorSource(source) {
    const geometries = new Set(), materials = new Set(), skeletons = new Set();
    for (const mesh of source.meshes) { geometries.add(mesh.geometry); materials.add(mesh.material); skeletons.add(mesh.skeleton); }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
}

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BufferAttribute, Vector3 } from "three";
import sharp from "sharp";
import { loadModelSource } from "./actor-source.mjs";
import { MeshoptSimplifier } from "meshoptimizer";

/** Scanned props share three 1K textures per source and bounded, offline geometry. */
export async function prepareSurvivorScenery(read, output) {
    const directory = resolve(output, "environment/scenery");
    await mkdir(directory, { recursive: true });
    const geometries = {};
    await MeshoptSimplifier.ready;
    for (const [id, prefix] of [["rock_moss_set_01", "rock"], ["stone_fire_pit", "firepit"]]) {
        const source = await loadModelSource(read, `${id}/${id}_1k.gltf`);
        let index = 0;
        const meshes = []; source.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
        if (meshes.length !== (prefix === "rock" ? 6 : 1)) throw new Error(`${id}: unexpected source parts`);
        for (const mesh of meshes) {
            mesh.geometry.applyMatrix4(mesh.matrixWorld);
            const geometry = mesh.geometry.clone(), position = geometry.getAttribute("position");
            const [indices] = MeshoptSimplifier.simplify(new Uint32Array(geometry.index.array), position.array, 3,
                Math.floor(geometry.index.count * .18 / 3) * 3, .01, ["LockBorder"]);
            const [remap, count] = MeshoptSimplifier.compactMesh(indices);
            for (const [name, attribute] of Object.entries(geometry.attributes)) {
                const compact = new BufferAttribute(new attribute.array.constructor(count * attribute.itemSize), attribute.itemSize, attribute.normalized);
                for (let vertex = 0; vertex < remap.length; vertex++) if (remap[vertex] < count) {
                    for (let component = 0; component < attribute.itemSize; component++) compact.setComponent(remap[vertex], component, attribute.getComponent(vertex, component));
                }
                geometry.setAttribute(name, compact);
            }
            geometry.setIndex(new BufferAttribute(indices, 1));
            geometry.computeBoundingBox();
            const bounds = geometry.boundingBox, center = bounds.getCenter(new Vector3()), height = bounds.max.y - bounds.min.y;
            geometry.translate(-center.x, -bounds.min.y, -center.z);
            const positions = geometry.getAttribute("position");
            let radius = 0;
            for (let vertex = 0; vertex < positions.count; vertex++) radius = Math.max(radius, Math.hypot(positions.getX(vertex), positions.getZ(vertex)));
            // The authoritative layout supplies cylinder radius/height in game units.
            // Every rendered vertex lies inside this same normalized cylinder.
            geometry.scale(1 / radius, 1 / height, 1 / radius);
            const key = prefix === "rock" ? `rock${index++}` : prefix;
            const json = geometry.toJSON(); delete json.uuid; geometries[key] = json;
            console.log(`${key}: ${geometry.index.count / 3} triangles`);
            geometry.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
        }
        const material = [...source.materials.values()][0];
        for (const [name, bytes] of [["color", material.color], ["normal", material.normal], ["orm", material.orm]]) {
            if (!bytes) throw new Error(`${id}: missing ${name}`);
            // The older rock glTF stores roughness in G with R=0. There is no AO map.
            if (name === "orm" && prefix === "rock") {
                const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
                for (let pixel = 0; pixel < data.length; pixel += info.channels) { data[pixel] = 255; data[pixel + 2] = 0; }
                await sharp(data, { raw: info }).png().toFile(resolve(directory, `${prefix}-${name}.png`));
            } else await sharp(bytes).png().toFile(resolve(directory, `${prefix}-${name}.png`));
        }
    }
    await writeFile(resolve(directory, "models.json"), JSON.stringify(geometries));
    await writeFile(resolve(directory, "CC0.txt"), await read("polyhaven-CC0.txt"));
}

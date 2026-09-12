import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FOREST_LOD_LEVELS, simplifyForestGeometry } from "./forest-lod-geometry.mjs";
import { sourceReader } from "./actor-source.mjs";
import sharp from "sharp";

// Binary GLTF export only needs this browser API; textures are baked offline.
class BinaryFileReader {
    async readAsArrayBuffer(blob) {
        try { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
        catch (error) { this.error = error; this.onerror?.(); }
    }
}

async function treeGeometry(read, name, height) {
    const materials = new MTLLoader().parse((await read(`${name}.mtl`)).toString("utf8"), "");
    const tree = new OBJLoader().setMaterials(materials).parse((await read(`${name}.obj`)).toString("utf8"));
    tree.updateMatrixWorld(true);
    const parts = [], color = new Color();
    tree.traverse(mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), positions = geometry.getAttribute("position");
        const colors = new Float32Array(positions.count * 3), sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: positions.count, materialIndex: 0 }];
        for (const group of groups) {
            const material = sources[group.materialIndex];
            // A restrained woodland palette retains the authored leaf/bark separation.
            color.copy(material.color);
            if (material.name.startsWith("leafs")) color.set("#52745c");
            else if (material.name === "woodBark") color.set("#71533c");
            for (let vertex = group.start; vertex < group.start + group.count; vertex++) color.toArray(colors, vertex * 3);
        }
        geometry.setAttribute("color", new Float32BufferAttribute(colors, 3)); geometry.deleteAttribute("uv"); geometry.clearGroups();
        parts.push(geometry); mesh.geometry.dispose();
        for (const material of sources) material.dispose();
    });
    const merged = mergeGeometries(parts), geometry = mergeVertices(merged);
    for (const part of parts) part.dispose(); merged.dispose();
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new Vector3()), scale = height / (geometry.boundingBox.max.y - geometry.boundingBox.min.y);
    geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z).scale(scale, scale, scale);
    return geometry;
}

/** App-only environment assets, normalized to world units with one material per forest LOD. */
export async function prepareSurvivorEnvironment(input, output, root) {
    const read = await sourceReader(input), models = [
        ["oak", "tree_detailed", 155], ["pinia", "tree_pineTallA_detailed", 185], ["palm", "tree_palmDetailedTall", 175]
    ];
    globalThis.FileReader = BinaryFileReader;
    for (const [species, source, height] of models) {
        const original = await treeGeometry(read, source, height), material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
        const metadata = { offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, forestAlbedoScale: 1,
            forestLods: { middle: `Assets/models/${species}/lod1`, far: `Assets/models/${species}/lod2` } };
        const triangles = [];
        for (const level of [{ directory: "", name: "near" }, ...FOREST_LOD_LEVELS]) {
            const geometry = level.name === "near" ? original.clone() : (await simplifyForestGeometry(original, level)).geometry;
            const scene = new Group(), mesh = new Mesh(geometry, material); mesh.name = "tree"; scene.add(mesh);
            const directory = resolve(output, "Assets/models", species, level.directory); await mkdir(directory, { recursive: true });
            const binary = await new GLTFExporter().parseAsync(scene, { binary: true });
            await writeFile(resolve(directory, "model.glb"), Buffer.from(binary));
            await writeFile(resolve(directory, "info.json"), JSON.stringify(metadata));
            triangles.push(geometry.index.count / 3); geometry.dispose();
        }
        console.log(`${species}: height ${height}, LOD triangles ${triangles.join(" / ")}`);
        original.dispose(); material.dispose();
    }
    await read("kenney-LICENSE.txt");
    await mkdir(resolve(output, "environment"), { recursive: true });
    for (const file of ["kenney-LICENSE.txt", "sources.json"]) await cp(resolve(input, file), resolve(output, "environment", file));

    const atlas = JSON.parse(await readFile(resolve(root, "public/textures/land-atlas.json"), "utf8"));
    const atlasPath = resolve(root, "public/textures/terrain.png"), cell = 512, patches = [];
    for (const [name, position] of Object.entries(atlas.textures)) {
        let image;
        if (name === "mountain" || name === "_plains") {
            image = sharp(await read(name === "mountain" ? "rocky_terrain_diff_1k.jpg" : "rocky_terrain_02_diff_1k.jpg")).resize(cell, cell).modulate({ saturation: .6, brightness: .85 });
        } else {
            image = sharp(atlasPath).extract({ left: position.cellX * atlas.cellSize, top: position.cellY * atlas.cellSize, width: atlas.cellSize, height: atlas.cellSize }).resize(cell, cell);
            if (name === "land") image = image.modulate({ saturation: .42, brightness: .8 });
        }
        patches.push({ input: await image.png().toBuffer(), left: position.cellX * cell, top: position.cellY * cell });
    }
    await sharp({ create: { width: 2048, height: 2048, channels: 4, background: "#000" } }).composite(patches).png().toFile(resolve(output, "textures/terrain.png"));
    await writeFile(resolve(output, "textures/land-atlas.json"), JSON.stringify({ ...atlas, width: 2048, height: 2048, cellSize: cell, cellSpacing: 4 }));
}

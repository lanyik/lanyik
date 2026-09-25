import { mkdir, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { Box3, Group, Mesh, MeshStandardMaterial } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Tree } from "../vendor/ez-tree.mjs";
import { sourceReader } from "./actor-source.mjs";
import sharp from "sharp";

class BinaryFileReader {
    async readAsArrayBuffer(blob) {
        try { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
        catch (error) { this.error = error; this.onerror?.(); }
    }
}

// All LODs use the near asset's materials. Middle/far GLBs have no texture
// references, avoiding duplicate images and unused GPU textures in asset leases.
function texturedTreeGlb(binary, bark, leaves) {
    const source = Buffer.from(binary), jsonLength = source.readUInt32LE(12);
    const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
    gltf.images = [bark + "-Color.jpg", bark + "-NormalGL.jpg", bark + "-orm.png", leaves + "-leaves.png"]
        .map(uri => ({ uri: `../../../environment/${uri}` }));
    gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    gltf.textures = gltf.images.map((_, source) => ({ source, sampler: 0 }));
    const trunk = gltf.materials[0], foliage = gltf.materials[1];
    trunk.pbrMetallicRoughness.baseColorTexture = { index: 0 };
    trunk.normalTexture = { index: 1, scale: .8 };
    trunk.pbrMetallicRoughness.metallicRoughnessTexture = { index: 2 };
    foliage.pbrMetallicRoughness.baseColorTexture = { index: 3 };
    foliage.alphaMode = "MASK"; foliage.alphaCutoff = .42; foliage.doubleSided = true;
    const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
    json.copy(padded);
    const tail = source.subarray(20 + jsonLength), result = Buffer.alloc(20 + padded.length + tail.length);
    source.copy(result, 0, 0, 20); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(padded.length, 12);
    padded.copy(result, 20); tail.copy(result, 20 + padded.length);
    return result;
}

const TREE_LODS = [
    { directory: "", detail: { sectionStride: 2, segmentFactor: .85, leafStride: 2, leafScale: 1.15 } },
    { directory: "lod1", detail: { sectionStride: 3, segmentFactor: .6, leafStride: 4, leafScale: 1.4 } },
    { directory: "lod2", detail: { sectionStride: 6, segmentFactor: .4, leafStride: 8, leafScale: 1.8, billboard: "single" } }
];

async function prepareTrees(read, output) {
    const models = [
        ["oak", "oak_medium", "oak", "bark001", 155, 0xdee4c3],
        ["pinia", "pine_medium", "pine", "bark014", 185, 0xc8d8ca],
        ["palm", "ash_medium", "ash", "bark001", 165, 0xe0d4af]
    ];
    globalThis.FileReader = BinaryFileReader;
    for (const [species, preset, leaves, bark, height, tint] of models) {
        const tree = new Tree(); tree.options.copy(JSON.parse((await read(`${preset}.json`)).toString("utf8")));
        const parts = TREE_LODS.map(level => tree.createGeometry(level.detail));
        const bounds = new Box3();
        for (const geometry of Object.values(parts[0])) { geometry.computeBoundingBox(); bounds.union(geometry.boundingBox); }
        const scale = height / (bounds.max.y - bounds.min.y);
        const materials = [new MeshStandardMaterial({ color: 0xb4aca0, roughness: 1 }), new MeshStandardMaterial({ color: tint, roughness: .9 })];
        materials[0].name = "bark"; materials[1].name = "foliage";
        materials[1].userData.forestFoliage = true;
        const metadata = { offset: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, forestAlbedoScale: 1,
            forestLods: { middle: `Assets/models/${species}/lod1`, far: `Assets/models/${species}/lod2` } };
        const triangles = [];
        for (let lod = 0; lod < parts.length; lod++) {
            const scene = new Group();
            for (const [part, geometry] of Object.values(parts[lod]).entries()) {
                // The generator's root is XZ=0, matching the navigation trunk.
                // Centering the asymmetric canopy would move that trunk off its collider.
                geometry.translate(0, -bounds.min.y, 0).scale(scale, scale, scale);
                const mesh = new Mesh(geometry, materials[part]); mesh.name = part === 0 ? "branches" : "leaves"; scene.add(mesh);
            }
            const directory = resolve(output, "Assets/models", species, TREE_LODS[lod].directory); await mkdir(directory, { recursive: true });
            const binary = await new GLTFExporter().parseAsync(scene, { binary: true });
            await writeFile(resolve(directory, "model.glb"), lod === 0 ? texturedTreeGlb(binary, bark, leaves) : Buffer.from(binary));
            await writeFile(resolve(directory, "info.json"), JSON.stringify(metadata));
            triangles.push(Object.values(parts[lod]).reduce((sum, geometry) => sum + geometry.index.count / 3, 0));
            for (const geometry of Object.values(parts[lod])) geometry.dispose();
        }
        for (const material of materials) material.dispose();
        console.log(`${species}: height ${height}, LOD triangles ${triangles.join(" / ")}`);
    }
    const directory = resolve(output, "environment"); await mkdir(directory, { recursive: true });
    for (const species of ["oak", "pine", "ash"]) await writeFile(resolve(directory, `${species}-leaves.png`), await read(`${species}-leaves.png`));
    for (const bark of ["bark001", "bark014"]) {
        for (const channel of ["Color", "NormalGL"]) await writeFile(resolve(directory, `${bark}-${channel}.jpg`), await read(`${bark}-${channel}.jpg`));
        const { data: rough, info } = await sharp(await read(`${bark}-Roughness.jpg`)).greyscale().raw().toBuffer({ resolveWithObject: true });
        const orm = Buffer.alloc(rough.length * 3);
        for (let i = 0; i < rough.length; i++) { orm[i * 3] = 255; orm[i * 3 + 1] = rough[i]; }
        await sharp(orm, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(resolve(directory, `${bark}-orm.png`));
    }
}

/** Fixed offline inputs; runtime receives instanced PBR trees and two terrain arrays. */
export async function prepareSurvivorEnvironment(input, output, root) {
    const read = await sourceReader(input);
    await prepareTrees(read, output);
    for (const file of ["ez-tree-LICENSE.txt", "texture-attribution.md"]) await writeFile(resolve(output, "environment", file), await read(file));
    await cp(resolve(input, "sources.json"), resolve(output, "environment/sources.json"));
    // Shared demo inputs are explicit and verified; never publish the whole source directory.
    const readShared = await sourceReader(resolve(root, "public/textures"));
    await mkdir(resolve(output, "textures"), { recursive: true });
    await writeFile(resolve(output, "textures/war-fog.jpg"), await readShared("war-fog.jpg"));
    const atlas = JSON.parse((await readShared("land-atlas.json")).toString("utf8"));
    const atlasImage = await readShared(atlas.image), cell = 512, patches = [];
    // Pack the eight semantic cells, removing the source atlas's eight holes.
    // Two 8-layer arrays now cost the same GPU memory as the old 16-layer color array.
    const names = Object.keys(atlas.textures).map(name => name === "_plains" ? "soil" : name);
    const textures = Object.fromEntries(names.map((name, index) => [name, { cellX: index % 4, cellY: Math.floor(index / 4) }]));
    const surfacePixels = Buffer.alloc(504 * 504 * names.length * 4);
    const polyHaven = name => ["diff", "nor_gl", "rough", "ao"].map(channel => `${name}_${channel}_1k.jpg`);
    const scanned = { mountain: polyHaven("rocky_terrain"), soil: polyHaven("forest_ground_04"),
        land: ["Color", "NormalGL", "Roughness", "AmbientOcclusion"].map(channel => `Grass005_1K-JPG_${channel}.jpg`) };
    for (const [originalName, position] of Object.entries(atlas.textures)) {
        const name = originalName === "_plains" ? "soil" : originalName;
        const source = scanned[name];
        const image = source
            ? sharp(await read(source[0])).resize(cell, cell).modulate({ saturation: .7, brightness: .95 })
            : sharp(atlasImage).extract({ left: position.cellX * atlas.cellSize, top: position.cellY * atlas.cellSize, width: atlas.cellSize, height: atlas.cellSize }).resize(cell, cell);
        const location = { left: textures[name].cellX * cell, top: textures[name].cellY * cell };
        patches.push({ input: await image.png().toBuffer(), ...location });
        // RG normal XY, B perceptual roughness, A occlusion. Unscanned entries
        // explicitly describe a smooth, matte, unoccluded surface.
        const packed = Buffer.alloc(cell * cell * 4);
        const normal = source ? await sharp(await read(source[1])).resize(cell, cell).removeAlpha().raw().toBuffer() : null;
        const rough = source ? await sharp(await read(source[2])).resize(cell, cell).greyscale().raw().toBuffer() : null;
        const ao = source ? await sharp(await read(source[3])).resize(cell, cell).greyscale().raw().toBuffer() : null;
        for (let i = 0; i < cell * cell; i++) {
            packed[i * 4] = normal ? normal[i * 3] : 128; packed[i * 4 + 1] = normal ? normal[i * 3 + 1] : 128;
            packed[i * 4 + 2] = rough ? rough[i] : 255; packed[i * 4 + 3] = ao ? ao[i] : 255;
        }
        const layer = textures[name].cellY * 4 + textures[name].cellX;
        for (let row = 0; row < 504; row++) {
            const start = ((4 + 503 - row) * cell + 4) * 4;
            packed.copy(surfacePixels, (layer * 504 * 504 + row * 504) * 4, start, start + 504 * 4);
        }
    }
    await sharp({ create: { width: 2048, height: 1024, channels: 4, background: "#000" } }).composite(patches).png().toFile(resolve(output, "textures/terrain.png"));
    await writeFile(resolve(output, "textures/terrain-surface.bin"), surfacePixels);
    await writeFile(resolve(output, "textures/land-atlas.json"), JSON.stringify({ ...atlas, textures, surfaceBuffer: "terrain-surface.bin", width: 2048, height: 1024, cellSize: cell, cellSpacing: 4 }));
}

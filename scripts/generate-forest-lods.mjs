import fs from "node:fs";
import path from "node:path";

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FOREST_LOD_LEVELS, simplifyForestGeometry } from "./lib/forest-lod-geometry.mjs";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "assets-source", "forest");
const PUBLIC_MODEL_ROOT = path.join(ROOT, "public", "Assets", "models");

class NodeFileReader {
    result = null;
    error = null;
    onloadend = null;
    onerror = null;

    async readAsArrayBuffer(blob) {
        try {
            this.result = await blob.arrayBuffer();
            this.onloadend?.({ target: this });
        } catch (error) {
            this.error = error;
            this.onerror?.(error);
        }
    }

    async readAsDataURL(blob) {
        try {
            const bytes = Buffer.from(await blob.arrayBuffer());
            this.result = `data:${blob.type};base64,${bytes.toString("base64")}`;
            this.onloadend?.({ target: this });
        } catch (error) {
            this.error = error;
            this.onerror?.(error);
        }
    }
}

globalThis.FileReader ??= NodeFileReader;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseGlb(file) {
    const bytes = fs.readFileSync(file);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Promise((resolve, reject) => new GLTFLoader().parse(data, "", resolve, reject));
}

function triangleCount(geometry) {
    return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
}

async function simplifyScene(source, level) {
    const scene = source.clone(true);
    let sourceTriangles = 0;
    let outputTriangles = 0;
    const meshes = [];
    scene.traverse(object => {
        if (object.isMesh) meshes.push(object);
    });
    for (const object of meshes) {
        if (object.isSkinnedMesh || Object.keys(object.geometry.morphAttributes).length > 0) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} must be a static mesh`);
        }
        // This asset pipeline targets the shipped untextured trees. Textured
        // assets need UV-error weights and texture-aware visual validation.
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => Object.values(material).some(value => value?.isTexture))) {
            throw new TypeError("Forest LOD generation requires untextured source materials");
        }
        const position = object.geometry.getAttribute("position");
        const normal = object.geometry.getAttribute("normal");
        if (!position || position.count < 4) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} has no simplifiable positions`);
        }
        if (!normal || normal.count !== position.count) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} must contain vertex normals`);
        }
        const { geometry: simplified } = await simplifyForestGeometry(object.geometry, level)
            .catch(error => {
                throw new Error(`${object.name}/${level.name}: ${error.message}`, { cause: error });
            });
        sourceTriangles += triangleCount(object.geometry);
        outputTriangles += triangleCount(simplified);
        object.geometry = simplified;
    }

    if (meshes.length === 0) throw new TypeError("Forest LOD source contains no meshes");
    return { scene, sourceTriangles, outputTriangles };
}

async function exportGlb(scene) {
    const exported = await new GLTFExporter().parseAsync(scene, {
        binary: true,
        onlyVisible: false
    });
    if (!(exported instanceof ArrayBuffer)) throw new TypeError("Forest LOD export did not produce a GLB");
    return Buffer.from(exported);
}

function disposeGeneratedScene(scene) {
    scene.traverse(object => {
        if (object.isMesh) object.geometry.dispose();
    });
}

const sources = fs.readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === ".glb")
    .sort((left, right) => left.name.localeCompare(right.name));

if (sources.length === 0) throw new Error(`No forest source assets found in ${SOURCE_ROOT}`);

// Validate the entire set before overwriting any shipped asset. A topology or
// exporter failure must not leave a mixture of old and new LODs in public/.
const outputs = [];
for (const sourceEntry of sources) {
    const modelName = path.basename(sourceEntry.name, path.extname(sourceEntry.name));
    const modelRoot = path.join(PUBLIC_MODEL_ROOT, modelName);
    const infoFile = path.join(modelRoot, "info.json");
    const info = readJson(infoFile);
    const expectedLods = {
        middle: `Assets/models/${modelName}/lod1`,
        far: `Assets/models/${modelName}/lod2`
    };
    if (JSON.stringify(info.forestLods) !== JSON.stringify(expectedLods)) {
        throw new TypeError(`${infoFile} must declare ${JSON.stringify(expectedLods)}`);
    }
    const transformInfo = {
        offset: info.offset,
        rotation: info.rotation,
        scale: info.scale
    };
    const sourceFile = path.join(SOURCE_ROOT, sourceEntry.name);
    const gltf = await parseGlb(sourceFile);
    // Near LOD is byte-identical to the authored asset, including every face,
    // split normal and original node transform. Never decimate this level.
    outputs.push([path.join(modelRoot, "model.glb"), fs.readFileSync(sourceFile)]);
    console.log(`${modelName}/near: original asset (no simplification)`);

    for (const level of FOREST_LOD_LEVELS) {
        const generated = await simplifyScene(gltf.scene, level);
        const outputDirectory = path.join(modelRoot, level.directory);
        outputs.push([path.join(outputDirectory, "model.glb"), await exportGlb(generated.scene)]);
        outputs.push([path.join(outputDirectory, "info.json"), `${JSON.stringify(transformInfo, null, 4)}\n`]);
        disposeGeneratedScene(generated.scene);
        console.log(
            `${modelName}/${level.name}: ${generated.sourceTriangles} -> ${generated.outputTriangles} triangles`
        );
    }
}

for (const [file, contents] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}

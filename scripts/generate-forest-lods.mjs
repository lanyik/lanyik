import fs from "node:fs";
import path from "node:path";

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "assets-source", "forest");
const PUBLIC_MODEL_ROOT = path.join(ROOT, "public", "Assets", "models");
const LEVELS = [
    { name: "near", directory: "", vertexRetention: 0.65 },
    { name: "middle", directory: "lod1", vertexRetention: 0.28 },
    { name: "far", directory: "lod2", vertexRetention: 0.10 }
];

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

function simplifyScene(source, vertexRetention) {
    const scene = source.clone(true);
    const modifier = new SimplifyModifier();
    let sourceTriangles = 0;
    let outputTriangles = 0;
    let meshCount = 0;

    scene.traverse(object => {
        if (!object.isMesh) return;
        if (object.isSkinnedMesh || Object.keys(object.geometry.morphAttributes).length > 0) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} must be a static mesh`);
        }
        const position = object.geometry.getAttribute("position");
        const normal = object.geometry.getAttribute("normal");
        if (!position || position.count < 4) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} has no simplifiable positions`);
        }
        if (!normal || normal.count !== position.count) {
            throw new TypeError(`Forest LOD source ${object.name || "<unnamed>"} must contain vertex normals`);
        }
        const merged = mergeVertices(object.geometry);
        const mergedVertices = merged.getAttribute("position").count;
        merged.dispose();
        const retainedVertices = Math.max(4, Math.round(mergedVertices * vertexRetention));
        const removeVertices = Math.max(0, mergedVertices - retainedVertices);
        const simplified = modifier.modify(object.geometry, removeVertices);
        simplified.computeBoundingBox();
        simplified.computeBoundingSphere();
        sourceTriangles += triangleCount(object.geometry);
        outputTriangles += triangleCount(simplified);
        object.geometry = simplified;
        meshCount += 1;
    });

    if (meshCount === 0) throw new TypeError("Forest LOD source contains no meshes");
    return { scene, sourceTriangles, outputTriangles, meshCount };
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
    const gltf = await parseGlb(path.join(SOURCE_ROOT, sourceEntry.name));

    for (const level of LEVELS) {
        const generated = simplifyScene(gltf.scene, level.vertexRetention);
        const outputDirectory = path.join(modelRoot, level.directory);
        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.writeFileSync(path.join(outputDirectory, "model.glb"), await exportGlb(generated.scene));
        if (level.directory) {
            fs.writeFileSync(
                path.join(outputDirectory, "info.json"),
                `${JSON.stringify(transformInfo, null, 4)}\n`,
                "utf8"
            );
        }
        disposeGeneratedScene(generated.scene);
        console.log(
            `${modelName}/${level.name}: ${generated.sourceTriangles} -> ${generated.outputTriangles} triangles`
        );
    }
}

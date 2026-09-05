import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { BoxGeometry, Uint8BufferAttribute } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
    FOREST_LOD_LEVELS,
    assertForestTopologyPreserved,
    forestTopology,
    simplifyForestGeometry
} from "../../scripts/lib/forest-lod-geometry.mjs";

const SPECIES = ["oak", "palm", "pinia"];
const assets = new Map();

async function readAsset(file) {
    const bytes = fs.readFileSync(file);
    const gltf = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
    );
    const meshes = [];
    gltf.scene.traverse(object => {
        if (object.isMesh) meshes.push(object);
    });
    return { bytes, meshes };
}

beforeAll(async () => {
    for (const species of SPECIES) {
        assets.set(`${species}/source`, await readAsset(`assets-source/forest/${species}.glb`));
        for (const directory of ["", ...FOREST_LOD_LEVELS.map(level => level.directory)]) {
            assets.set(`${species}/${directory}`, await readAsset(
                path.join("public/Assets/models", species, directory, "model.glb")
            ));
        }
    }
});

describe.each(SPECIES)("%s shipped forest geometry", species => {
    test("never simplifies or re-exports the authored near model", () => {
        expect(assets.get(`${species}/`).bytes.equals(assets.get(`${species}/source`).bytes)).toBe(true);
    });

    test.each(FOREST_LOD_LEVELS)("$name preserves physical seams and obeys its error budget", async level => {
        const original = assets.get(`${species}/source`).meshes;
        const shipped = assets.get(`${species}/${level.directory}`).meshes;
        expect(shipped.map(mesh => mesh.name)).toEqual(original.map(mesh => mesh.name));
        const info = JSON.parse(fs.readFileSync(`public/Assets/models/${species}/info.json`, "utf8"));
        const lodInfo = JSON.parse(fs.readFileSync(
            `public/Assets/models/${species}/${level.directory}/info.json`, "utf8"
        ));
        expect(lodInfo).toEqual({ offset: info.offset, rotation: info.rotation, scale: info.scale });

        for (let part = 0; part < original.length; part += 1) {
            const source = original[part].geometry;
            const geometry = shipped[part].geometry;
            const beforePositions = source.attributes.position.array.slice();
            const beforeIndices = source.index.array.slice();
            const rebuilt = await simplifyForestGeometry(source, level);
            expect(rebuilt.error).toBeLessThanOrEqual(level.maxError);
            expect(source.attributes.position.array).toEqual(beforePositions);
            expect(source.index.array).toEqual(beforeIndices);
            expect(geometry.index.count).toBeGreaterThan(0);
            expect(geometry.index.count).toBeLessThanOrEqual(source.index.count);
            expect([...geometry.index.array]).toEqual([...rebuilt.geometry.index.array]);
            expect(geometry.attributes.position.array).toEqual(rebuilt.geometry.attributes.position.array);
            // Physical edges are compared by position, not split-normal indices.
            // This detects the holes missed by mocked box-only resource tests.
            const before = forestTopology(source);
            const after = forestTopology(geometry);
            expect(after.boundaries).toEqual(before.boundaries);
            expect(after.components).toBe(before.components);
            expect(() => assertForestTopologyPreserved(before, after)).not.toThrow();
            expect(shipped[part].matrix.elements).toEqual(original[part].matrix.elements);
            const position = geometry.attributes.position;
            const normal = geometry.attributes.normal;
            expect(normal.count).toBe(position.count);
            for (const index of geometry.index.array) expect(index).toBeLessThan(position.count);
            for (let vertex = 0; vertex < normal.count; vertex += 1) {
                expect(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)))
                    .toBeCloseTo(1, 5);
            }
            rebuilt.geometry.dispose();
        }
    });
});

describe("forest topology build guard", () => {
    test("recognizes split-normal surfaces and rejects a missing face", () => {
        const source = new BoxGeometry();
        const broken = source.clone();
        broken.setIndex([...source.index.array].slice(3));
        expect(forestTopology(source).boundaries.size).toBe(0);
        expect(() => assertForestTopologyPreserved(forestTopology(source), forestTopology(broken)))
            .toThrow("physical boundary");
    });

    test("rejects disappearance of an entire closed component", () => {
        const first = new BoxGeometry();
        const second = new BoxGeometry().translate(3, 0, 0);
        const source = mergeGeometries([first, second]);
        expect(forestTopology(source).components).toBe(2);
        expect(() => assertForestTopologyPreserved(forestTopology(source), forestTopology(first)))
            .toThrow("connected component");
    });

    test("compacts normalized attributes without normalizing their bytes twice", async () => {
        const source = new BoxGeometry();
        source.clearGroups();
        source.setAttribute("color", new Uint8BufferAttribute(
            Array.from({ length: source.attributes.position.count }, () => [128, 64, 255]).flat(), 3, true
        ));
        const { geometry } = await simplifyForestGeometry(source, FOREST_LOD_LEVELS[1]);
        const color = geometry.attributes.color;
        expect(color.normalized).toBe(true);
        expect([...color.array]).toEqual(Array.from({ length: color.count }, () => [128, 64, 255]).flat());
        expect(() => assertForestTopologyPreserved(forestTopology(source), forestTopology(geometry)))
            .not.toThrow();
    });
});

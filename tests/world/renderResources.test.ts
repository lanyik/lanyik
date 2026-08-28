import { describe, expect, test, vi } from "vitest";
import {
    BoxGeometry,
    Group,
    InstancedBufferAttribute,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    Texture,
    TextureLoader
} from "three";

vi.mock("../../src/helpers/models", () => ({
    loadModel: vi.fn(async () => {
        const scene = new Group();
        scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
        scene.updateMatrixWorld(true);
        return { scene, animations: [], info: {}, fixup: new Matrix4() };
    })
}));

import { Land, MapInfo, Point } from "../../src/index";
import { getWorldChunkMetadata } from "../../src/helpers/chunks";
import { createForest, ForestSharedResources } from "../../src/objects/Forest";
import { createGrassField, GrassSharedResources } from "../../src/objects/Grass";
import { TerrainMesh } from "../../src/objects/TerrainMesh";
import { TERRAIN_FAST_FRAGMENT_SHADER } from "../../src/shaders/terrain.fast.fragment";
import { TERRAIN_FRAGMENT_SHADER } from "../../src/shaders/terrain.fragment";
import { createWorldSurfaceResolver } from "../../src/world/WorldSurfaceResolver";
import { createWorldSurfaceView } from "../../src/world/WorldSurfaceView";

function mapWithVegetation(): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < 24; x += 1) {
        data[x] = {};
        for (let y = 0; y < 12; y += 1) {
            data[x][y] = { type: Land.land, modifiers: ["wood"], treeModel: "test-tree" };
        }
    }
    return { data, w: 24, h: 12 };
}

function points(startX: number): Point[] {
    const result: Point[] = [];
    for (let x = startX; x < startX + 12; x += 1) {
        for (let y = 0; y < 12; y += 1) result.push({ x, y });
    }
    return result;
}

describe("streamed render resource sharing", () => {
    test("de-tiles atlas cells without adding another texture lookup site", () => {
        for (const shader of [TERRAIN_FRAGMENT_SHADER, TERRAIN_FAST_FRAGMENT_SHADER]) {
            expect(shader).toContain("vec3 terrainPattern()");
            expect(shader.match(/texture2D\(map,/g)).toHaveLength(1);
        }
    });

    test("computes terrain instance data once while caching three geometry LODs", () => {
        const texture = vi.spyOn(TextureLoader.prototype, "load").mockReturnValue(new Texture());
        const map = mapWithVegetation();
        const surface = createWorldSurfaceView({
            map,
            resolver: createWorldSurfaceResolver({
                seed: "rendered-relief",
                domain: { topology: "bounded", width: map.w, height: map.h }
            }),
            tileSize: 10,
            mountainHeight: 6
        });
        const terrain = new TerrainMesh(map, {
            size: 10,
            texturesBaseUrl: "textures/",
            atlas: {
                image: "terrain.png",
                width: 1,
                height: 1,
                cellSize: 1,
                cellSpacing: 0,
                textures: { [Land.land]: { cellX: 0, cellY: 0 } }
            },
            surface
        }, []);
        terrain.addTiles(points(0));
        terrain.addTiles(points(12));
        const meshes = terrain.children.filter(child => getWorldChunkMetadata(child)) as Mesh[];
        const mesh = meshes[0];
        const metadata = getWorldChunkMetadata(mesh)!;
        expect(metadata.bounds.minY).toBe(-2.5);
        expect(metadata.bounds.maxY).toBeCloseTo(6 * 1.35 * 1.57, 10);
        terrain.mountainHeight = 8;
        expect(metadata.bounds.maxY).toBeCloseTo(8 * 1.35 * 1.57, 10);
        const lod0 = terrain.activateChunk(metadata, 0)!;
        const otherLod0 = terrain.activateChunk(getWorldChunkMetadata(meshes[1])!, 0)!;
        expect(otherLod0.getAttribute("position")).toBe(lod0.getAttribute("position"));
        expect(otherLod0.getIndex()).toBe(lod0.getIndex());
        expect(otherLod0.getAttribute("offset")).not.toBe(lod0.getAttribute("offset"));
        const landform = lod0.getAttribute("landform") as InstancedBufferAttribute;
        expect(landform.itemSize).toBe(4);
        expect([...landform.array].some(value => value !== 0)).toBe(true);
        expect(lod0.getAttribute("style").itemSize).toBe(4);
        const lod0Offsets = lod0.getAttribute("offset").array;
        const lod1 = terrain.activateChunk(metadata, 1)!;
        expect(lod1.getAttribute("offset").array).toBe(lod0Offsets);
        expect(terrain.activateChunk(metadata, 0)).toBe(lod0);
        expect(terrain.lodBuildCount).toBe(3);
        terrain.activateChunk(metadata, 2);
        expect(terrain.lodBuildCount).toBe(4);

        const fog = lod0.getAttribute("fogState") as InstancedBufferAttribute;
        fog.clearUpdateRanges();
        terrain.setFogStates([
            { x: 0, y: 0, state: 0 },
            { x: 0, y: 1, state: 1 },
            { x: 0, y: 2, state: 1 }
        ]);
        expect(fog.updateRanges).toEqual([{ start: 0, count: 3 }]);

        const firstMesh = meshes[0];
        map.data[0][0].type = Land.sand;
        expect(terrain.refreshTileAttributes([{ x: 0, y: 0 }])).toEqual([]);
        expect(terrain.children).toContain(firstMesh);
        map.data[0][0].type = Land.sea;
        expect(terrain.refreshTileAttributes([{ x: 0, y: 0 }])).toContain("land:0,0");
        expect(terrain.children).not.toContain(firstMesh);

        terrain.dispose();
        texture.mockRestore();
    });

    test("shares one grass material and caches each LOD after its first build", () => {
        const map = mapWithVegetation();
        const options = { size: 10, density: 4 };
        const resources = new GrassSharedResources(options);
        const left = createGrassField(map, options, points(0), resources)!;
        const right = createGrassField(map, options, points(12), resources)!;
        const leftMesh = left.children[0] as Mesh;
        const rightMesh = right.children[0] as Mesh;
        expect(leftMesh.material).toBe(rightMesh.material);

        const metadata = getWorldChunkMetadata(leftMesh)!;
        const lod0 = left.activateChunk(metadata, 0)!;
        const rightLod0 = right.activateChunk(getWorldChunkMetadata(rightMesh)!, 0)!;
        expect(rightLod0.getAttribute("position")).toBe(lod0.getAttribute("position"));
        expect(rightLod0.getIndex()).toBe(lod0.getIndex());
        left.activateChunk(metadata, 1);
        expect(left.activateChunk(metadata, 0)).toBe(lod0);
        expect(left.lodBuildCount).toBe(2);

        const fog = lod0.getAttribute("fogState") as InstancedBufferAttribute;
        fog.clearUpdateRanges();
        left.setFogStates([
            { x: 0, y: 0, state: 0 },
            { x: 0, y: 1, state: 0 }
        ]);
        expect(fog.updateRanges).toEqual([{ start: 0, count: 8 }]);

        fog.clearUpdateRanges();
        left.setTileSuppressed(0, 2, true);
        expect([...fog.array.slice(8, 12)]).toEqual([0, 0, 0, 0]);
        left.setTileSuppressed(0, 2, false);
        expect([...fog.array.slice(8, 12)]).toEqual([2, 2, 2, 2]);

        left.dispose();
        right.dispose();
        resources.dispose();
    });

    test("prepares each tree model once and reuses cached LOD transforms", async () => {
        const map = mapWithVegetation();
        const options = { size: 10, treesPerTile: 2 };
        const resources = new ForestSharedResources();
        const left = (await createForest(map, options, points(0), resources))!;
        const right = (await createForest(map, options, points(12), resources))!;
        expect(resources.preparedModelCount).toBe(1);
        expect(resources.preparedGeometryCount).toBe(1);

        const leftRoot = left.children[0] as Group;
        const rightRoot = right.children[0] as Group;
        expect((leftRoot.children[0] as Mesh).geometry).toBe((rightRoot.children[0] as Mesh).geometry);
        const metadata = getWorldChunkMetadata(leftRoot)!;
        left.activateChunk(metadata, 0, [leftRoot]);
        left.activateChunk(metadata, 1, [leftRoot]);
        left.activateChunk(metadata, 0, [leftRoot]);
        expect(left.lodBuildCount).toBe(2);

        const instanced = leftRoot.children[0] as InstancedMesh;
        instanced.instanceMatrix.clearUpdateRanges();
        instanced.instanceColor!.clearUpdateRanges();
        left.setFogStates([
            { x: 0, y: 0, state: 0 },
            { x: 0, y: 1, state: 1 }
        ]);
        expect(instanced.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 64 }]);
        expect(instanced.instanceColor!.updateRanges).toEqual([{ start: 0, count: 12 }]);

        left.setTileSuppressed(0, 2, true);
        expect([...instanced.instanceMatrix.array.slice(64, 80)])
            .toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

        left.dispose();
        right.dispose();
        resources.dispose();
    });
});

import { describe, expect, test, vi } from "vitest";
import {
    BufferGeometry,
    InstancedBufferGeometry,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Vector2
} from "three";

import { HexMap } from "../../src/HexMap";
import { WorldChunkMetadata } from "../../src/helpers/chunks";

type TestableHexMap = {
    terrain?: { activateChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2): InstancedBufferGeometry };
    cloneWorldObject(source: Object3D, offsetX: number, offsetY: number): Object3D;
    activateWorldChunk(metadata: WorldChunkMetadata, lod: 0 | 1 | 2, objects: Object3D[]): unknown;
    worldCopyMaterialCache: Map<string, unknown>;
    worldCopyMaterials: unknown[];
    worldPatternOffset: Vector2;
};

const metadata: WorldChunkMetadata = {
    id: "land:0,0",
    key: "0,0",
    chunkX: 0,
    chunkY: 0,
    kind: "land",
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }
};

function testableMap(): TestableHexMap {
    const map = Object.create(HexMap.prototype) as TestableHexMap;
    map.worldCopyMaterialCache = new Map();
    map.worldCopyMaterials = [];
    map.worldPatternOffset = new Vector2();
    return map;
}

describe("toroidal render copies", () => {
    test("retains per-chunk render callbacks when cloning an image", () => {
        const map = testableMap();
        const source = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
        const beforeRender = vi.fn();
        source.onBeforeRender = beforeRender;

        const copy = map.cloneWorldObject(source, 100, 200);

        expect(copy.onBeforeRender).toBe(beforeRender);
    });

    test("shares lazily activated terrain geometry with every visible image", () => {
        const map = testableMap();
        const geometry = new InstancedBufferGeometry();
        map.terrain = { activateChunk: vi.fn(() => geometry) };
        const primary = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
        const repeated = new Mesh(new BufferGeometry(), new MeshBasicMaterial());

        map.activateWorldChunk(metadata, 1, [primary, repeated]);

        expect(primary.geometry).toBe(geometry);
        expect(repeated.geometry).toBe(geometry);
    });
});

import { BufferAttribute } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";

export const FOREST_LOD_LEVELS = [
    { name: "middle", directory: "lod1", triangleRetention: 0.65, maxError: 0.005 },
    { name: "far", directory: "lod2", triangleRetention: 0.40, maxError: 0.01 }
];

// Attribute seams have distinct indices but identical physical positions. Use
// the same positional identity for boundary locks and post-build validation.
// Ignore triangles collapsed at this precision (the palm source contains these).
export function forestTopology(geometry) {
    const positions = geometry.getAttribute("position");
    const keys = Array.from({ length: positions.count }, (_, vertex) =>
        [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)]
            .map(value => Math.round(value * 1e5)).join(",")
    );
    const indices = geometry.index?.array ?? Uint32Array.from(keys, (_, index) => index);
    const edges = new Map();
    const parents = new Map();
    function root(key) {
        if (!parents.has(key)) parents.set(key, key);
        if (parents.get(key) !== key) parents.set(key, root(parents.get(key)));
        return parents.get(key);
    }
    for (let offset = 0; offset < indices.length; offset += 3) {
        const triangle = [keys[indices[offset]], keys[indices[offset + 1]], keys[indices[offset + 2]]];
        if (new Set(triangle).size !== 3) continue;
        for (let edge = 0; edge < 3; edge += 1) {
            const a = triangle[edge];
            const b = triangle[(edge + 1) % 3];
            parents.set(root(a), root(b));
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            const entry = edges.get(key) ?? { a, b, count: 0 };
            entry.count += 1;
            edges.set(key, entry);
        }
    }
    const boundaries = new Map([...edges].filter(([, edge]) => edge.count !== 2));
    const components = new Set([...parents.keys()].map(root)).size;
    return { keys, boundaries, components };
}

export function assertForestTopologyPreserved(before, after) {
    if (before.components !== after.components
        || before.boundaries.size !== after.boundaries.size
        || [...before.boundaries].some(([key, edge]) => after.boundaries.get(key)?.count !== edge.count)) {
        throw new Error("Forest LOD changed a physical boundary, surface seam or connected component");
    }
}

// The offline pipeline uses an error-limited, seam-aware edge collapse. The
// triangle target is a preference; geometry/normal error and locked boundaries
// take precedence. It is valid for an already-low-poly part to retain all faces.
export async function simplifyForestGeometry(source, { triangleRetention, maxError }) {
    await MeshoptSimplifier.ready;
    const geometry = mergeVertices(source, 1e-6);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    if (!position || !normal || position.count !== normal.count || geometry.groups.length > 0) {
        throw new TypeError("Forest LOD requires one triangle primitive with positions and normals");
    }
    const positions = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
        positions.set([position.getX(vertex), position.getY(vertex), position.getZ(vertex)], vertex * 3);
        normals.set([normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)], vertex * 3);
    }
    const topology = forestTopology(geometry);
    const lockedPositions = new Set([...topology.boundaries.values()].flatMap(edge => [edge.a, edge.b]));
    const locks = Uint8Array.from(topology.keys, key => lockedPositions.has(key) ? 1 : 0);
    const sourceIndices = new Uint32Array(geometry.index.array);
    const target = Math.max(3, Math.floor(sourceIndices.length / 3 * triangleRetention) * 3);
    const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
        sourceIndices, positions, 3, normals, 3, [0.25, 0.25, 0.25], locks,
        target, maxError, ["LockBorder", "Permissive"]
    );
    geometry.setIndex(new BufferAttribute(indices, 1));

    // The simplifier changes indices only. Compact *all* attributes through the
    // same remap so authored normals/UVs never become detached from positions.
    const [remap, vertexCount] = MeshoptSimplifier.compactMesh(indices);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const values = new attribute.array.constructor(vertexCount * attribute.itemSize);
        const compacted = new BufferAttribute(values, attribute.itemSize, attribute.normalized);
        for (let vertex = 0; vertex < remap.length; vertex += 1) {
            if (remap[vertex] >= vertexCount) continue;
            for (let component = 0; component < attribute.itemSize; component += 1) {
                compacted.setComponent(remap[vertex], component, attribute.getComponent(vertex, component));
            }
        }
        geometry.setAttribute(name, compacted);
    }
    assertForestTopologyPreserved(forestTopology(source), forestTopology(geometry));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, error };
}

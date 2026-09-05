import { BufferGeometry, ColorRepresentation, Float32BufferAttribute, Mesh, MeshBasicMaterial } from "three";
import { getHexCenter } from "../helpers/helpers";
import { Point } from "../interfaces";
import { WorldSurfaceView } from "../world/WorldSurfaceView";
import { TERRAIN_SURFACE_DETAIL_AMPLITUDE } from "../shaders/terrain.vertex";

const EDGE_SEGMENTS = 8;
const CACHE_CAPACITY = 128;

/** CPU projections only: eviction never disposes a visible marker's geometry. */
export class SurfaceMarkerProjectionCache {
    private surface?: WorldSurfaceView;
    private revision = -1;
    private readonly entries = new Map<string, Float32Array>();

    public project(surface: WorldSurfaceView, tile: Point): Float32Array {
        if (this.surface !== surface || this.revision !== surface.revision) {
            this.clear();
            this.surface = surface;
            this.revision = surface.revision;
        }
        const key = `${tile.x},${tile.y}`;
        let positions = this.entries.get(key);
        if (positions) this.entries.delete(key);
        else {
            const size = surface.tileSize;
            const center = getHexCenter(tile.x, tile.y, size);
            const window = surface.createWindow();
            positions = new Float32Array(6 * (EDGE_SEGMENTS + 1) * 2 * 3);
            let offset = 0;
            for (let edge = 0; edge < 6; edge += 1) {
                const a = edge * Math.PI / 3;
                const b = (edge + 1) * Math.PI / 3;
                for (let segment = 0; segment <= EDGE_SEGMENTS; segment += 1) {
                    const t = segment / EDGE_SEGMENTS;
                    for (const radius of [0.97, 1]) {
                        const x = (Math.cos(a) * (1 - t) + Math.cos(b) * t) * size * radius;
                        const z = (Math.sin(a) * (1 - t) + Math.sin(b) * t) * size * radius;
                        const height = window.getWorldHeight(center.x + x, center.y + z);
                        // Clear the shader's bounded micro relief without losing depth occlusion.
                        positions[offset++] = x;
                        positions[offset++] = height * (1 + TERRAIN_SURFACE_DETAIL_AMPLITUDE) + size * 0.008;
                        positions[offset++] = z;
                    }
                }
            }
        }
        this.entries.set(key, positions);
        if (this.entries.size > CACHE_CAPACITY) this.entries.delete(this.entries.keys().next().value!);
        return positions;
    }

    public clear(): void {
        this.entries.clear();
        this.surface = undefined;
        this.revision = -1;
    }
}

export class SurfaceHexMarker extends Mesh<BufferGeometry, MeshBasicMaterial> {
    constructor(color: ColorRepresentation, private readonly projections: SurfaceMarkerProjectionCache) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6 * (EDGE_SEGMENTS + 1) * 2 * 3), 3));
        const indices: number[] = [];
        for (let edge = 0; edge < 6; edge += 1) for (let segment = 0; segment < EDGE_SEGMENTS; segment += 1) {
            const i = (edge * (EDGE_SEGMENTS + 1) + segment) * 2;
            indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
        }
        geometry.setIndex(indices);
        super(geometry, new MeshBasicMaterial({ color, depthWrite: false }));
        // Render after opaque ground: depthWrite=false otherwise lets terrain
        // submitted later overwrite a correctly projected rim.
        this.renderOrder = 1;
        this.visible = false;
    }

    public project(surface: WorldSurfaceView, tile: Point): void {
        const position = this.geometry.getAttribute("position");
        position.array.set(this.projections.project(surface, tile));
        position.needsUpdate = true;
        this.geometry.computeBoundingSphere();
    }
}

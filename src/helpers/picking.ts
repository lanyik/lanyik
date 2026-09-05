import { Vector3, Camera, Ray, Raycaster, Vector2 } from "three";
import { Point } from "../interfaces";
import { getHexCenter } from "./helpers";
import { WorldSurfaceView } from "../world/WorldSurfaceView";
import { getMapTile, positiveModulo } from "./topology";

// Walk only the hexes crossed by the ray inside the surface-height slab,
// intersecting their authoritative six-triangle fans. No scene mesh scan or
// zero-height picking plane is involved, including at floating origins.
export function intersectWorldSurface(ray: Ray, surface: WorldSurfaceView, far: number): Vector3 | null {
    if (Math.abs(ray.direction.y) < 1e-12) return null;
    const lower = (surface.minimumHeight - ray.origin.y) / ray.direction.y;
    const upper = (surface.maximumHeight - ray.origin.y) / ray.direction.y;
    let distance = Math.max(0, Math.min(lower, upper));
    const end = Math.min(far, Math.max(lower, upper));
    if (distance > end) return null;
    const size = surface.tileSize;
    const epsilon = size * 1e-7;
    const apothem = size * Math.sqrt(3) / 2;
    const window = surface.createWindow();
    const probe = new Vector3();
    const center = new Vector3();
    const first = new Vector3();
    const second = new Vector3();
    const hit = new Vector3();
    while (distance <= end + epsilon) {
        ray.at(distance + epsilon, probe);
        const tile = pickTile(probe, size)!;
        let exit = end + epsilon;
        for (let edge = 0; edge < 6; edge += 1) {
            const angle = (edge + 0.5) * Math.PI / 3;
            const nx = Math.cos(angle), nz = Math.sin(angle);
            const speed = nx * ray.direction.x + nz * ray.direction.z;
            if (speed <= 1e-12) continue;
            const crossing = (apothem - nx * (ray.origin.x - tile.worldX)
                - nz * (ray.origin.z - tile.worldY)) / speed;
            if (crossing > distance + epsilon * 0.5) exit = Math.min(exit, crossing);
        }
        if (getMapTile(surface.map, tile.x, tile.y)) {
            const heights = window.getCornerReliefs(tile.x, tile.y);
            center.set(tile.worldX, window.getTileCenterHeight(tile.x, tile.y), tile.worldY);
            let nearest = Infinity;
            for (let edge = 0; edge < 6; edge += 1) {
                const a = edge * Math.PI / 3, b = (edge + 1) * Math.PI / 3;
                first.set(tile.worldX + Math.cos(a) * size, heights[edge] * surface.mountainHeight,
                    tile.worldY + Math.sin(a) * size);
                second.set(tile.worldX + Math.cos(b) * size, heights[(edge + 1) % 6] * surface.mountainHeight,
                    tile.worldY + Math.sin(b) * size);
                if (!ray.intersectTriangle(center, first, second, false, hit)) continue;
                const t = hit.distanceTo(ray.origin);
                if (t >= distance - epsilon && t <= exit + epsilon) nearest = Math.min(nearest, t);
            }
            if (nearest <= end + epsilon) return ray.at(nearest, hit);
        }
        if (exit >= end) break;
        distance = exit;
    }
    return null;
}

export function screenToSurface(
    clientX: number, clientY: number, canvas: HTMLElement, camera: Camera,
    surface: WorldSurfaceView, logicalGround: (point: Vector3) => void
): Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right
        || clientY < rect.top || clientY > rect.bottom) return null;
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const far = new Vector3(ndc.x, ndc.y, 1).unproject(camera).distanceTo(raycaster.ray.origin);
    logicalGround(raycaster.ray.origin);
    return intersectWorldSurface(raycaster.ray, surface, far);
}

//Finds the (x,y) tile whose hex center (getHexCenter) is closest to the given
//world-space ground point. Brute-force search over the small neighborhood of
//candidate columns/rows around the approximate position - robust for a uniform
//hex grid without needing cube-coordinate rounding math, and cheap enough to run
//on every pointermove (9 candidate centers at most).
export interface TilePick extends Point {
    worldX: number;
    worldY: number;
}

export function pickTile(
    worldPoint: Vector3,
    size: number,
    mapWidth?: number,
    mapHeight?: number,
    wrapX = false,
    wrapY = false
): TilePick | null {
    if (!Number.isFinite(size) || size <= 0) return null;
    if (mapWidth !== undefined && (!Number.isInteger(mapWidth) || mapWidth <= 0)) return null;
    if (mapHeight !== undefined && (!Number.isInteger(mapHeight) || mapHeight <= 0)) return null;
    if ((wrapX && mapWidth === undefined) || (wrapY && mapHeight === undefined)) return null;

    const approxX = worldPoint.x / (size * 1.5);
    const approxY = worldPoint.z / (size * Math.sqrt(3));

    const x0 = Math.floor(approxX);
    const y0 = Math.floor(approxY);

    let best: TilePick | null = null;
    let bestDist = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const rawX = x0 + dx;
            const rawY = y0 + dy;
            const center = getHexCenter(rawX, rawY, size);
            const dist = (center.x - worldPoint.x) ** 2 + (center.y - worldPoint.z) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                best = { x: rawX, y: rawY, worldX: center.x, worldY: center.y };
            }
        }
    }

    if (!best) return null;
    // An omitted dimension means an unbounded axis, not a bounded map whose
    // minimum happens to be zero. Infinite worlds must be pickable and streamable
    // through negative coordinates as well as positive ones.
    if (!wrapX && mapWidth !== undefined && (best.x < 0 || best.x >= mapWidth)) return null;
    if (!wrapY && mapHeight !== undefined && (best.y < 0 || best.y >= mapHeight)) return null;
    return {
        ...best,
        x: wrapX ? positiveModulo(best.x, mapWidth as number) : best.x,
        y: wrapY ? positiveModulo(best.y, mapHeight as number) : best.y
    };
}

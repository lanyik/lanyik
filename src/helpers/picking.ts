import { Vector3, Camera, Plane, Raycaster, Vector2 } from "three";
import { Point } from "../interfaces";
import { getHexCenter } from "./helpers";
import { positiveModulo } from "./topology";

//Ground plane (Y=0) that all hex tiles sit on. Tile picking works against this
//plane instead of raycasting individual mesh objects, since terrain is now a
//single instanced mesh (no per-tile Object3D left to raycast against).
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

//Projects a screen-space point (e.g. from a MouseEvent) onto the ground plane in
//world space, using the given canvas element for coordinate normalization.
export function screenToGround(clientX: number, clientY: number, canvas: HTMLElement, camera: Camera): Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const point = new Vector3();
    return raycaster.ray.intersectPlane(GROUND_PLANE, point) ? point : null;
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
    if (!wrapX && (best.x < 0 || (mapWidth !== undefined && best.x >= mapWidth))) return null;
    if (!wrapY && (best.y < 0 || (mapHeight !== undefined && best.y >= mapHeight))) return null;
    return {
        ...best,
        x: wrapX ? positiveModulo(best.x, mapWidth as number) : best.x,
        y: wrapY ? positiveModulo(best.y, mapHeight as number) : best.y
    };
}

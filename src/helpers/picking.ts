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
            if ((!wrapX && rawX < 0) || (!wrapY && rawY < 0)) continue;
            if (!wrapX && mapWidth !== undefined && rawX >= mapWidth) continue;
            if (!wrapY && mapHeight !== undefined && rawY >= mapHeight) continue;
            if (wrapX && mapWidth === undefined) continue;
            if (wrapY && mapHeight === undefined) continue;

            const x = wrapX ? positiveModulo(rawX, mapWidth as number) : rawX;
            const y = wrapY ? positiveModulo(rawY, mapHeight as number) : rawY;

            const center = getHexCenter(rawX, rawY, size);
            const dist = (center.x - worldPoint.x) ** 2 + (center.y - worldPoint.z) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                best = { x, y, worldX: center.x, worldY: center.y };
            }
        }
    }

    return best;
}

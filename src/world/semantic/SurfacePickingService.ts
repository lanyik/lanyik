import { Camera, Object3D, Raycaster, Vector2, Vector3 } from "three";

import { surfaceToWorld, worldToSurface } from "./SurfaceLattice";
import { SurfaceQueryService } from "./SurfaceQueryService";
import { WorldDescriptorV2 } from "./WorldDescriptorV2";

export interface SurfacePickResult {
    readonly x: number;
    readonly y: number;
    readonly worldX: number;
    readonly worldZ: number;
    readonly height: number;
    readonly surface: "ground" | "water";
}

export interface SurfacePickingServiceOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly queries: SurfaceQueryService;
    readonly root: Object3D;
    readonly hexSize?: number;
}

function positiveModulo(value: number, size: number): number {
    return ((value % size) + size) % size;
}

export class SurfacePickingService {
    private readonly descriptor: WorldDescriptorV2;
    private readonly queries: SurfaceQueryService;
    private readonly root: Object3D;
    private readonly hexSize: number;
    private readonly raycaster = new Raycaster();
    private readonly ndc = new Vector2();
    private readonly worldPoint = new Vector3();
    private floatingOriginX = 0;
    private floatingOriginZ = 0;
    private disposed = false;

    constructor(options: SurfacePickingServiceOptions) {
        const hexSize = options?.hexSize ?? 1;
        if (!options || !options.descriptor || !options.queries || !(options.root instanceof Object3D)
            || !Number.isFinite(hexSize) || hexSize <= 0) {
            throw new TypeError("SurfacePickingService options are invalid");
        }
        this.descriptor = options.descriptor;
        this.queries = options.queries;
        this.root = options.root;
        this.hexSize = hexSize;
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        this.assertReady();
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError("surface picking floating origin must be finite");
        }
        this.floatingOriginX = worldX;
        this.floatingOriginZ = worldZ;
    }

    public async pickScreen(
        clientX: number,
        clientY: number,
        canvas: HTMLElement,
        camera: Camera
    ): Promise<Readonly<SurfacePickResult> | undefined> {
        this.assertReady();
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !canvas || !camera) {
            throw new TypeError("surface screen pick arguments are invalid");
        }
        const rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return undefined;
        this.ndc.set(
            (clientX - rect.left) / rect.width * 2 - 1,
            -((clientY - rect.top) / rect.height * 2 - 1)
        );
        this.raycaster.setFromCamera(this.ndc, camera);
        const intersection = this.raycaster.intersectObject(this.root, true).find(candidate =>
            candidate.object.name.startsWith("surface-ground-")
            || candidate.object.name.startsWith("surface-water-"));
        if (!intersection) return undefined;
        this.worldPoint.copy(intersection.point);
        this.worldPoint.x += this.floatingOriginX;
        this.worldPoint.z += this.floatingOriginZ;
        return this.pickWorldPoint(
            this.worldPoint.x,
            this.worldPoint.z,
            intersection.object.name.startsWith("surface-water-")
        );
    }

    public async pickWorldPoint(
        worldX: number,
        worldZ: number,
        onWater = false
    ): Promise<Readonly<SurfacePickResult> | undefined> {
        this.assertReady();
        const coordinate = worldToSurface(worldX, worldZ, this.hexSize);
        const baseX = Math.floor(coordinate.u);
        const baseY = Math.floor(coordinate.v);
        let bestX = baseX;
        let bestY = baseY;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                const x = baseX + offsetX;
                const y = baseY + offsetY;
                const center = surfaceToWorld(x, y, this.hexSize);
                const distance = (center.x - worldX) ** 2 + (center.z - worldZ) ** 2;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestX = x;
                    bestY = y;
                }
            }
        }
        if (this.descriptor.topology === "bounded"
            && (bestX < 0 || bestY < 0 || bestX >= this.descriptor.width || bestY >= this.descriptor.height)) {
            return undefined;
        }
        const x = this.descriptor.topology === "toroidal" ? positiveModulo(bestX, this.descriptor.width) : bestX;
        const y = this.descriptor.topology === "toroidal" ? positiveModulo(bestY, this.descriptor.height) : bestY;
        const sample = await this.queries.sample(x, y);
        const water = onWater && sample.waterCoverage > 0;
        return Object.freeze({
            x,
            y,
            worldX,
            worldZ,
            height: water ? sample.waterLevel : sample.groundHeight,
            surface: water ? "water" : "ground"
        });
    }

    public dispose(): void { this.disposed = true; }

    private assertReady(): void {
        if (this.disposed) throw new Error("SurfacePickingService has been disposed");
    }
}

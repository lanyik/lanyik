import { BufferAttribute, BufferGeometry } from "three";

import {
    CompiledWaterCoverageGeometry,
    CompiledWaterGeometry,
    assertCompiledWaterGeometry
} from "../world/CompiledWaterGeometry";
import { SurfaceGroundGeometrySet } from "./SurfaceGroundGeometry";

export function createSurfaceCoverageGeometry(
    compiled: Readonly<CompiledWaterCoverageGeometry>
): BufferGeometry {
    assertCompiledWaterGeometry(compiled);
    if (compiled.kind !== "coverage") {
        throw new TypeError("surface coverage BufferGeometry requires compiled coverage buffers");
    }
    const geometry = new BufferGeometry();
    geometry.name = "surface-water-coverage";
    geometry.setAttribute("position", new BufferAttribute(compiled.positions, 3));
    geometry.setAttribute(
        "surfaceFieldCoordinate",
        new BufferAttribute(compiled.surfaceFieldCoordinates, 2)
    );
    geometry.setIndex(new BufferAttribute(compiled.indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.surfaceWaterGeometryKind = "coverage";
    return geometry;
}

export class SurfaceWaterGeometryBinding {
    public readonly kind: CompiledWaterGeometry["kind"];
    public readonly geometry: BufferGeometry | undefined;
    public readonly ownsGeometry: boolean;
    private disposed = false;

    constructor(
        compiled: Readonly<CompiledWaterGeometry>,
        sharedGround: SurfaceGroundGeometrySet
    ) {
        assertCompiledWaterGeometry(compiled);
        if (!(sharedGround instanceof SurfaceGroundGeometrySet)) {
            throw new TypeError("surface water geometry requires the shared ground topology owner");
        }
        this.kind = compiled.kind;
        this.geometry = compiled.kind === "none" ? undefined
            : compiled.kind === "fullPatch" ? sharedGround.get("near")
                : createSurfaceCoverageGeometry(compiled);
        this.ownsGeometry = compiled.kind === "coverage";
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.ownsGeometry) this.geometry?.dispose();
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }
}

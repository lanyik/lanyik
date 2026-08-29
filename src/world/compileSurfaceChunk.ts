import {
    CompiledSurfaceChunk,
    createCompiledSurfaceChunk
} from "./CompiledSurfaceChunk";
import { compileSurfaceBounds } from "./CompiledSurfaceBounds";
import { compileWaterGeometry } from "./CompiledWaterGeometry";
import {
    TransferableEffectiveWindow,
    assertTransferableEffectiveWindow
} from "./TransferableEffectiveWindow";
import { compileSurfaceField } from "./compileSurfaceField";
import { compileVegetationSeeds } from "./compileVegetationSeeds";

export function compileSurfaceChunk(
    window: Readonly<TransferableEffectiveWindow>
): CompiledSurfaceChunk {
    assertTransferableEffectiveWindow(window);
    const compilation = compileSurfaceField(window);
    const waterGeometry = compileWaterGeometry(compilation.field);
    return createCompiledSurfaceChunk({
        dependencyKey: window.dependencyKey,
        bounds: compileSurfaceBounds(
            compilation.field,
            waterGeometry,
            window.dependencyKey.metrics.hexSize
        ),
        field: compilation.field,
        waterBodies: compilation.waterBodies,
        waterGeometry,
        vegetationSeeds: compileVegetationSeeds(window, compilation.field)
    });
}

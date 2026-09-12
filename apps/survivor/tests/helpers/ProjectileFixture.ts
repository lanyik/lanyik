import { ProjectileBatch } from "../../src/core/ProjectileBatch";
import { SpatialGrid, SpatialQuery } from "../../src/core/SpatialGrid";
import { MAX_ENEMIES } from "../../src/core/GameConfig";

/** Raw collision fixtures stand in for the authority's existing target index. */
export function prepareProjectileFixture(batch: ProjectileBatch): void {
    const grid = new SpatialGrid(MAX_ENEMIES), query = new SpatialQuery(MAX_ENEMIES);
    const indices = Uint16Array.from({ length: MAX_ENEMIES }, (_, i) => i);
    for (let i = 0; i < batch.enemyCount; i++) grid.update(i, batch.enemyX[i], batch.enemyZ[i], batch.enemyRadius[i], 1);
    batch.prepare(grid, query, 1, indices);
}

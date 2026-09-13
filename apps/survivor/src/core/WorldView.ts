/** One range contract in game units; the map adapter converts to display units. */
const chunkSize = 12, residentRadius = 4, unitScale = 34;
const residentChunks = (residentRadius * 2 + 1) ** 2;
const terrainEnd = 68, terrainChunkSize = 24, terrainLoadRadius = Math.ceil(terrainEnd / (terrainChunkSize * 1.5));
export const WORLD_VIEW = Object.freeze({
    unitScale, chunkSize, residentRadius, residentChunks,
    // Every chunk can contain ten inhabitants and one lord, even in an all-horror fixture.
    maxEnemies: Math.ceil(residentChunks * 11 / 64) * 64,
    actorFadeStart: 34, actorFadeEnd: (residentRadius - .5) * chunkSize,
    awakeRadius: 44, sleepRadius: 46,
    mistInner: 20, mistDense: 34, mistFade: 44, mistOuter: 50,
    terrainFogStart: 34, terrainFogEnd: 50, terrainEnd, vegetationEnd: 50,
    terrainChunkSize, terrainLoadRadius, terrainRetentionRadius: terrainLoadRadius + 1,
    navigationChunks: (residentRadius * 2 + 3) ** 2
});

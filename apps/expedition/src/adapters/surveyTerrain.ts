import { decodeWorldChunkTile, type TileInfo, type WorldBaseChunkSource } from "three-hex-map";
import type { SurveyTerrain } from "../content/minerals";
import type { MineralField } from "../core/resources/MineralField";
import { LandingSurveyWindow, SURVEY_CENTRES, SURVEY_WINDOW_SIZE, type LandingFailure, type LandingSurvey, type TerrainWindow } from "../scenarios/landingSurvey";

type TerrainSamplingSource = Pick<WorldBaseChunkSource, "chunkSize" | "sampleBaseChunk">;

export function toSurveyTerrain(tile: Readonly<TileInfo>): SurveyTerrain {
    return { type: tile.type, hill: tile.modifiers?.includes("hill") === true,
        forest: tile.modifiers?.includes("wood") === true, lake: tile.modifiers?.includes("lake") === true };
}

export async function sampleTerrainWindow(
    source: TerrainSamplingSource, originX: number, originY: number, signal: AbortSignal
): Promise<TerrainWindow> {
    const size = SURVEY_WINDOW_SIZE;
    if (size % source.chunkSize !== 0 || originX % source.chunkSize !== 0 || originY % source.chunkSize !== 0) {
        throw new RangeError("Survey windows must align with the source chunk grid");
    }
    const tiles = new Array<SurveyTerrain>(size * size);
    const chunksPerSide = size / source.chunkSize;
    // Four submissions at a time keep cancellation and the shared Worker queue bounded.
    const chunkCount = chunksPerSide * chunksPerSide;
    for (let start = 0; start < chunkCount; start += 4) {
        signal.throwIfAborted();
        const chunks = await Promise.all(Array.from({ length: Math.min(4, chunkCount - start) }, (_, offset) => {
            const index = start + offset;
            return source.sampleBaseChunk(originX / source.chunkSize + index % chunksPerSide,
                originY / source.chunkSize + Math.floor(index / chunksPerSide), { signal, lane: "critical" });
        }));
        signal.throwIfAborted();
        for (const [offset, chunk] of chunks.entries()) {
            const column = (start + offset) % chunksPerSide;
            const row = Math.floor((start + offset) / chunksPerSide);
            for (let x = 0; x < source.chunkSize; x += 1) {
                for (let y = 0; y < source.chunkSize; y += 1) {
                    tiles[(row * source.chunkSize + y) * size + column * source.chunkSize + x] = toSurveyTerrain(decodeWorldChunkTile(chunk, x, y));
                }
            }
        }
    }
    return { originX, originY, size, tiles };
}

const failureNames: Record<LandingFailure, string> = {
    clearing: "指挥中心空地", "building-space": "连片建设用地", forest: "可达林地",
    minerals: "起步矿藏储量", expansion: "第二片金属矿区"
};

export async function surveyLanding(
    source: TerrainSamplingSource, field: MineralField, signal: AbortSignal
): Promise<LandingSurvey> {
    const failures: Record<LandingFailure, number> = { clearing: 0, "building-space": 0, forest: 0, minerals: 0, expansion: 0 };
    for (const centre of SURVEY_CENTRES) {
        const terrain = await sampleTerrainWindow(source, centre.x - SURVEY_WINDOW_SIZE / 2, centre.y - SURVEY_WINDOW_SIZE / 2, signal);
        const result = new LandingSurveyWindow(terrain, field).findLanding();
        signal.throwIfAborted();
        if (result.landing) return result.landing;
        for (const failure of Object.keys(failures) as LandingFailure[]) failures[failure] += result.failures[failure];
    }
    const reasons = (Object.keys(failures) as LandingFailure[]).filter(failure => failures[failure] > 0)
        .map(failure => `${failureNames[failure]}不足`).join("、");
    throw new Error(`本次勘察未找到满足条件的登陆区：${reasons}。请选择其他星球种子。`);
}

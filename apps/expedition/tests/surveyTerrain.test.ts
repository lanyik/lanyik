import { describe, expect, it, vi } from "vitest";
import { generateWorldChunk, decodeWorldChunkTile } from "three-hex-map";
import { MineralField } from "../src/core/resources/MineralField";
import { sampleTerrainWindow, surveyLanding, toSurveyTerrain } from "../src/adapters/surveyTerrain";
import { SURVEY_CENTRES } from "../src/scenarios/landingSurvey";

describe("terrain survey integration", () => {
    it.each(["expedition-1", "expedition-2"])("finds a viable landing using actual generated terrain for %s", async seed => {
        const source = { chunkSize: 24, sampleBaseChunk: vi.fn(async (chunkX: number, chunkY: number) =>
            generateWorldChunk({ seed, chunkX, chunkY, chunkSize: 24 })) };
        const { survey } = await surveyLanding(source, new MineralField(seed), new AbortController().signal);
        expect(survey.resources).toHaveLength(3);
        expect(source.sampleBaseChunk.mock.calls.length).toBeLessThanOrEqual(SURVEY_CENTRES.length * 16);
        const node = survey.resources[0].nearest;
        const chunk = generateWorldChunk({ seed, chunkX: Math.floor(node.x / 24), chunkY: Math.floor(node.y / 24), chunkSize: 24 });
        const tile = decodeWorldChunkTile(chunk, ((node.x % 24) + 24) % 24, ((node.y % 24) + 24) % 24);
        expect(new MineralField(seed).nodeAt(node.x, node.y, toSurveyTerrain(tile))).toEqual(node);
    });

    it("reports a real unsuitable survey without substituting another seed", async () => {
        const seed = "expedition-3";
        const source = { chunkSize: 24, sampleBaseChunk: vi.fn(async (chunkX: number, chunkY: number) =>
            generateWorldChunk({ seed, chunkX, chunkY, chunkSize: 24 })) };
        await expect(surveyLanding(source, new MineralField(seed), new AbortController().signal)).rejects.toThrow("未找到满足条件的登陆区");
        expect(source.sampleBaseChunk).toHaveBeenCalledTimes(SURVEY_CENTRES.length * 16);
    }, 15_000);

    it("does not submit any Worker work after cancellation", async () => {
        const controller = new AbortController();
        controller.abort();
        const sampleBaseChunk = vi.fn(async () => generateWorldChunk({ seed: "cancel", chunkX: 0, chunkY: 0 }));
        await expect(sampleTerrainWindow({ chunkSize: 24, sampleBaseChunk }, -48, -48, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(sampleBaseChunk).not.toHaveBeenCalled();
    });
});

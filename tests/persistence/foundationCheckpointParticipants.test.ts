import { describe, expect, test } from "vitest";

import {
    createSimulationGenerationParticipant,
    createWorldDeltaGenerationParticipant
} from "../../src/persistence/FoundationCheckpointParticipants";
import {
    GenerationCheckpointCoordinator,
    MemoryGenerationCheckpointStore
} from "../../src/persistence/GenerationCheckpointCoordinator";
import {
    MemorySimulationChunkStore,
    WorldSimulationRuntime
} from "../../src/simulation/WorldSimulationRuntime";
import { generateWorldChunk } from "../../src/world/generateWorldChunk";
import { MemoryWorldDeltaStore } from "../../src/world/WorldDeltaStore";
import { WorldGeneratorPool } from "../../src/world/WorldGeneratorPool";
import { ProceduralWorldSource } from "../../src/world/WorldSource";

interface State { value: string }

describe("foundation generation checkpoint participants", () => {
    test("restores simulation and terrain deltas from the same manifest generation", async () => {
        const simulation = new WorldSimulationRuntime<State>({
            chunkSize: 12,
            store: new MemorySimulationChunkStore<State>()
        });
        simulation.addEntity({ id: "army", x: 1, y: 1, state: { value: "committed" } });

        const pool = new WorldGeneratorPool("unused", {
            size: 1,
            clientFactory: () => ({
                generateChunk: options => Promise.resolve(generateWorldChunk(options)),
                dispose() {},
                get isDisposed() { return false; }
            })
        });
        const source = new ProceduralWorldSource({
            seed: "participant-world",
            workerUrl: "unused",
            chunkSize: 12,
            worldId: "participant-world"
        }, {
            pool,
            deltaStore: new MemoryWorldDeltaStore()
        });
        const chunk = await source.loadChunk(0, 0);
        source.setTileOverride(2, 3, { unit: "committed" });

        const coordinator = new GenerationCheckpointCoordinator({
            worldId: source.worldId,
            descriptor: source.descriptor,
            store: new MemoryGenerationCheckpointStore(),
            participants: [
                createSimulationGenerationParticipant(simulation),
                createWorldDeltaGenerationParticipant(source)
            ],
            orphanGraceMs: 0
        });
        await coordinator.checkpoint();

        simulation.setEntityState("army", { value: "uncommitted" });
        source.setTileOverride(2, 3, { unit: "uncommitted" });
        await coordinator.recover();

        expect(simulation.getEntity("army")?.state).toEqual({ value: "committed" });
        expect(source.store.getTileOverride(2, 3)).toEqual({ unit: "committed" });
        expect(coordinator.stats.latestGeneration).toBe(1);

        source.releaseChunk(chunk);
        source.dispose();
        simulation.dispose();
    });
});

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
import { MemoryWorldDeltaStore } from "../../src/world/WorldDeltaStore";
import { createWorldDescriptorV2 } from "../../src/world/semantic/WorldDescriptorV2";

interface State { value: string }

describe("foundation generation checkpoint participants", () => {
    test("captures and restores the atomic semantic/hydrology store at a save barrier", async () => {
        const descriptor = createWorldDescriptorV2({ seed: "atomic-checkpoint" });
        const store = new MemoryWorldDeltaStore();
        await store.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 3, y: 4, macroHeight: 12_345 }]
        });
        const participant = createWorldDeltaGenerationParticipant(descriptor, store);
        const checkpoint = await participant.capture({} as never);
        await store.commit({
            descriptor,
            expectedRevision: 1,
            semanticMutations: [{ x: 3, y: 4, macroHeight: 23_456 }]
        });
        await participant.restore({} as never, checkpoint);
        const restored = await store.load(descriptor);
        expect(restored).toMatchObject({ effectiveRevision: 1 });
        expect(restored.semanticDeltas[0].macroHeight[0]).toBe(12_345);
        store.dispose();
    });

    test("restores simulation and atomic world deltas from one manifest generation", async () => {
        const descriptor = createWorldDescriptorV2({ seed: "participant-world" });
        const worldDeltas = new MemoryWorldDeltaStore();
        const simulation = new WorldSimulationRuntime<State>({
            store: new MemorySimulationChunkStore<State>()
        });
        simulation.addEntity({ id: "army", x: 1, y: 1, state: { value: "committed" } });
        await worldDeltas.commit({
            descriptor,
            expectedRevision: 0,
            semanticMutations: [{ x: 2, y: 3, vegetationDensity: 41 }]
        });
        const coordinator = new GenerationCheckpointCoordinator({
            worldId: `v2:${descriptor.seed}`,
            descriptor,
            store: new MemoryGenerationCheckpointStore(),
            participants: [
                createSimulationGenerationParticipant(simulation),
                createWorldDeltaGenerationParticipant(descriptor, worldDeltas)
            ],
            orphanGraceMs: 0
        });
        await coordinator.checkpoint();

        simulation.setEntityState("army", { value: "uncommitted" });
        await worldDeltas.commit({
            descriptor,
            expectedRevision: 1,
            semanticMutations: [{ x: 2, y: 3, vegetationDensity: 99 }]
        });
        await coordinator.recover();

        expect(simulation.getEntity("army")?.state).toEqual({ value: "committed" });
        const restored = await worldDeltas.load(descriptor);
        expect(restored.effectiveRevision).toBe(1);
        expect(restored.semanticDeltas[0].vegetationDensity[0]).toBe(41);
        expect(coordinator.stats.latestGeneration).toBe(1);
        coordinator.dispose();
        simulation.dispose();
        worldDeltas.dispose();
    });
});

import {
    WorldSimulationCheckpoint,
    WorldSimulationRuntime
} from "../simulation/WorldSimulationRuntime";
import { GenerationCheckpointParticipant } from "./GenerationCheckpointCoordinator";
import {
    WorldDeltaCheckpoint,
    WorldDeltaStore
} from "../world/WorldDeltaStore";
import { WorldDescriptorV2 } from "../world/semantic/WorldDescriptorV2";

export function createSimulationGenerationParticipant<State>(
    runtime: WorldSimulationRuntime<State>
): GenerationCheckpointParticipant<WorldSimulationCheckpoint<State>> {
    if (!runtime || typeof runtime.createCheckpointSnapshot !== "function"
        || typeof runtime.restoreCheckpointSnapshot !== "function") {
        throw new TypeError("simulation runtime does not support generation checkpoints");
    }
    return {
        id: "simulation",
        version: 1,
        required: true,
        capture: () => runtime.createCheckpointSnapshot(),
        restore: (_context, snapshot) => runtime.restoreCheckpointSnapshot(snapshot)
    };
}

export function createWorldDeltaGenerationParticipant(
    descriptor: WorldDescriptorV2,
    store: WorldDeltaStore
): GenerationCheckpointParticipant<WorldDeltaCheckpoint> {
    if (!store || typeof store.saveBarrier !== "function" || typeof store.restoreBarrier !== "function") {
        throw new TypeError("world delta store does not support checkpoint barriers");
    }
    return {
        id: "world-delta-v3",
        version: 3,
        required: true,
        capture: () => store.saveBarrier(descriptor),
        restore: (_context, snapshot) => store.restoreBarrier(descriptor, snapshot)
    };
}

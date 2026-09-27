import { CombatSimulation } from "../../apps/survivor/src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../../apps/survivor/src/core/CharacterCheckpoint";
import { ProceduralCombatTerrain } from "../../apps/survivor/src/adapters/ProceduralCombatTerrain";

/** Review-only inputs; no overrides of terrain, materials, AI or gameplay RNG. */
export const VISUAL_SAMPLE = {
    seed: "visual-dark-10",
    viewport: { width: 2560, height: 1440 },
    camera: { offset: [-230, 330, 250], fov: 47 },
    stops: [
        { id: "forest", x: -37, z: 19 },
        { id: "clearing", x: -43, z: 19 },
        { id: "shore", x: 38, z: Math.sqrt(3) / 2 - 8 }
    ],
    warmupMs: 2000,
    sampleMs: 3000
} as const;

export function visualCheckpoints() {
    const terrain = new ProceduralCombatTerrain(VISUAL_SAMPLE.seed);
    try {
        const sim = new CombatSimulation(VISUAL_SAMPLE.seed, VISUAL_SAMPLE.stops[0], undefined, terrain);
        const initial = sim.checkpoint();
        return VISUAL_SAMPLE.stops.map(stop => {
            if (!terrain.isClear(stop.x, stop.z, .6)) throw new Error(`Visual sample ${stop.id} must be on clear ground`);
            return { id: stop.id, checkpoint: validateCharacterCheckpoint({ ...initial,
                player: { ...initial.player, x: stop.x, z: stop.z }, wildsPosition: { x: stop.x, z: stop.z }
            }) };
        });
    } finally { terrain.dispose(); }
}

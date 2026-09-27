import { CombatSimulation } from "../../apps/survivor/src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../../apps/survivor/src/core/CharacterCheckpoint";
import { ProceduralCombatTerrain } from "../../apps/survivor/src/adapters/ProceduralCombatTerrain";
import { CHALLENGE_ROUTE } from "../../apps/survivor/src/core/ChallengeLayout";
import { createChallengeScroll } from "../../apps/survivor/src/core/BossChallenge";
import { ChallengeTerrain } from "../../apps/survivor/src/core/ChallengeTerrain";

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

// The boss waypoint names its spawn; inspect from the approach instead of
// restoring the player inside the boss's body at the paused checkpoint.
export const ROUTE_SAMPLE = { ...VISUAL_SAMPLE, stops: CHALLENGE_ROUTE.map(stop => stop.id === "boss" ? { ...stop, z: stop.z + 4 } : stop) };
export function routeCheckpoints() {
    const terrain = new ChallengeTerrain(), sim = new CombatSimulation(VISUAL_SAMPLE.seed, { x: -37, z: 19 });
    try {
        const initial = sim.checkpoint();
        sim.restore({ ...initial, nextItemId: initial.nextItemId + 1, player: { ...initial.player,
            inventory: [...initial.player.inventory, createChallengeScroll(initial.nextItemId, "rift-lord")] } });
        const entered = sim.checkpoint("rift-lord");
        return ROUTE_SAMPLE.stops.map(stop => {
            if (!terrain.isClear(stop.x, stop.z, .6)) throw new Error(`Route ${stop.id} must be clear`);
            return { id: stop.id, checkpoint: validateCharacterCheckpoint({ ...entered,
                player: { ...entered.player, x: stop.x, z: stop.z },
                challenges: { ...entered.challenges, "rift-lord": { ...entered.challenges["rift-lord"]!, position: { x: stop.x, z: stop.z } } }
            }) };
        });
    } finally { sim.dispose(); terrain.dispose(); }
}

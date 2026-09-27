import { expect, test } from "vitest";
import { CHALLENGE_IDS, CHALLENGE_SPAWN, challengeSpawns } from "../src/core/BossChallenge";
import { CHALLENGE_PATH, CHALLENGE_SCENERY } from "../src/core/ChallengeLayout";
import { ChallengeTerrain } from "../src/core/ChallengeTerrain";
import { ENEMY_DEFINITIONS } from "../src/core/EnemyDefinitions";

test("the complete route can be swept in both directions without sliding or teleporting", () => {
    const terrain = new ChallengeTerrain();
    let position: { x: number; z: number } = CHALLENGE_SPAWN;
    for (const destination of [...CHALLENGE_PATH.slice(1), ...CHALLENGE_PATH.slice(0, -1).reverse()]) {
        position = terrain.move(position.x, position.z, destination.x - position.x, destination.z - position.z, .6, false);
        expect(position.x).toBeCloseTo(destination.x, 4); expect(position.z).toBeCloseTo(destination.z, 4);
    }
    expect(CHALLENGE_SCENERY.props.length).toBeLessThanOrEqual(256);
    expect(CHALLENGE_SCENERY.trees.length).toBeLessThanOrEqual(128);
});

test("all four encounters retain their complete population and body clearance", () => {
    const terrain = new ChallengeTerrain();
    for (const id of CHALLENGE_IDS) {
        const spawns = challengeSpawns(id, 1); expect(spawns).toHaveLength(61);
        for (const spawn of spawns) {
            const radius = ENEMY_DEFINITIONS[spawn.kind].radius * (spawn.boss ? 2.5 : spawn.elite ? 1.28 : 1);
            expect(terrain.isClear(spawn.x, spawn.z, radius), `${id} at ${spawn.x},${spawn.z}`).toBe(true);
        }
    }
    expect(terrain.isClear(30, 18.5 * Math.sqrt(3), 1)).toBe(true); // Reward chest remains reachable.
});

test("the fire pit blocks swept bodies and low projectiles but not shots above its rim", () => {
    const terrain = new ChallengeTerrain();
    expect(terrain.isClear(32.4, 50, .3)).toBe(false);
    const swept = terrain.move(32.4, 47, 0, 6, .3, false);
    expect(swept.z).toBeCloseTo(48.6, 2);
    expect(terrain.traceAttack(32.4, .25, 47, 32.4, .25, 53, .1)).toBeCloseTo(.3, 6);
    expect(terrain.traceAttack(32.4, 4, 47, 32.4, 4, 53, .1)).toBe(Infinity);
});

test("river clearance contains fast movement while water is not solid attack cover", () => {
    const terrain = new ChallengeTerrain();
    expect(terrain.isClear(12, 41, .3)).toBe(false);
    expect(terrain.isClear(16, 39, .6)).toBe(true);
    const swept = terrain.move(16, 41, -10, 0, .3, false);
    expect(swept.x).toBeCloseTo(14, 2);
    expect(terrain.traceAttack(5, 1, 41, 10, 1, 41, .1)).toBe(Infinity);
});

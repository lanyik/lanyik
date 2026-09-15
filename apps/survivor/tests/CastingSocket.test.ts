import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { ActorAction, CombatWorld } from "../src/core/CombatWorld";
import { RegionalWorld } from "../src/core/RegionalWorld";
import { EnemyKind } from "../src/core/EnemyDefinitions";
import { advanceEnemyActions } from "../src/core/CombatSystems";
import { SHAMAN_CAST_SOCKET } from "../src/core/ActorSockets.generated";

test("the committed volley shares the rotated and scaled baked casting hand", () => {
    for (const boss of [false, true]) for (const heading of [0, 1.2, Math.PI]) {
        const world = new CombatWorld(0, 0), regions = new RegionalWorld("socket", { x: 0, z: 0 });
        regions.synchronize(0, 0);
        const slot = world.spawnEnemy({ x: 3, z: 4, region: regions.regionAt(3, 4), kind: EnemyKind.Caster, level: 1, boss, elite: false }, regions.chunks.get("0,0")!);
        world.position.heading[slot] = heading; world.enemy.active[slot] = 1;
        world.action.kind[slot] = ActorAction.Cast; world.action.started[slot] = 0;
        world.action.hitAt[slot] = 20; world.action.endsAt[slot] = 40;
        world.action.target[slot] = world.world.ids[world.player]; world.action.variant[slot] = boss ? 3 : 1;
        advanceEnemyActions(world, 20); advanceEnemyActions(world, 21);
        expect(world.projectiles.count).toBe(boss ? 3 : 1);
        const scale = world.position.radius[slot] / .3, rotation = world.position.heading[slot];
        for (let i = 0; i < world.projectiles.count; i++) {
            const bolt = world.projectiles.slots[i];
            expect(world.position.x[bolt]).toBeCloseTo(3 + (SHAMAN_CAST_SOCKET[0] * Math.cos(rotation) + SHAMAN_CAST_SOCKET[2] * Math.sin(rotation)) * scale);
            expect(world.position.z[bolt]).toBeCloseTo(4 + (SHAMAN_CAST_SOCKET[2] * Math.cos(rotation) - SHAMAN_CAST_SOCKET[0] * Math.sin(rotation)) * scale);
            expect(world.projectile.y[bolt]).toBeCloseTo(SHAMAN_CAST_SOCKET[1] * scale);
        }
    }
});

test("the exported hand curve is the same source as the simulation release constant", () => {
    const bytes = readFileSync(new URL("../.assets/actors/Imp_Shaman.glb", import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const hand = gltf.nodes.find((node: { extras?: { castingHand?: number[] } }) => node.extras?.castingHand).extras.castingHand;
    expect(hand).toHaveLength(60);
    for (let axis = 0; axis < 3; axis++) expect((hand[11 * 3 + axis] + hand[12 * 3 + axis]) / 2).toBeCloseTo(SHAMAN_CAST_SOCKET[axis], 12);
    expect(hand[11 * 3 + 1]).toBeGreaterThan(hand[16 * 3 + 1]); // Raised hand versus relaxed idle.
});

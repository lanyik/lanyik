import { CHALLENGE_ARENA, CHALLENGE_SPAWN, challengeSpawns, type ChallengeId, type ChallengeProgress } from "./BossChallenge";
import { enemyStats } from "./EnemyDefinitions";
import { Component, type CombatWorld } from "./CombatWorld";
import type { CombatRewards } from "./CombatRewards";

export function newChallenge(id: ChallengeId, level: number, round: number): ChallengeProgress {
    return { level, round, position: CHALLENGE_SPAWN, claimed: false, loot: [], experience: [],
        enemies: challengeSpawns(id, level).map(spawn => ({ x: spawn.x, z: spawn.z,
            health: enemyStats(spawn.kind, level, 1, spawn.elite, spawn.boss).health * (spawn.boss ? CHALLENGE_ARENA.bossStrength : CHALLENGE_ARENA.normalStrength) })) };
}

/** Stable spawn handles survive ECS slot reuse; only living members are reconstructed. */
export class ChallengeEncounter {
    private readonly ids: number[] = [];
    public claimed: boolean;
    constructor(public readonly id: ChallengeId, private readonly state: ChallengeProgress, private readonly e: CombatWorld, private readonly rewards: CombatRewards) {
        this.claimed = state.claimed;
        const spawns = challengeSpawns(id, state.level), homes = Array.from({ length: 7 }, () => ({ resident: true }));
        for (let i = 0; i < spawns.length; i++) {
            const saved = state.enemies[i], spawn = spawns[i];
            if (saved.health === 0) { this.ids.push(0); continue; }
            const slot = e.spawnEnemy(spawn, homes[i === 0 ? 0 : 1 + Math.floor((i - 1) / 10)], spawn.boss ? CHALLENGE_ARENA.bossStrength : CHALLENGE_ARENA.normalStrength);
            e.position.x[slot] = e.position.previousX[slot] = saved.x; e.position.z[slot] = e.position.previousZ[slot] = saved.z;
            e.vitals.health[slot] = saved.health; e.updateSpatial(slot, Component.Enemy);
            this.ids.push(e.world.ids[slot]);
        }
        for (const drop of state.loot) rewards.drop(drop.item, drop.x, drop.z);
        for (const orb of state.experience) e.spawnExperience(orb.x, orb.z, orb.value);
    }
    public get cleared(): boolean { return this.e.enemies.count === 0; }
    public capture(x: number, z: number): ChallengeProgress {
        const e = this.e, p = e.position;
        return { level: this.state.level, round: this.state.round, claimed: this.claimed, position: { x, z },
            enemies: this.ids.map((id, index) => {
                const slot = id ? e.world.resolve(id) : -1;
                return slot < 0 ? { ...this.state.enemies[index], health: 0 } : { x: p.x[slot], z: p.z[slot], health: e.vitals.health[slot] };
            }),
            loot: Array.from(e.loot.slots.subarray(0, e.loot.count), slot => ({ x: p.x[slot], z: p.z[slot], item: this.rewards.groundItems.get(e.item.id[slot])! })),
            experience: Array.from(e.experience.slots.subarray(0, e.experience.count), slot => ({ x: p.x[slot], z: p.z[slot], value: e.experienceValue[slot] })) };
    }
}

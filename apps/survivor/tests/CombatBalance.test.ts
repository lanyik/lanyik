import { expect, test } from "vitest";
import { balanceEncounter } from "./helpers/balanceReference";
import { BOSS_KINDS, type EnemyKind } from "../src/core/EnemyDefinitions";

test("same-level complete blue equipment retains distinct threats through level 100", () => {
    const bands = [[5,8], [3,6], [11,16], [6,10], [8,13], [2,5], [15,23]];
    for (const level of [1, 10, 25, 50, 100]) for (let role = 0; role < bands.length; role++) {
        const boss = role === 6;
        const samples = Array.from({ length: 64 }, (_, sample) => balanceEncounter(level, sample, (boss ? 3 : role) as EnemyKind, boss, boss, boss ? 1.6 : 1));
        const hits = samples.map(row => row.hitPercent).sort((a,b) => a-b), ttks = samples.map(row => row.basicTtk).sort((a,b) => a-b);
        expect(hits[32], `level ${level}, role ${role}`).toBeGreaterThan(bands[role][0]);
        expect(hits[32], `level ${level}, role ${role}`).toBeLessThan(bands[role][1]);
        expect(ttks[32]).toBeGreaterThan(boss ? 20 : .3);
        expect(ttks[32]).toBeLessThan(boss ? 35 : 3);
    }
});

test("each new boss retains a readable basic-hit threat and bounded same-level health", () => {
    for (const kind of BOSS_KINDS.slice(1)) for (const level of [1, 25, 100]) {
        const samples = Array.from({ length: 64 }, (_, sample) => balanceEncounter(level, sample, kind, true, true, 1.6));
        const hits = samples.map(row => row.hitPercent).sort((a, b) => a - b);
        const times = samples.map(row => row.basicTtk).sort((a, b) => a - b);
        expect(hits[32]).toBeGreaterThan(13); expect(hits[32]).toBeLessThan(23);
        expect(times[32]).toBeGreaterThan(20); expect(times[32]).toBeLessThan(36);
    }
});

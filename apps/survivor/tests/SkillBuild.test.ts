import { expect, test } from "vitest";
import { SkillBuild, SKILL_NODES, initialSkillRanks, investedPoints, nodeIndex, validateSkillRanks } from "../src/core/SkillBuild";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";

function ranks(values: Record<string, number>) {
    const result = initialSkillRanks(); for (const [id, value] of Object.entries(values)) result[nodeIndex(id)] = value; return result;
}

test("frost catalog is a rooted tree with unique nodes and real side-branch consumers", () => {
    expect(SKILL_NODES.filter(node => node.frost)).toHaveLength(34);
    expect(new Set(SKILL_NODES.map(node => node.id)).size).toBe(SKILL_NODES.length);
    for (const node of SKILL_NODES) {
        const visited = new Set<string>(); let current = node;
        while (current.parent) {
            expect(visited.has(current.id)).toBe(false); visited.add(current.id);
            current = SKILL_NODES[nodeIndex(current.parent)]; expect(current).toBeDefined();
        }
    }
    const build = new SkillBuild(); build.points = 100;
    expect(build.commit(ranks({ icebolt: 5, "icebolt.power": 2, "icebolt.shape": 3, "icebolt.tempo": 4, "frost.study": 2 }), 0, 101, false)).toBeNull();
    expect(build.modifiers.icebolt).toMatchObject({ power: 2, shape: 3, tempo: 4, damage: 2 });
    expect(build.modifiers.frost).toMatchObject({ power: 0, damage: 2 });
});

test("invalid and stale transactions are atomic; refunds require home and never create points", () => {
    const build = new SkillBuild(); build.points = 7;
    const legal = ranks({ icebolt: 3, "icebolt.power": 3, frost: 1 });
    expect(build.commit(legal, 0, 8, false)).toBeNull(); expect(build.points).toBe(0);
    const before = build.snapshot();
    expect(build.commit(initialSkillRanks(), 0, 8, true)).not.toBeNull();
    expect(build.commit(initialSkillRanks(), 1, 8, false)).not.toBeNull();
    expect(build.commit(ranks({ frost: 1 }), 1, 8, true)).not.toBeNull();
    expect(build.snapshot()).toEqual(before); expect(build.points).toBe(0);
    expect(build.commit(initialSkillRanks(), 1, 8, true)).toBeNull();
    expect(build.points).toBe(7); expect(build.revision).toBe(2);
    expect(build.commit(initialSkillRanks(), 2, 8, true)).toBeNull(); expect(build.revision).toBe(2);
});

test("level, rank, parent, investment and mutually exclusive mastery gates cannot be bypassed", () => {
    for (const invalid of [ranks({ icebolt: 11 }), ranks({ icebolt: NaN }), ranks({ icelance: 1 }), ranks({ icebolt: 3, icelance: 1 }), ranks({ "frost.study": 2 })]) {
        expect(validateSkillRanks(invalid, 100)).not.toBeNull();
    }
    const mutualInvestment = ranks({ icebolt: 3, icelance: 3, icestorm: 3, "frost.duration": 5, "frost.resilience": 5, "frost.economy": 5 });
    expect(validateSkillRanks(mutualInvestment, 100)).toContain("先行");
    const high = ranks({ icebolt: 10, "icebolt.power": 5, "icebolt.shape": 5, "icebolt.tempo": 5, icelance: 5, icestorm: 5, frost: 5, blizzard: 5, shatter: 1, absolutezero: 1, "frost.shatter": 1 });
    expect(validateSkillRanks(high, 100)).toBeNull();
    expect(validateSkillRanks(high, 44)).not.toBeNull();
    high[nodeIndex("frost.winter")] = 1; expect(validateSkillRanks(high, 100)).toContain("互斥");
});

test("save validation enforces the complete point ledger, six slots and status bounds", () => {
    const simulation = new CombatSimulation("build-save"), save = simulation.checkpoint();
    expect(validateCharacterCheckpoint(save)).toEqual(save);
    expect(() => validateCharacterCheckpoint({ ...save, skills: { ...save.skills, points: 1 } })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...save, skills: { ...save.skills, loadout: ["pulse", "chain", "dash", "pulse", null, null] } })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...save, skills: { ...save.skills, loadout: ["pulse", "chain", "dash", "icebolt", null, null] } })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...save, skills: { ...save.skills, statuses: [{ kind: 4, source: 1, amount: 1, remaining: Infinity }] } })).toThrow();
    const learned = ranks({ icebolt: 3, "icebolt.power": 3, frost: 1 });
    const valid = { ...save, player: { ...save.player, level: 8 }, skills: { ...save.skills, points: 7 - investedPoints(learned), ranks: learned } };
    simulation.restore(valid); expect(simulation.checkpoint().skills.ranks).toEqual(learned);
    simulation.dispose();
});

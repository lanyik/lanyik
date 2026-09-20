import { expect, test } from "vitest";
import { SkillBuild, SKILL_NODES, initialSkillRanks, investedPoints, nodeIndex, validateSkillRanks } from "../src/core/SkillBuild";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { deriveStats } from "../src/core/CombatStats";
import { sumEquipment } from "../src/core/Equipment";
import { FIRE_SKILLS, NO_SKILL_MODIFIERS, isUltimate, skillValues } from "../src/core/Skills";

function ranks(values: Record<string, number>) {
    const result = initialSkillRanks(); for (const [id, value] of Object.entries(values)) result[nodeIndex(id)] = value; return result;
}

test("frost catalog is a rooted tree with unique nodes and real side-branch consumers", () => {
    expect(SKILL_NODES.filter(node => node.school === "frost")).toHaveLength(34);
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

test("fire has 34 functional nodes, independent investment gates and its own exclusive masteries", () => {
    expect(SKILL_NODES.filter(node => node.school === "fire")).toHaveLength(34); expect(SKILL_NODES).toHaveLength(74);
    expect(validateSkillRanks(ranks({ icebolt: 10, fireball: 3, fireray: 1 }), 100)).not.toBeNull();
    const fire = ranks({ fireball: 10, "fireball.power": 5, "fireball.shape": 5, "fireball.tempo": 5, fireray: 5, pyroblast: 5,
        firewall: 5, meteor: 5, firedomain: 1, doom: 1, "fire.wildfire": 3,
        icebolt: 10, "icebolt.power": 5, "icebolt.shape": 5, "icebolt.tempo": 5, icelance: 3, icestorm: 3, "frost.shatter": 1 });
    expect(validateSkillRanks(fire, 100)).toBeNull();
    fire[nodeIndex("fire.combustion")] = 1; expect(validateSkillRanks(fire, 100)).toContain("互斥");
    const stats = deriveStats(1, { might: 5, vitality: 5, agility: 5, spirit: 5 }, sumEquipment({}));
    for (const id of FIRE_SKILLS) {
        const base = skillValues(id, 1, stats), powerful = skillValues(id, 1, stats, { ...NO_SKILL_MODIFIERS, power: 5 });
        expect(powerful.damage).toBeGreaterThan(base.damage);
        const shape = skillValues(id, 1, stats, { ...NO_SKILL_MODIFIERS, shape: 5 });
        expect(id === "pyroblast" ? shape.targets : shape.radius).toBeGreaterThan(id === "pyroblast" ? base.targets : base.radius);
        const tempo = skillValues(id, 1, stats, { ...NO_SKILL_MODIFIERS, tempo: 5 });
        expect(tempo).not.toEqual(base);
        const ultimateSpeed = skillValues(id, 1, { ...stats, castSpeed: 100 });
        expect(ultimateSpeed.cooldown).toBe(isUltimate(id) ? 10 : .5);
    }
    const combustion = skillValues("meteor", 10, stats, { ...NO_SKILL_MODIFIERS, combustion: 3, tempo: 5 });
    expect(combustion.fire!.detonation).toBe(.8);
    const wildfire = skillValues("fireball", 1, stats, { ...NO_SKILL_MODIFIERS, wildfire: 3 });
    expect(wildfire.fire!.stackLimit).toBe(8); expect(wildfire.damage).toBeCloseTo(.75 * .85);
    expect(wildfire.fire!.burnDamage).toBeCloseTo(.06 * 1.24);
});

import { afterEach, expect, test, vi } from "vitest";
import { Matrix4, Texture } from "three";
import { AssetLoader } from "../src/presentation/AssetLoader";
import { SkillEffects } from "../src/presentation/SkillEffects";
import { CombatEffects, EffectKind, fireShotArrays } from "../src/core/CombatEffects";
import { GAME_CONFIG } from "../src/core/GameConfig";

const emptyShots = { ...fireShotArrays((Type, n) => new Type(n)), count: 0 };

afterEach(() => vi.restoreAllMocks());
test("enemy facts never generate player rune instances", async () => {
    vi.spyOn(AssetLoader.prototype, "texture").mockResolvedValue(new Texture());
    const effects = await SkillEffects.load(new AbortController().signal), facts = new CombatEffects();
    try {
        for (const kind of [EffectKind.Heal, EffectKind.EnemyReave, EffectKind.EnemyJaws, EffectKind.EnemyFault, EffectKind.EnemyQuake]) facts.add(kind, 0, 0, 0, 4, 1);
        effects.update(facts.buffer, .5, () => 0, 0, 0, 0, emptyShots, 1);
        expect(effects.mesh.count).toBe(0); expect(effects.ward.visible).toBe(false);
    } finally { effects.dispose(); }
});
test("ground rings use the projection pass and lightning ribbons follow their endpoints in height", async () => {
    vi.spyOn(AssetLoader.prototype, "texture").mockResolvedValue(new Texture());
    const effects = await SkillEffects.load(new AbortController().signal), facts = new CombatEffects();
    try {
        facts.add(EffectKind.Lightning, 0, 0, 0, .4, 1, 4, 0);
        effects.update(facts.buffer, .5, x => x * 2, 0, 0, 0, emptyShots, 1);
        const matrix = new Matrix4(); effects.mesh.getMatrixAt(0, matrix);
        expect(matrix.elements[5] / matrix.elements[4]).toBeCloseTo(2.005, 5);
        facts.buffer.count = 0; facts.add(EffectKind.Pulse, 0, 0, 0, 4, 1);
        effects.update(facts.buffer, .5, () => 10, 0, 0, 0, emptyShots, 1);
        const styles = effects.ground.geometry.getAttribute("effectStyle");
        for (let i = 0; i < 3; i++) {
            expect(styles.getW(i)).toBeGreaterThanOrEqual(8);
            effects.ground.getMatrixAt(i, matrix); expect(matrix.elements[13]).toBe(0);
        }
        expect(effects.ground.instanceMatrix).toBe(effects.mesh.instanceMatrix);
    } finally { effects.dispose(); }
});
test.each([EffectKind.Frost])("maximum visual facts %i fit the instance pool, freeze with simulation and release owned resources", async kind => {
    const texture = new Texture<HTMLImageElement>();
    vi.spyOn(AssetLoader.prototype, "texture").mockResolvedValue(texture);
    const effects = await SkillEffects.load(new AbortController().signal), facts = new CombatEffects();
    const mapDisposed = vi.fn(), geometryDisposed = vi.fn(), wardDisposed = vi.fn();
    texture.addEventListener("dispose", mapDisposed);
    effects.mesh.geometry.addEventListener("dispose", geometryDisposed);
    effects.ward.geometry.addEventListener("dispose", wardDisposed);
    try {
        // Frost has the largest player choreography: 31 instances per fact.
        for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) facts.add(kind, 0, i % 8, Math.floor(i / 8), 4, 1);
        const height = () => 0;
        effects.update(facts.buffer, .5, height, 2, 3, 20, emptyShots, 1);
        expect(effects.mesh.count).toBe(31 * GAME_CONFIG.skills.maxEffects + 7);
        expect(effects.mesh.count).toBeLessThanOrEqual(GAME_CONFIG.presentation.effectInstances);
        const matrices = effects.mesh.instanceMatrix.array.slice();
        expect(matrices.every(Number.isFinite)).toBe(true);
        effects.update(facts.buffer, .5, height, 2, 3, 20, emptyShots, 1);
        expect(effects.mesh.instanceMatrix.array).toEqual(matrices);
        effects.update(facts.buffer, 2, height, 8, -2, 20, emptyShots, 1);
        expect(effects.mesh.count).toBe(7); expect(effects.ward.visible).toBe(true);
        expect(effects.ward.position.x).toBe(0); expect(effects.ward.position.z).toBe(0);
        effects.update(facts.buffer, 2, height, 8, -2, 0, emptyShots, 1);
        expect(effects.mesh.count).toBe(0); expect(effects.ward.visible).toBe(false);
        effects.reset(); expect(effects.mesh.count).toBe(0);
    } finally { effects.dispose(); }
    expect(mapDisposed).toHaveBeenCalledTimes(1); expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(wardDisposed).toHaveBeenCalledTimes(1);
});

test("effect matrices retain sub-tile motion at large logical coordinates", async () => {
    vi.spyOn(AssetLoader.prototype, "texture").mockResolvedValue(new Texture());
    const effects = await SkillEffects.load(new AbortController().signal), facts = new CombatEffects();
    const origin = 2 ** 27;
    try {
        facts.add(EffectKind.Pulse, 0, origin + .125, -origin + .25, 4, 1);
        effects.update(facts.buffer, .5, () => 0, origin, -origin, 0, emptyShots, 1);
        const matrix = new Matrix4(); effects.ground.getMatrixAt(0, matrix);
        expect(matrix.elements[12]).toBe(.125);
        expect(matrix.elements[14]).toBe(.25);
    } finally { effects.dispose(); }
});

test.each([EffectKind.Meteor, EffectKind.MeteorImpact, EffectKind.Vortex, EffectKind.Blades, EffectKind.Shatter,
    EffectKind.FireRay, EffectKind.FireWall, EffectKind.FireDomain, EffectKind.FireImpact, EffectKind.Doom, EffectKind.Detonation,
    EffectKind.ThunderLance, EffectKind.ThunderWarning, EffectKind.ThunderImpact, EffectKind.ThunderField, EffectKind.JudgmentWarning, EffectKind.JudgmentImpact, EffectKind.Tempest,
    EffectKind.StarBolt, EffectKind.Infusion, EffectKind.Resonance, EffectKind.Shelter, EffectKind.Cleanse, EffectKind.Bastion])("new choreography %i is bounded, deterministic and uses finite local transforms", async kind => {
    vi.spyOn(AssetLoader.prototype, "texture").mockResolvedValue(new Texture());
    const effects = await SkillEffects.load(new AbortController().signal), facts = new CombatEffects();
    try {
        for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) facts.add(kind, 0, 1, 2, 3, 4);
        effects.update(facts.buffer, .5, () => 0, 10, 20, 1, emptyShots, 1);
        expect(effects.mesh.count).toBeGreaterThan(7);
        expect(effects.mesh.count).toBeLessThanOrEqual(GAME_CONFIG.presentation.effectInstances);
        const before = effects.mesh.instanceMatrix.array.slice();
        expect(before.every(Number.isFinite)).toBe(true);
        effects.update(facts.buffer, .5, () => 0, 10, 20, 1, emptyShots, 1);
        expect(effects.mesh.instanceMatrix.array).toEqual(before);
        if (kind === EffectKind.Blades) {
            const matrix = new Matrix4(); effects.mesh.getMatrixAt(0, matrix);
            expect(matrix.elements[12]).toBe(0); expect(matrix.elements[14]).toBe(0);
        }
    } finally { effects.dispose(); }
});

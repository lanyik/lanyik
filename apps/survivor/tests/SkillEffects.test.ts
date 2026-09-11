import { afterEach, expect, test, vi } from "vitest";
import { Matrix4, Texture, TextureLoader } from "three";
import { SkillEffects } from "../src/presentation/SkillEffects";
import { CombatEffects, EffectKind } from "../src/core/CombatEffects";
import { GAME_CONFIG } from "../src/core/GameConfig";

afterEach(() => vi.restoreAllMocks());
test("ground rings use the projection pass and lightning ribbons follow their endpoints in height", async () => {
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(new Texture());
    const effects = await SkillEffects.load(), facts = new CombatEffects();
    try {
        facts.add(EffectKind.Lightning, 0, 0, 0, .4, 1, 4, 0);
        effects.update(facts.buffer, .5, x => x * 2, 0, 0, 0);
        const matrix = new Matrix4(); effects.mesh.getMatrixAt(0, matrix);
        expect(matrix.elements[5] / matrix.elements[4]).toBeCloseTo(2.005, 5);
        facts.buffer.count = 0; facts.add(EffectKind.Pulse, 0, 0, 0, 4, 1);
        effects.update(facts.buffer, .5, () => 10, 0, 0, 0);
        const styles = effects.ground.geometry.getAttribute("effectStyle");
        for (let i = 0; i < 3; i++) {
            expect(styles.getW(i)).toBeGreaterThanOrEqual(8);
            effects.ground.getMatrixAt(i, matrix); expect(matrix.elements[13]).toBe(0);
        }
        expect(effects.ground.instanceMatrix).toBe(effects.mesh.instanceMatrix);
    } finally { effects.dispose(); }
});
test("maximum visual facts fit the instance pool, freeze with simulation and release owned resources", async () => {
    const texture = new Texture<HTMLImageElement>();
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
    const effects = await SkillEffects.load(), facts = new CombatEffects();
    const mapDisposed = vi.fn(), geometryDisposed = vi.fn(), wardDisposed = vi.fn();
    texture.addEventListener("dispose", mapDisposed);
    effects.mesh.geometry.addEventListener("dispose", geometryDisposed);
    effects.ward.geometry.addEventListener("dispose", wardDisposed);
    try {
        // Frost is the largest choreography: 31 instances per fact, plus the persistent ward.
        for (let i = 0; i < GAME_CONFIG.skills.maxEffects; i++) facts.add(EffectKind.Frost, 0, i % 8, Math.floor(i / 8), 4, 1);
        const height = () => 0;
        effects.update(facts.buffer, .5, height, 2, 3, 20);
        expect(effects.mesh.count).toBe(31 * GAME_CONFIG.skills.maxEffects + 7);
        expect(effects.mesh.count).toBeLessThanOrEqual(GAME_CONFIG.presentation.effectInstances);
        const matrices = effects.mesh.instanceMatrix.array.slice();
        expect(matrices.every(Number.isFinite)).toBe(true);
        effects.update(facts.buffer, .5, height, 2, 3, 20);
        expect(effects.mesh.instanceMatrix.array).toEqual(matrices);
        effects.update(facts.buffer, 2, height, 8, -2, 20);
        expect(effects.mesh.count).toBe(7); expect(effects.ward.visible).toBe(true);
        expect(effects.ward.position.x).toBe(8); expect(effects.ward.position.z).toBe(-2);
        effects.update(facts.buffer, 2, height, 8, -2, 0);
        expect(effects.mesh.count).toBe(0); expect(effects.ward.visible).toBe(false);
        effects.reset(); expect(effects.mesh.count).toBe(0);
    } finally { effects.dispose(); }
    expect(mapDisposed).toHaveBeenCalledTimes(1); expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(wardDisposed).toHaveBeenCalledTimes(1);
});

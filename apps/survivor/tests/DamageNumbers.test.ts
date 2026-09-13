import { expect, test, vi } from "vitest";
import type { BufferAttribute } from "three";
import { DamageNumbers, damageLabel } from "../src/presentation/DamageNumbers";
import { CombatText, CombatTextKind as Kind } from "../src/core/CombatText";

test("labels cover mitigation, tiny damage and large values within the shared glyph budget", () => {
    expect(damageLabel(Kind.Shield, 0)).toBe("护盾"); expect(damageLabel(Kind.Dodge, 0)).toBe("闪避");
    expect(damageLabel(Kind.Block, 0)).toBe("格挡"); expect(damageLabel(Kind.PlayerCritical, 12.4)).toBe("-12!");
    expect(damageLabel(Kind.EnemyDamage, .2)).toBe("0.2");
    for (const value of [1, 999, 999999, 1e8, 1e99, Number.MAX_VALUE]) for (let kind = 0; kind < 8; kind++) expect(damageLabel(kind, value).length).toBeLessThanOrEqual(10);
});

test("256 paused hit facts share one mesh and atlas, with bounded uploads and explicit release", () => {
    const context = { strokeText: vi.fn(), fillText: vi.fn() };
    const numbers = new DamageNumbers({ getContext: () => context } as unknown as HTMLCanvasElement);
    const text = new CombatText();
    for (let i = 0; i < 256; i++) text.add(i, i % 8, 12345, i % 4, 2, 0);
    numbers.update(text.buffer, .2, () => 0, 0, 0);
    const mesh = numbers.mesh, count = mesh.geometry.instanceCount;
    expect(count).toBeGreaterThan(256); expect(count).toBeLessThanOrEqual(2560);
    const anchor = mesh.geometry.getAttribute("anchor") as BufferAttribute, before = anchor.array.slice();
    numbers.update(text.buffer, .2, () => 0, 0, 0);
    expect(anchor.array).toEqual(before); expect(Array.from(anchor.array).every(Number.isFinite)).toBe(true);
    expect(anchor.updateRanges).toEqual([{ start: 0, count: count * 3 }]);
    numbers.update(text.buffer, 1, () => 0, 0, 0); expect(mesh.visible).toBe(false);
    const material = vi.fn(), geometry = vi.fn(), texture = vi.fn();
    mesh.material.addEventListener("dispose", material); mesh.geometry.addEventListener("dispose", geometry);
    mesh.material.uniforms.atlas.value.addEventListener("dispose", texture);
    numbers.dispose(); expect(material).toHaveBeenCalledOnce(); expect(geometry).toHaveBeenCalledOnce(); expect(texture).toHaveBeenCalledOnce();
});

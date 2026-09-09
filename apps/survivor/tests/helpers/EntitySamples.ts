import type { CombatRenderState } from "../../src/core/CombatState";

/** Detached observations for assertions spanning simulation mutations. */
export function enemySamples(state: CombatRenderState) {
    const { enemies, ids, position } = state.entities;
    return Array.from({ length: enemies.count }, (_, cursor) => {
        const slot = enemies.slots[cursor];
        return { id: ids[slot], x: position.x[slot], z: position.z[slot] };
    });
}

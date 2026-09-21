import type { CombatSnapshot } from "../core/CombatState";

/** Structured clone loses identities. Reuse equal immutable domain branches before notifying React. */
function share<T>(previous: T | undefined, next: T): T {
    if (previous === next) return next;
    if (!previous || !next || typeof previous !== "object" || typeof next !== "object" || Array.isArray(previous) !== Array.isArray(next)) return next;
    const keys = Object.keys(next);
    const sameShape = keys.length === Object.keys(previous).length && (!Array.isArray(next) || next.length === (previous as unknown[]).length);
    let result: Record<string, unknown> | undefined;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const before = (previous as Record<string, unknown>)[key], after = (next as Record<string, unknown>)[key];
        const shared = share(before, after);
        if (!result && (!sameShape || shared !== before || !Object.hasOwn(previous, key))) {
            result = (Array.isArray(next) ? new Array(next.length) : {}) as Record<string, unknown>;
            // All preceding children matched. Copy their retained identities only when this branch changes.
            for (let j = 0; j < i; j++) result[keys[j]] = (previous as Record<string, unknown>)[keys[j]];
        }
        if (result) result[key] = shared;
    }
    return (result ?? (sameShape ? previous : next)) as T;
}
export function shareSnapshot(previous: CombatSnapshot | undefined, next: CombatSnapshot): CombatSnapshot {
    if (!previous) return next;
    const before = previous.player, after = next.player;
    return { ...next, player: { ...after,
        inventory: share(before.inventory, after.inventory), equipment: share(before.equipment, after.equipment),
        attributes: share(before.attributes, after.attributes), stats: share(before.stats, after.stats),
        orbs: share(before.orbs, after.orbs), autoRecycle: share(before.autoRecycle, after.autoRecycle),
        recycled: share(before.recycled, after.recycled), spiritRealm: share(before.spiritRealm, after.spiritRealm),
        orbResonance: share(before.orbResonance, after.orbResonance), skills: share(before.skills, after.skills)
    } };
}

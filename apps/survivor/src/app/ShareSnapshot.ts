import type { CombatSnapshot } from "../core/CombatState";

/** Structured clone loses identities. Reuse equal immutable domain branches before notifying React. */
function share<T>(previous: T | undefined, next: T): T {
    if (previous === next) return next;
    if (!previous || !next || typeof previous !== "object" || typeof next !== "object" || Array.isArray(previous) !== Array.isArray(next)) return next;
    const keys = Object.keys(next), oldKeys = Object.keys(previous);
    let same = keys.length === oldKeys.length && (!Array.isArray(next) || next.length === (previous as unknown[]).length);
    const result = (Array.isArray(next) ? new Array(next.length) : {}) as Record<string, unknown>;
    for (const key of keys) {
        const before = (previous as Record<string, unknown>)[key], after = (next as Record<string, unknown>)[key];
        result[key] = share(before, after);
        if (result[key] !== before || !Object.hasOwn(previous, key)) same = false;
    }
    return same ? previous : result as T;
}
export function shareSnapshot(previous: CombatSnapshot | undefined, next: CombatSnapshot): CombatSnapshot {
    if (!previous) return next;
    const player = { ...next.player };
    for (const key of ["inventory", "equipment", "attributes", "stats", "orbs", "autoRecycle", "recycled", "spiritRealm", "orbResonance"] as const) {
        Object.assign(player, { [key]: share(previous.player[key], player[key]) });
    }
    return { ...next, player };
}

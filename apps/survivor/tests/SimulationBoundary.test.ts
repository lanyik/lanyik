import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { resolveProjectileRange, type ProjectileBatch } from "../src/core/ProjectileBatch";

const idle = { x: 0, z: 0, active: false };

function pendingQuery() {
    let resolve!: () => void, reject!: (reason: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const executor = { resolve: (batch: ProjectileBatch) => promise.then(() => resolveProjectileRange(batch)) };
    return { executor, resolve, reject };
}

test("required queries block another tick and preserve serial combat results", async () => {
    const combat = new CombatSimulation("required-boundary"), serial = new CombatSimulation("required-boundary");
    const query = pendingQuery();
    const step = combat.step(idle, query.executor);
    expect(() => combat.step(idle)).toThrow(/awaiting required queries/);
    expect(combat.tick).toBe(1);
    query.resolve(); await step;
    serial.step(idle);
    expect(combat.getSnapshot()).toEqual(serial.getSnapshot());
    combat.step(idle); serial.step(idle);
    expect(combat.getSnapshot()).toEqual(serial.getSnapshot());
    combat.dispose(); serial.dispose();
});

test("a query failure closes the partially advanced simulation", async () => {
    const combat = new CombatSimulation("required-failure"), query = pendingQuery();
    const step = combat.step(idle, query.executor);
    query.reject(new Error("query failed"));
    await expect(step).rejects.toThrow("query failed");
    expect(() => combat.step(idle)).toThrow(/closed/);
    expect(combat.tick).toBe(1);
});

test("closing while a query is pending prevents the rest of the tick and later steps", async () => {
    const combat = new CombatSimulation("required-close"), query = pendingQuery();
    const step = combat.step(idle, query.executor);
    const before = combat.getSnapshot();
    combat.dispose(); query.resolve();
    await expect(step).rejects.toThrow(/closed during required queries/);
    expect(combat.getSnapshot()).toBe(before);
    expect(() => combat.step(idle)).toThrow(/closed/);
});

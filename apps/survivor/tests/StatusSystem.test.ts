import { expect, test } from "vitest";
import { EntityWorld } from "../src/core/EntityWorld";
import { StatusKind as Kind, StatusSystem, ControlProfile } from "../src/core/StatusSystem";

test("independent source expiry never lets weak refresh extend the stronger status", () => {
    const world = new EntityWorld(3), status = new StatusSystem(world);
    const a = world.create(1), b = world.create(1), source = world.ids[a], target = world.ids[b];
    status.apply(Kind.Slow, source, target, .5, 10, 0);
    status.apply(Kind.Slow, target, target, .2, 20, 1);
    status.apply(Kind.Protection, target, target, .25, 15, 1);
    expect(status.amount(Kind.Slow, b, 9)).toBe(.5);
    expect(status.amount(Kind.Slow, b, 19)).toBe(.2);
    expect(status.source(Kind.Slow, b)).toBe(source);
    expect(status.slowScale[b]).toBe(.5);
    world.destroy(source); // The applied effect survives its source.
    status.advance(15);
    expect(status.slowScale[b]).toBeCloseTo(.8);
    expect(status.source(Kind.Slow, b)).toBe(target);
    expect(status.wardUntil[b]).toBe(0);
    expect(status.slowUntil[b]).toBe(20);
    status.advance(20);
    expect(status.slowScale[b]).toBe(1);
    expect(status.source(Kind.Slow, b)).toBe(0);
    status.apply(Kind.Slow, target, target, .1, 30, 20);
    expect(status.amount(Kind.Slow, b, 20)).toBe(.1);
});

test("simultaneous expiry publishes every target before subsequent movement, hits and slot reuse", () => {
    const world = new EntityWorld(3), status = new StatusSystem(world);
    const slots = [world.create(1), world.create(1), world.create(1)];
    for (const slot of slots) {
        const target = world.ids[slot];
        for (let source = 1; source <= 4; source++) {
            status.apply(Kind.Slow, source, target, .1 * source, 60, 0);
            status.apply(Kind.Chill, source, target, source, 60, 0);
            status.apply(Kind.Protection, source, target, .1 * source, 60, 0);
        }
        status.apply(Kind.Frozen, target, target, 1, 60, 0);
        status.apply(Kind.Conductive, target, target, 1, 60, 0);
        status.apply(Kind.StaticGuard, target, target, .05, 90, 0);
    }
    status.advance(60);
    for (const slot of slots) {
        expect(status.slowUntil[slot]).toBe(0); expect(status.slowScale[slot]).toBe(1);
        expect(status.wardUntil[slot]).toBe(0); expect(status.conductiveUntil[slot]).toBe(0);
        expect(status.canMove(slot, 60)).toBe(true); expect(status.protection(slot, 60)).toBe(.05);
        expect(status.deadline(Kind.ControlResistance, slot)).toBe(420);
        expect(status.apply(Kind.Frozen, 1, world.ids[slot], 1, 90, 60)).toBe(false);
    }
    const slot = slots[1]; status.clear(slot); world.destroy(world.ids[slot]); expect(world.create(1)).toBe(slot);
    status.apply(Kind.Slow, 1, world.ids[slot], .2, 100, 60);
    status.advance(90); expect(status.slowScale[slot]).toBeCloseTo(.8);
    expect(slots.map(s => status.staticGuardUntil[s])).toEqual([0, 0, 0]);
    status.advance(100); expect(status.slowScale[slot]).toBe(1);
    status.advance(420); expect(slots.map(s => status.save(s, 420))).toEqual([[], [], []]);
});

test("barriers reject equal or weaker refresh, clamp absorption, and can be reapplied immediately on depletion", () => {
    const world = new EntityWorld(1), status = new StatusSystem(world), slot = world.create(1), id = world.ids[slot];
    expect(status.apply(Kind.Barrier, id, id, 10, 20, 0)).toBe(true);
    for (const damage of [-1, NaN, Infinity]) expect(() => status.absorb(slot, damage, 0)).toThrow(RangeError);
    expect(status.amount(Kind.Barrier, slot, 0)).toBe(10);
    expect(status.apply(Kind.Barrier, id, id, 10, 30, 1)).toBe(false);
    expect(status.absorb(slot, 7, 1)).toBe(0);
    expect(status.amount(Kind.Barrier, slot, 1)).toBe(3);
    expect(status.absorb(slot, 8, 2)).toBe(5);
    expect(status.deadline(Kind.Barrier, slot)).toBe(0);
    expect(status.apply(Kind.Barrier, id, id, 4, 30, 2)).toBe(true);
    expect(status.absorb(slot, 2, 30)).toBe(2);
});

test("removed targets cannot apply effects to a reused slot; invalid magnitudes fail explicitly", () => {
    const world = new EntityWorld(1), status = new StatusSystem(world), slot = world.create(1), old = world.ids[slot];
    status.apply(Kind.Protection, old, old, .25, 10, 0);
    status.clear(slot); world.destroy(old); world.create(1);
    expect(status.apply(Kind.Protection, old, old, .5, 20, 0)).toBe(false);
    expect(status.amount(Kind.Protection, slot, 1)).toBe(0);
    for (const amount of [NaN, Infinity, -1, 0, 1.1]) {
        expect(() => status.apply(Kind.Slow, world.ids[slot], world.ids[slot], amount, 10, 0)).toThrow(RangeError);
    }
});

test("same-source refresh replaces the whole instance and capacity keeps four stronger sources", () => {
    const world = new EntityWorld(8), status = new StatusSystem(world), slot = world.create(1), target = world.ids[slot];
    const ids = Array.from({ length: 6 }, () => world.ids[world.create(1)]);
    ids.slice(0, 4).forEach((id, i) => status.apply(Kind.Slow, id, target, .1 + i * .1, 30, 0));
    expect(status.apply(Kind.Slow, ids[4], target, .05, 100, 1)).toBe(false);
    expect(status.apply(Kind.Slow, ids[5], target, .6, 10, 1)).toBe(true);
    expect(status.save(slot, 1)).toHaveLength(4);
    status.apply(Kind.Slow, ids[5], target, .15, 5, 2);
    expect(status.amount(Kind.Slow, slot, 2)).toBeCloseTo(.4);
    status.advance(5); expect(status.save(slot, 5)).toHaveLength(3);
    status.advance(30); expect(status.slowScale[slot]).toBe(1);
});

test("five chill stacks freeze once; natural and consumed freezes grant an independent resistance window", () => {
    const world = new EntityWorld(1), status = new StatusSystem(world), slot = world.create(1), id = world.ids[slot];
    status.chill(id, id, 4, 300, 0, 120);
    expect(status.slowScale[slot]).toBeCloseTo(.76); expect(status.canAct(slot, 0)).toBe(true);
    status.chill(id, id, 1, 300, 1, 120);
    expect(status.frozenUntil[slot]).toBe(121); expect(status.amount(Kind.Chill, slot, 1)).toBe(0);
    expect(status.apply(Kind.Frozen, id, id, 1, 500, 2)).toBe(false);
    status.advance(121); expect(status.canMove(slot, 121)).toBe(true);
    expect(status.deadline(Kind.ControlResistance, slot)).toBe(481);
    status.chill(id, id, 5, 600, 200, 120); expect(status.canAct(slot, 200)).toBe(true);
    status.advance(481); status.chill(id, id, 5, 800, 481, 120);
    status.consumeFreeze(slot, 500); expect(status.canAct(slot, 500)).toBe(true);
    expect(status.deadline(Kind.ControlResistance, slot)).toBe(860);
    status.advance(860); expect(status.save(slot, 860)).toEqual([]);
});

test("elite duration is halved, bosses retain capped soft control, and saved durations are not reduced twice", () => {
    const world = new EntityWorld(3), status = new StatusSystem(world), normal = world.create(1), elite = world.create(1), boss = world.create(1);
    status.controlProfile[elite] = ControlProfile.Elite; status.controlProfile[boss] = ControlProfile.Boss;
    const id = world.ids[normal];
    for (const slot of [normal, elite, boss]) status.chill(id, world.ids[slot], 5, 300, 0, 120);
    expect(status.frozenUntil[normal]).toBe(120); expect(status.frozenUntil[elite]).toBe(60);
    expect(status.frozenUntil[boss]).toBe(0); expect(status.slowScale[boss]).toBeCloseTo(.8);
    expect(status.amount(Kind.Chill, boss, 0)).toBe(5);
    status.clear(normal); status.durationScale[normal] = .8;
    status.apply(Kind.Frozen, id, id, 1, 100, 0);
    const saved = status.save(normal, 20); expect(saved[0].remaining).toBe(60);
    status.restore(normal, saved, 200); expect(status.frozenUntil[normal]).toBe(260);
    status.advance(300); expect(status.canAct(elite, 300)).toBe(true); expect(status.slowScale[boss]).toBe(1);
    status.advance(1000); expect(status.save(normal, 1000)).toEqual([]); expect(status.save(elite, 1000)).toEqual([]);
});

test("restored external provenance cannot merge with a new actor reusing that handle", () => {
    const world = new EntityWorld(2), status = new StatusSystem(world), slot = world.create(1), external = world.ids[world.create(1)], id = world.ids[slot];
    status.apply(Kind.Slow, external, id, .5, 100, 0);
    status.restore(slot, status.save(slot, 10), 10);
    status.apply(Kind.Slow, external, id, .2, 200, 11);
    const saved = status.save(slot, 11); expect(saved).toHaveLength(2);
    status.restore(slot, saved, 11);
    expect(new Set(status.save(slot, 11).map(entry => entry.source)).size).toBe(2);
    status.advance(100); expect(status.slowScale[slot]).toBeCloseTo(.8);
});

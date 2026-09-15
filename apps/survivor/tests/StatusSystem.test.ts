import { expect, test } from "vitest";
import { EntityWorld } from "../src/core/EntityWorld";
import { StatusKind as Kind, StatusSystem } from "../src/core/StatusSystem";

test("strongest refresh keeps provenance, expires exactly and clears dense entries independently", () => {
    const world = new EntityWorld(3), status = new StatusSystem(world);
    const a = world.create(1), b = world.create(1), source = world.ids[a], target = world.ids[b];
    status.apply(Kind.Slow, source, target, .5, 10, 0);
    status.apply(Kind.Slow, target, target, .2, 20, 1);
    status.apply(Kind.Protection, target, target, .25, 15, 1);
    expect(status.amount(Kind.Slow, b, 19)).toBe(.5);
    expect(status.source(Kind.Slow, b)).toBe(source);
    expect(status.slowScale[b]).toBe(.5);
    world.destroy(source); // The applied effect survives its source.
    status.advance(15);
    expect(status.wardUntil[b]).toBe(0);
    expect(status.slowUntil[b]).toBe(20);
    status.advance(20);
    expect(status.slowScale[b]).toBe(1);
    expect(status.source(Kind.Slow, b)).toBe(0);
    status.apply(Kind.Slow, target, target, .1, 30, 20);
    expect(status.amount(Kind.Slow, b, 20)).toBe(.1);
});

test("barriers reject refresh, clamp absorption, and can be reapplied immediately on depletion", () => {
    const world = new EntityWorld(1), status = new StatusSystem(world), slot = world.create(1), id = world.ids[slot];
    expect(status.apply(Kind.Barrier, id, id, 10, 20, 0)).toBe(true);
    for (const damage of [-1, NaN, Infinity]) expect(() => status.absorb(slot, damage, 0)).toThrow(RangeError);
    expect(status.amount(Kind.Barrier, slot, 0)).toBe(10);
    expect(status.apply(Kind.Barrier, id, id, 100, 30, 1)).toBe(false);
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

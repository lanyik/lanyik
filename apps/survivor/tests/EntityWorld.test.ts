import { expect, test } from "vitest";
import { EntityWorld } from "../src/core/EntityWorld";

test("component queries remain exact across interleaved removal and slot reuse", () => {
    const world = new EntityWorld(4);
    const positioned = world.query(1), actors = world.query(3);
    const a = world.create(3), b = world.create(1), c = world.create(3);
    const aId = world.ids[a], bId = world.ids[b], cId = world.ids[c];
    world.destroy(aId);
    const replacement = world.create(3), replacementId = world.ids[replacement];
    world.destroy(bId);
    expect(world.resolve(aId)).toBe(-1);
    expect(world.resolve(replacementId)).toBe(replacement);
    expect(world.resolve(cId)).toBe(c);
    expect(new Set(actors.slots.slice(0, actors.count))).toEqual(new Set([replacement, c]));
    expect(positioned.count).toBe(2);
    expect(world.query(2).count).toBe(2);
    expect(() => world.destroy(aId)).toThrow("expired");
    world.create(1); world.create(1);
    expect(() => world.create(1)).toThrow("capacity");
});

test("handles remain valid beyond 32 bits without expanding component storage", () => {
    const world = new EntityWorld(65536);
    const storage = world.ids;
    let previous = 0;
    for (let cycle = 0; cycle < 70_000; cycle++) {
        const slot = world.create(1), id = world.ids[slot];
        expect(world.resolve(previous)).toBe(-1);
        if (cycle === 69_999) {
            expect(id).toBeGreaterThan(0xffff_ffff);
            expect(world.resolve(id)).toBe(slot);
        }
        previous = id;
        world.destroy(id);
    }
    expect(world.ids).toBe(storage);
    expect(world.count).toBe(0);
});

test("invalid capacity and composition fail before changing entity ownership", () => {
    expect(() => new EntityWorld(0)).toThrow("capacity");
    const world = new EntityWorld(1);
    for (const mask of [0, -1, 1.5, NaN]) expect(() => world.create(mask)).toThrow("mask");
    expect(world.count).toBe(0);
    expect(world.resolve(NaN)).toBe(-1);
    expect(world.resolve(.5)).toBe(-1);
});

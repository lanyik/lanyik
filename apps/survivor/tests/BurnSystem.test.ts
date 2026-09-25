import { expect, test, vi } from "vitest";
import { BurnSystem } from "../src/core/BurnSystem";
import { EntityWorld } from "../src/core/EntityWorld";

function fixture(capacity = 10) {
    const world = new EntityWorld(capacity), slot = world.create(1), target = world.ids[slot], burns = new BurnSystem(world);
    return { world, slot, target, burns };
}

test("burn layers keep independent deadlines and include their eighth tick before expiry", () => {
    const { slot, target, burns } = fixture(), hit = vi.fn();
    burns.apply(11, target, 10, 0, 480); burns.apply(11, target, 20, 30, 480);
    burns.advance(59, hit); expect(hit).not.toHaveBeenCalled();
    burns.advance(60, hit); expect(hit.mock.calls).toEqual([[11, target, 10, 60]]);
    burns.advance(480, hit); expect(hit).toHaveBeenCalledTimes(15);
    expect(burns.stacks[slot]).toBe(1); expect(burns.until[slot]).toBe(510);
    burns.advance(510, hit); expect(hit).toHaveBeenCalledTimes(16);
    expect(hit.mock.calls.reduce((sum, args) => sum + args[2], 0)).toBe(240);
    expect(burns.stacks[slot]).toBe(0); burns.advance(1000, hit); expect(hit).toHaveBeenCalledTimes(16);
});

test("full groups replace only the weakest remaining total, without refreshing or advancing other layers", () => {
    const { slot, target, burns } = fixture(), hit = vi.fn();
    for (const strength of [10, 20, 30, 40, 50]) burns.apply(1, target, strength, 0, 480);
    burns.advance(240, hit); hit.mockClear();
    expect(burns.apply(1, target, 4, 240, 480)).toBe(false); // 32 < weakest remaining 40.
    expect(burns.apply(1, target, 5, 240, 480)).toBe(true);
    expect(burns.stacks[slot]).toBe(5); burns.advance(299, hit); expect(hit).not.toHaveBeenCalled();
    burns.advance(300, hit); expect(hit.mock.calls).toEqual([[1, target, 145, 300]]);
    burns.advance(480, hit); expect(burns.stacks[slot]).toBe(1);
    expect(burns.consume(1, target)).toBe(20); expect(burns.stacks[slot]).toBe(0);
});

test("four sources and eight layers are bounded, consumption is source-specific, and source removal is harmless", () => {
    const { world, slot, target, burns } = fixture(), sourceSlot = world.create(1), source = world.ids[sourceSlot];
    for (const id of [source, 12, 13, 14]) for (let i = 0; i < 8; i++) expect(burns.apply(id, target, 3, 0, 480, 8)).toBe(true);
    expect(burns.stacks[slot]).toBe(32); expect(burns.apply(15, target, 1000, 0, 480, 8)).toBe(false);
    world.destroy(source); const hit = vi.fn(); burns.advance(60, hit); expect(hit).toHaveBeenCalledTimes(4);
    expect(hit.mock.calls.map(args => args[2])).toEqual([24, 24, 24, 24]);
    expect(burns.consume(source, target)).toBe(168); expect(burns.stacks[slot]).toBe(24);
    expect(burns.consume(source, target)).toBe(0);
    expect(burns.apply(15, target, 3, 60, 480, 8)).toBe(true); // The removed source releases capacity for a new one.
    expect(burns.apply(16, target, 3, 60, 480, 8)).toBe(false);
    burns.clear(slot); world.destroy(target); world.create(1);
    expect(burns.apply(source, target, 3, 60, 480)).toBe(false);
    burns.advance(600, hit); expect(hit).toHaveBeenCalledTimes(4);
});

test("interleaved source layers retain ordered sums after removal and replacement", () => {
    const { slot, target, burns } = fixture(), hit = vi.fn();
    for (let layer = 0; layer < 8; layer++) for (const source of [4, 2, 1, 3]) burns.apply(source, target, source, 0, 120, 8);
    expect(burns.consume(2, target)).toBe(32);
    burns.apply(5, target, 10, 0, 120, 8);
    burns.apply(1, target, 2, 0, 120, 8); // Replace one of eight equally weak layers.
    burns.advance(120, hit);
    expect(hit.mock.calls).toEqual([60, 120].flatMap(tick => [[1, target, 9, tick], [3, target, 24, tick], [4, target, 32, tick], [5, target, 10, tick]]));
    expect(burns.stacks[slot]).toBe(0);
});

test("same-tick expiry captures hits before removals, then orders by full target and source handles", () => {
    const { world, target, burns } = fixture(), other = world.ids[world.create(1)], seen: number[][] = [];
    for (const id of [other, target]) for (const source of [3, 1, 2]) burns.apply(source, id, source, 0, 60);
    burns.advance(60, (source, id, amount, at) => {
        expect(burns.stacks[world.resolve(id)]).toBe(0); seen.push([id, source, amount, at]);
    });
    expect(seen).toEqual([target, other].flatMap(id => [1, 2, 3].map(source => [id, source, source, 60])));
    const reused = fixture(1); reused.burns.apply(1, reused.target, 10, 0, 60); reused.burns.apply(2, reused.target, 10, 0, 60);
    const ids: number[] = [];
    reused.burns.advance(60, (_source, id) => {
        ids.push(id);
        if (reused.world.resolve(id) >= 0) { reused.burns.clear(0); reused.world.destroy(id); reused.world.create(1); }
    });
    expect(ids).toEqual([reused.target, reused.target]); expect(reused.world.resolve(ids[1])).toBe(-1);
});

test("saving preserves individual output and time-to-next-tick, including partial tails, without offline catch-up", () => {
    const { slot, target, burns } = fixture();
    burns.apply(target, target, 7, 0, 500); burns.apply(20, target, 10, 10, 480);
    burns.advance(70, () => {}); const saved = burns.save(slot, 80);
    expect(saved).toEqual(expect.arrayContaining([{ source: target, amount: 7, remaining: 420, nextIn: 40 }, { source: 20, amount: 10, remaining: 410, nextIn: 50 }]));
    burns.restore(slot, saved, 1000); const hit = vi.fn();
    burns.advance(1039, hit); expect(hit).not.toHaveBeenCalled(); burns.advance(1040, hit);
    expect(hit.mock.calls).toEqual([[target, target, 7, 1040]]);
    burns.apply(20, target, 1, 1040, 480); expect(new Set(burns.save(slot, 1040).map(entry => entry.source)).size).toBe(3);
    burns.clear(slot); burns.apply(1, target, 1, 0, 70); burns.advance(60, () => {});
    const tail = burns.save(slot, 65); expect(tail[0]).toMatchObject({ remaining: 5, nextIn: 55 });
    burns.restore(slot, tail, 100); hit.mockClear(); burns.advance(155, hit); expect(hit).not.toHaveBeenCalled();
});

test("expiry is published before callbacks reapply burns and the next batch expires the new layers", () => {
    const { world, slot, target, burns } = fixture(1857), otherSlot = world.create(1), other = world.ids[otherSlot];
    for (const id of [target, other]) for (const source of [1, 2]) burns.apply(source, id, 3, 0, 60);
    const hits: number[][] = [];
    burns.advance(120, (source, id, damage, tick) => {
        hits.push([source, id, damage, tick]);
        if (tick === 60 && source === 1) {
            expect(burns.stacks[world.resolve(id)]).toBe(0);
            burns.apply(3, id, 7, tick, 60);
            expect(burns.stacks[world.resolve(id)]).toBe(1);
        }
        if (tick === 120) { expect(burns.stacks[slot]).toBe(0); expect(burns.stacks[otherSlot]).toBe(0); }
    });
    expect(hits).toEqual([[1, target, 3, 60], [2, target, 3, 60], [1, other, 3, 60], [2, other, 3, 60], [3, target, 7, 120], [3, other, 7, 120]]);
    expect(burns.isDue(1000)).toBe(false);
});

test("invalid inputs fail before mutation and full capacity can be reused after clear", () => {
    const { target, slot, burns } = fixture(1);
    for (const damage of [NaN, Infinity, 1e308, 0, -1]) expect(() => burns.apply(1, target, damage, 0, 480)).toThrow();
    for (const limit of [0, 9, .5, NaN]) expect(() => burns.apply(1, target, 1, 0, 480, limit)).toThrow();
    for (let source = 1; source <= 4; source++) for (let layer = 0; layer < 8; layer++) burns.apply(source, target, 1, 0, 480, 8);
    expect(burns.stacks[slot]).toBe(32); burns.clear(slot);
    for (let source = 1; source <= 4; source++) for (let layer = 0; layer < 8; layer++) expect(burns.apply(source, target, 1, 0, 480, 8)).toBe(true);
});

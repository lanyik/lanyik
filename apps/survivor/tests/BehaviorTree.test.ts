import { expect, test } from "vitest";
import { BehaviorTree, BehaviorStatus as Status, type BehaviorNode } from "../src/core/BehaviorTree";

test("running actions resume independently and priority changes halt before replacement", () => {
    const context = { retreat: [false, false], complete: false, events: [] as string[] };
    const memory = new Int16Array(2).fill(-1);
    const tree = new BehaviorTree<typeof context>({ type: "selector", children: [
        { type: "sequence", children: [
            { type: "condition", test: (c, s) => c.retreat[s] },
            { type: "action", tick: (c, s, starting) => { if (starting) c.events.push(`return:${s}`); return Status.Running; }, halt: (c, s) => { c.events.push(`stop-return:${s}`); } }
        ] },
        { type: "action", tick: (c, s, starting) => { if (starting) c.events.push(`attack:${s}`); return c.complete ? Status.Success : Status.Running; }, halt: (c, s) => { c.events.push(`stop-attack:${s}`); } }
    ] });
    tree.tick(context, 0, memory); tree.tick(context, 1, memory); tree.tick(context, 0, memory);
    expect(context.events).toEqual(["attack:0", "attack:1"]);
    context.retreat[0] = true;
    tree.tick(context, 0, memory);
    expect(context.events.slice(-2)).toEqual(["stop-attack:0", "return:0"]);
    context.complete = true;
    expect(tree.tick(context, 1, memory)).toBe(Status.Success);
    expect(memory[1]).toBe(-1);
    tree.halt(context, 0, memory); tree.halt(context, 0, memory);
    expect(context.events.filter(event => event === "stop-return:0")).toHaveLength(1);
});

test("a failed reactive guard cancels its running child even without a replacement", () => {
    const context = { valid: true, stops: 0 };
    const tree = new BehaviorTree<typeof context>({ type: "sequence", children: [
        { type: "condition", test: c => c.valid },
        { type: "action", tick: () => Status.Running, halt: c => { c.stops++; } }
    ] });
    const memory = new Int16Array(1).fill(-1);
    tree.tick(context, 0, memory); context.valid = false;
    expect(tree.tick(context, 0, memory)).toBe(Status.Failure);
    expect(context.stops).toBe(1);
    expect(memory[0]).toBe(-1);
});

test("invalid tree definitions are rejected at construction", () => {
    const children: BehaviorNode<unknown>[] = [];
    const cycle: BehaviorNode<unknown> = { type: "sequence", children };
    expect(() => new BehaviorTree(cycle)).toThrow("children");
    children.push(cycle);
    expect(() => new BehaviorTree(cycle)).toThrow("cycle");
});

export enum BehaviorStatus { Failure, Success, Running }

export type BehaviorNode<C> =
    | { readonly type: "condition"; readonly test: (context: C, slot: number) => boolean }
    | { readonly type: "action"; readonly tick: (context: C, slot: number, starting: boolean) => BehaviorStatus;
        readonly halt: (context: C, slot: number) => void }
    | { readonly type: "sequence" | "selector"; readonly children: readonly BehaviorNode<C>[] };

interface CompiledNode<C> {
    readonly definition: BehaviorNode<C>;
    readonly children: readonly number[];
}

/**
 * Reactive sequence/priority selector execution with one running leaf per actor.
 * Definitions are shared, memory is caller-owned component data. No timers,
 * promises, per-tick allocations or per-actor node instances.
 */
export class BehaviorTree<C> {
    private readonly nodes: readonly CompiledNode<C>[];

    constructor(root: BehaviorNode<C>) {
        const nodes: CompiledNode<C>[] = [];
        const visiting = new Set<BehaviorNode<C>>();
        const compile = (definition: BehaviorNode<C>): number => {
            if (visiting.has(definition)) throw new Error("Behavior tree contains a cycle");
            if (nodes.length >= 32767) throw new Error("Behavior tree exceeds node capacity");
            visiting.add(definition);
            const index = nodes.length;
            const children: number[] = [];
            nodes.push(Object.freeze({ definition: Object.freeze({ ...definition }), children }));
            if (definition.type === "sequence" || definition.type === "selector") {
                if (definition.children.length === 0) throw new Error("Behavior composite must have children");
                for (const child of definition.children) children.push(compile(child));
            }
            Object.freeze(children);
            visiting.delete(definition);
            return index;
        };
        compile(root);
        this.nodes = Object.freeze(nodes);
    }

    public tick(context: C, slot: number, running: Int16Array): BehaviorStatus {
        const status = this.visit(0, context, slot, running);
        if (status !== BehaviorStatus.Running) this.halt(context, slot, running);
        return status;
    }

    public halt(context: C, slot: number, running: Int16Array): void {
        const previous = running[slot];
        running[slot] = -1;
        if (previous < 0) return;
        const node = this.nodes[previous].definition;
        if (node.type === "action") node.halt(context, slot);
    }

    private visit(index: number, context: C, slot: number, running: Int16Array): BehaviorStatus {
        const { definition, children } = this.nodes[index];
        switch (definition.type) {
            case "condition": return definition.test(context, slot) ? BehaviorStatus.Success : BehaviorStatus.Failure;
            case "action": {
                const starting = running[slot] !== index;
                if (starting) this.halt(context, slot, running);
                const status = definition.tick(context, slot, starting);
                running[slot] = status === BehaviorStatus.Running ? index : -1;
                return status;
            }
            case "sequence":
                for (const child of children) {
                    const status = this.visit(child, context, slot, running);
                    if (status !== BehaviorStatus.Success) return status;
                }
                return BehaviorStatus.Success;
            case "selector":
                for (const child of children) {
                    const status = this.visit(child, context, slot, running);
                    if (status !== BehaviorStatus.Failure) return status;
                }
                return BehaviorStatus.Failure;
        }
    }
}

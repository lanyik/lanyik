import { describe, expect, test } from "vitest";
import { CubeUVReflectionMapping, Texture } from "three";

import {
    CompiledLightingEnvironment,
    LightingEnvironmentCompiler,
    LightingEnvironmentManager,
    LightingEnvironmentSupersededError,
    LightingEnvironmentTaskScheduler
} from "../../src/rendering/LightingEnvironmentManager";

class FakeCompiler implements LightingEnvironmentCompiler {
    public readonly resources: Array<CompiledLightingEnvironment & { readonly disposed: () => boolean }> = [];
    public compileCount = 0;
    public readonly compiledTurbidity: number[] = [];
    public disposed = false;
    public fail = false;

    public compile(input: Parameters<LightingEnvironmentCompiler["compile"]>[0]): CompiledLightingEnvironment {
        this.compileCount += 1;
        if (input.kind === "analytic-sky") this.compiledTurbidity.push(input.turbidity);
        if (this.fail) throw new Error("compile failed");
        const texture = new Texture();
        texture.mapping = CubeUVReflectionMapping;
        let released = false;
        const resource = Object.freeze({
            texture,
            dispose(): void { released = true; },
            disposed: (): boolean => released
        });
        this.resources.push(resource);
        return resource;
    }

    public dispose(): void { this.disposed = true; }
}

function source() {
    return Object.freeze({
        kind: "analytic-sky" as const,
        turbidity: 4,
        rayleigh: 1.7,
        mieCoefficient: 0.002,
        mieDirectionalG: 0.76,
        sunDirection: Object.freeze({ x: 1, y: 1, z: 0 })
    });
}

function harness() {
    const queue: Array<() => void> = [];
    const compiler = new FakeCompiler();
    const schedule: LightingEnvironmentTaskScheduler = task => { queue.push(task); };
    const manager = new LightingEnvironmentManager(compiler, schedule);
    return { queue, compiler, manager };
}

describe("LightingEnvironmentManager", () => {
    test("keeps the prior PMREM alive through activation and releases it only after swap", async () => {
        const { queue, compiler, manager } = harness();
        let firstActive = false;
        const firstPromise = manager.rebuild(source(), 1, handle => {
            expect(handle.revision).toBe(1);
            firstActive = true;
        });
        expect(compiler.compileCount).toBe(0);
        queue.shift()?.();
        await expect(firstPromise).resolves.toMatchObject({ revision: 1 });
        expect(firstActive).toBe(true);

        const secondPromise = manager.rebuild(source(), 2, () => {
            expect(compiler.resources[0].disposed()).toBe(false);
            expect(manager.current?.revision).toBe(1);
        });
        queue.shift()?.();
        await expect(secondPromise).resolves.toMatchObject({ revision: 2 });
        expect(compiler.resources[0].disposed()).toBe(true);
        expect(compiler.resources[1].disposed()).toBe(false);
        expect(manager.stats).toMatchObject({ builds: 2, swaps: 2, failures: 0 });
        manager.dispose();
        expect(compiler.resources[1].disposed()).toBe(true);
        expect(compiler.disposed).toBe(true);
    });

    test("supersedes queued work before it reaches the GPU compiler", async () => {
        const { queue, compiler, manager } = harness();
        const first = manager.rebuild(source(), 3, () => undefined);
        const second = manager.rebuild(source(), 4, () => undefined);
        await expect(first).rejects.toBeInstanceOf(LightingEnvironmentSupersededError);
        queue.shift()?.();
        queue.shift()?.();
        await expect(second).resolves.toMatchObject({ revision: 4 });
        expect(compiler.compileCount).toBe(1);
        expect(manager.stats.superseded).toBe(1);
        manager.dispose();
    });

    test("preserves the current resource when compilation or activation fails", async () => {
        const { queue, compiler, manager } = harness();
        const initial = manager.rebuild(source(), 1, () => undefined);
        queue.shift()?.();
        await initial;

        compiler.fail = true;
        const failedCompile = manager.rebuild(source(), 2, () => undefined);
        queue.shift()?.();
        await expect(failedCompile).rejects.toThrow(/compile failed/);
        expect(manager.current?.revision).toBe(1);
        expect(compiler.resources[0].disposed()).toBe(false);

        compiler.fail = false;
        const recovered = manager.rebuild(source(), 2, () => undefined);
        queue.shift()?.();
        await expect(recovered).resolves.toMatchObject({ revision: 2 });

        const failedActivation = manager.rebuild(source(), 3, () => {
            throw new Error("activation failed");
        });
        queue.shift()?.();
        await expect(failedActivation).rejects.toThrow(/activation failed/);
        expect(manager.current?.revision).toBe(2);
        expect(compiler.resources[0].disposed()).toBe(true);
        expect(compiler.resources[2].disposed()).toBe(true);
        manager.dispose();
    });

    test("rejects non-increasing revisions, async activation and reentrant rebuild", async () => {
        const { queue, manager } = harness();
        const initial = manager.rebuild(source(), 5, () => undefined);
        queue.shift()?.();
        await initial;
        await expect(manager.rebuild(source(), 5, () => undefined)).rejects.toThrow(/increase strictly/);

        let reentrant: Promise<unknown> | undefined;
        const asynchronous = manager.rebuild(source(), 6, () => {
            reentrant = manager.rebuild(source(), 7, () => undefined);
            return Promise.resolve();
        });
        queue.shift()?.();
        await expect(asynchronous).rejects.toThrow(/synchronous/);
        await expect(reentrant).rejects.toThrow(/during activation/);
        expect(manager.current?.revision).toBe(5);
        manager.dispose();
    });

    test("validates analytic parameters and scheduler failures without mutating state", async () => {
        const compiler = new FakeCompiler();
        const manager = new LightingEnvironmentManager(compiler, () => {
            throw new Error("budget rejected");
        });
        await expect(manager.rebuild(source(), 1, () => undefined)).rejects.toThrow(/budget rejected/);
        expect(manager.current).toBeUndefined();
        await expect(manager.rebuild({ ...source(), turbidity: 21 }, 2, () => undefined))
            .rejects.toThrow(/parameters/);
        manager.dispose();
    });

    test("snapshots analytic inputs before queued compilation", async () => {
        const { queue, compiler, manager } = harness();
        const mutable = { ...source(), turbidity: 4 };
        const pending = manager.rebuild(mutable, 1, () => undefined);
        mutable.turbidity = 12;
        queue.shift()?.();
        await pending;
        expect(compiler.compiledTurbidity).toEqual([4]);
        manager.dispose();
    });
});

import { CompiledSurfaceSample } from "../world/semantic/SurfaceCompiler";
import { RenderChunkKey } from "../world/semantic/SurfaceDependency";
import { WorldChunkLod } from "./WorldChunkLod";

export type WorldRenderDependency =
    | "authority"
    | "compiled-surface"
    | "surface-textures"
    | "dynamic-fog"
    | "lighting"
    | "ground"
    | "water"
    | "vegetation"
    | `application:${string}`;

export interface WorldRenderLayerChunkAccess {
    readonly key: RenderChunkKey;
    readonly effectiveRevision: number;
    readonly lod: WorldChunkLod;
    sample(localU: number, localV: number): Readonly<CompiledSurfaceSample>;
}

export interface DependencyDrivenWorldRenderLayer<Context extends WorldRenderLayerChunkAccess = WorldRenderLayerChunkAccess> {
    readonly id: string;
    readonly requires: readonly WorldRenderDependency[];
    readonly owns?: readonly WorldRenderDependency[];
    initialize?(): void | Promise<void>;
    mount(context: Context): void | Promise<void>;
    unmount(context: Context): void;
    setLod?(context: Context): void;
    contextLost?(): void;
    contextRestored?(): void;
    dispose(): void;
}

export class WorldRenderDependencyError extends Error {
    public readonly name = "WorldRenderDependencyError";
}

function assertNames(values: readonly string[], label: string): void {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string" || !value.trim())) {
        throw new TypeError(`${label} must contain non-empty dependency names`);
    }
}

export class DependencyDrivenRenderGraph<Context extends WorldRenderLayerChunkAccess> {
    private readonly layersById = new Map<string, DependencyDrivenWorldRenderLayer<Context>>();
    private orderedLayers: readonly DependencyDrivenWorldRenderLayer<Context>[] | undefined;
    private initialized = false;
    private disposed = false;

    constructor(private readonly externalDependencies: readonly WorldRenderDependency[]) {
        assertNames(externalDependencies, "external render dependencies");
        if (new Set(externalDependencies).size !== externalDependencies.length) {
            throw new WorldRenderDependencyError("external render dependencies contain duplicates");
        }
    }

    public register(layer: DependencyDrivenWorldRenderLayer<Context>): void {
        this.assertMutable();
        if (!layer || typeof layer.id !== "string" || !layer.id.trim()
            || typeof layer.mount !== "function" || typeof layer.unmount !== "function"
            || typeof layer.dispose !== "function") {
            throw new TypeError("dependency-driven render layer is invalid");
        }
        assertNames(layer.requires, `render layer ${layer.id} requirements`);
        assertNames(layer.owns ?? [], `render layer ${layer.id} ownership`);
        if (this.layersById.has(layer.id)) throw new WorldRenderDependencyError(`render layer ${layer.id} is already registered`);
        this.layersById.set(layer.id, layer);
    }

    public async initialize(): Promise<void> {
        this.assertMutable();
        const ordered = this.resolveOrder();
        const initialized: DependencyDrivenWorldRenderLayer<Context>[] = [];
        try {
            for (const layer of ordered) {
                await layer.initialize?.();
                initialized.push(layer);
            }
            this.initialized = true;
        } catch (reason) {
            for (const layer of initialized.reverse()) {
                try { layer.dispose(); } catch { /* preserve the initialization failure */ }
            }
            throw reason;
        }
    }

    public async mount(context: Context): Promise<void> {
        this.assertReady();
        const mounted: DependencyDrivenWorldRenderLayer<Context>[] = [];
        try {
            for (const layer of this.orderedLayers!) {
                await layer.mount(context);
                mounted.push(layer);
            }
        } catch (reason) {
            for (const layer of mounted.reverse()) {
                try { layer.unmount(context); } catch { /* preserve mount failure */ }
            }
            throw reason;
        }
    }

    public unmount(context: Context): void {
        this.assertReady();
        const errors: Error[] = [];
        for (const layer of [...this.orderedLayers!].reverse()) {
            try { layer.unmount(context); } catch (reason) {
                errors.push(reason instanceof Error ? reason : new Error(String(reason)));
            }
        }
        if (errors.length > 0) {
            throw new WorldRenderDependencyError(`render layer unmount failed: ${errors.map(error => error.message).join("; ")}`);
        }
    }

    public setLod(context: Context): void {
        this.assertReady();
        for (const layer of this.orderedLayers!) layer.setLod?.(context);
    }

    public contextLost(): void {
        this.assertReady();
        for (const layer of [...this.orderedLayers!].reverse()) layer.contextLost?.();
    }

    public contextRestored(): void {
        this.assertReady();
        for (const layer of this.orderedLayers!) layer.contextRestored?.();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const errors: Error[] = [];
        for (const layer of [...(this.orderedLayers ?? this.layersById.values())].reverse()) {
            try { layer.dispose(); } catch (reason) {
                errors.push(reason instanceof Error ? reason : new Error(String(reason)));
            }
        }
        this.layersById.clear();
        if (errors.length > 0) {
            throw new WorldRenderDependencyError(`render layer disposal failed: ${errors.map(error => error.message).join("; ")}`);
        }
    }

    public get order(): readonly string[] {
        return Object.freeze((this.orderedLayers ?? this.resolveOrder()).map(layer => layer.id));
    }

    private resolveOrder(): readonly DependencyDrivenWorldRenderLayer<Context>[] {
        if (this.orderedLayers) return this.orderedLayers;
        const owners = new Map<WorldRenderDependency, DependencyDrivenWorldRenderLayer<Context>>();
        for (const dependency of this.externalDependencies) owners.set(dependency, undefined as never);
        for (const layer of this.layersById.values()) {
            for (const dependency of layer.owns ?? []) {
                if (owners.has(dependency)) {
                    const owner = owners.get(dependency);
                    throw new WorldRenderDependencyError(owner
                        ? `render dependency ${dependency} has duplicate owners ${owner.id} and ${layer.id}`
                        : `render layer ${layer.id} attempts to own external dependency ${dependency}`);
                }
                owners.set(dependency, layer);
            }
        }
        for (const layer of this.layersById.values()) {
            for (const dependency of layer.requires) {
                if (!owners.has(dependency)) {
                    throw new WorldRenderDependencyError(`render layer ${layer.id} requires missing dependency ${dependency}`);
                }
            }
        }
        const visiting = new Set<string>();
        const visited = new Set<string>();
        const result: DependencyDrivenWorldRenderLayer<Context>[] = [];
        const visit = (layer: DependencyDrivenWorldRenderLayer<Context>): void => {
            if (visited.has(layer.id)) return;
            if (visiting.has(layer.id)) throw new WorldRenderDependencyError(`render dependency graph contains a cycle at ${layer.id}`);
            visiting.add(layer.id);
            for (const dependency of layer.requires) {
                const owner = owners.get(dependency);
                if (owner) visit(owner);
            }
            visiting.delete(layer.id);
            visited.add(layer.id);
            result.push(layer);
        };
        for (const layer of this.layersById.values()) visit(layer);
        this.orderedLayers = Object.freeze(result);
        return this.orderedLayers;
    }

    private assertMutable(): void {
        if (this.disposed) throw new Error("DependencyDrivenRenderGraph has been disposed");
        if (this.initialized) throw new Error("DependencyDrivenRenderGraph is already initialized");
    }

    private assertReady(): void {
        if (this.disposed || !this.initialized) throw new Error("DependencyDrivenRenderGraph is not initialized");
    }
}

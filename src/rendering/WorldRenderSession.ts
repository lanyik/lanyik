import { Group } from "three";

import { WorldChunkLod } from "./WorldChunkLod";
import {
    WorldAuthorityLease,
    WorldAuthorityRepository
} from "../world/semantic/WorldAuthorityRepository";
import { WorldChangeSet } from "../world/semantic/WorldChangeSet";
import { WorldEditor } from "../world/WorldEditing";
import {
    ResidentSurfaceLease,
    SurfaceCompilationRequest,
    SurfaceCompilationService
} from "../world/semantic/SurfaceCompilationService";
import {
    CompiledSurfaceChunk,
    sampleCompiledSurfaceChunk
} from "../world/semantic/SurfaceCompiler";
import {
    canonicalizeRenderChunkKey,
    RenderChunkKey
} from "../world/semantic/SurfaceDependency";
import { SurfaceQueryService } from "../world/semantic/SurfaceQueryService";
import { WorldDescriptorV2 } from "../world/semantic/WorldDescriptorV2";
import {
    DependencyDrivenRenderGraph,
    DependencyDrivenWorldRenderLayer,
    WorldRenderLayerChunkAccess
} from "./DependencyDrivenRenderGraph";
import { SurfacePresentationLayer } from "./SurfacePresentationLayer";

export interface WorldRenderDemand {
    readonly key: RenderChunkKey;
    readonly lod: WorldChunkLod;
    readonly priority?: number;
    readonly lane?: "critical" | "interactive" | "visible" | "prefetch" | "background";
}

export interface WorldRenderSessionOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly authority: WorldAuthorityRepository;
    readonly compilation: SurfaceCompilationService;
    readonly presentation: SurfacePresentationLayer;
    readonly queries: SurfaceQueryService;
    readonly editor?: WorldEditor;
    readonly compiledWorkingSetBudgetBytes: number;
    readonly customLayers?: readonly DependencyDrivenWorldRenderLayer<WorldRenderSessionChunkContext>[];
    readonly error?: (error: Error) => void;
}

export interface WorldRenderSessionChunkContext extends WorldRenderLayerChunkAccess {
    readonly chunk: CompiledSurfaceChunk;
    readonly lease: ResidentSurfaceLease;
}

export interface WorldRenderSessionStats {
    readonly state: "created" | "ready" | "lost" | "disposed";
    readonly demandedChunks: number;
    readonly pendingChunks: number;
    readonly mountedChunks: number;
    readonly mountedCompiledBytes: number;
    readonly compiledWorkingSetBudgetBytes: number;
    readonly demandUpdates: number;
    readonly editRefreshes: number;
    readonly staleOutcomes: number;
    readonly failedChunks: number;
    readonly layerOrder: readonly string[];
}

interface DemandState {
    readonly key: RenderChunkKey;
    lod: WorldChunkLod;
    priority: number;
    lane: NonNullable<WorldRenderDemand["lane"]>;
    generation: number;
    authorityLease?: WorldAuthorityLease;
    request?: SurfaceCompilationRequest;
    surfaceLease?: ResidentSurfaceLease;
    compiledBytesAccounted?: boolean;
    context?: WorldRenderSessionChunkContext;
    task?: Promise<void>;
}

function keyString(key: RenderChunkKey): string { return `${key.chunkX},${key.chunkY}`; }

function asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

function assertDemand(value: WorldRenderDemand): void {
    if (!value || typeof value !== "object" || !Number.isSafeInteger(value.key?.chunkX)
        || !Number.isSafeInteger(value.key?.chunkY) || ![0, 1, 2].includes(value.lod)
        || value.priority !== undefined && !Number.isFinite(value.priority)
        || value.lane !== undefined && !["critical", "interactive", "visible", "prefetch", "background"].includes(value.lane)) {
        throw new TypeError("world render demand is invalid");
    }
}

export class WorldRenderSession {
    public readonly root: Group;
    public readonly descriptor: WorldDescriptorV2;
    private readonly authority: WorldAuthorityRepository;
    private readonly compilation: SurfaceCompilationService;
    private readonly presentation: SurfacePresentationLayer;
    private readonly queries: SurfaceQueryService;
    private readonly graph: DependencyDrivenRenderGraph<WorldRenderSessionChunkContext>;
    private readonly budgetBytes: number;
    private readonly reportError: (error: Error) => void;
    private readonly demanded = new Map<string, DemandState>();
    private readonly detachEditor: (() => void) | undefined;
    private stateValue: "created" | "ready" | "lost" | "disposed" = "created";
    private nextGeneration = 0;
    private mountedBytes = 0;
    private demandUpdateCount = 0;
    private editRefreshCount = 0;
    private staleOutcomeCount = 0;
    private failedChunkCount = 0;
    private demandTransition: Promise<void> = Promise.resolve();

    constructor(options: WorldRenderSessionOptions) {
        if (!options || typeof options !== "object" || !options.authority || !options.compilation
            || !options.presentation || !options.queries
            || !Number.isSafeInteger(options.compiledWorkingSetBudgetBytes)
            || options.compiledWorkingSetBudgetBytes <= 0) {
            throw new TypeError("WorldRenderSession options are invalid");
        }
        this.descriptor = options.descriptor;
        this.authority = options.authority;
        this.compilation = options.compilation;
        this.presentation = options.presentation;
        this.queries = options.queries;
        this.budgetBytes = options.compiledWorkingSetBudgetBytes;
        this.reportError = options.error ?? (() => undefined);
        this.root = this.presentation.root;
        this.graph = new DependencyDrivenRenderGraph([
            "authority",
            "compiled-surface",
            "surface-textures",
            "dynamic-fog",
            "lighting"
        ]);
        this.installBuiltins();
        for (const layer of options.customLayers ?? []) this.graph.register(layer);
        this.detachEditor = options.editor?.subscribe(changeSet => this.applyChangeSet(changeSet));
    }

    public async initialize(): Promise<void> {
        if (this.stateValue !== "created") throw new Error("WorldRenderSession can only initialize once");
        await this.graph.initialize();
        this.stateValue = "ready";
    }

    public async updateDemand(demands: readonly WorldRenderDemand[]): Promise<void> {
        this.assertReady();
        if (!Array.isArray(demands)) throw new TypeError("world render demands must be an array");
        const canonical = new Map<string, WorldRenderDemand>();
        for (const demand of demands) {
            assertDemand(demand);
            const key = canonicalizeRenderChunkKey(this.descriptor, demand.key);
            const serialized = keyString(key);
            if (canonical.has(serialized)) throw new TypeError("world render demand contains duplicate canonical chunks");
            canonical.set(serialized, Object.freeze({ ...demand, key }));
        }
        this.demandUpdateCount += 1;
        const transition = this.demandTransition.then(() => this.applyDemand(canonical));
        this.demandTransition = transition.catch(() => undefined);
        return transition;
    }

    private async applyDemand(canonical: ReadonlyMap<string, WorldRenderDemand>): Promise<void> {
        this.assertReady();
        const retiring = [...this.demanded]
            .filter(([serialized]) => !canonical.has(serialized))
            .map(([, state]) => state);
        const retained: DemandState[] = [];
        const prepared: DemandState[] = [];
        const tasks: Promise<void>[] = [];
        for (const [serialized, state] of [...this.demanded]) {
            const demand = canonical.get(serialized);
            if (!demand) continue;
            const changedLod = state.lod !== demand.lod;
            state.lod = demand.lod;
            state.priority = demand.priority ?? 0;
            state.lane = demand.lane ?? "visible";
            if (changedLod && state.context) {
                state.context = this.context(state, state.surfaceLease!);
                this.graph.setLod(state.context);
            }
            retained.push(state);
            if (!state.context && !state.task) {
                state.generation = this.issueGeneration();
                state.task = this.prepareState(state);
                prepared.push(state);
            }
            if (state.task) tasks.push(state.task);
        }
        const added: DemandState[] = [];
        for (const [serialized, demand] of canonical) {
            if (this.demanded.has(serialized)) continue;
            const state: DemandState = {
                key: demand.key,
                lod: demand.lod,
                priority: demand.priority ?? 0,
                lane: demand.lane ?? "visible",
                generation: this.issueGeneration()
            };
            this.demanded.set(serialized, state);
            added.push(state);
            prepared.push(state);
            state.task = this.prepareState(state);
            tasks.push(state.task);
        }
        try {
            await Promise.all(tasks);
            const projectedBytes = retained.reduce(
                (total, state) => total + (state.context ? state.surfaceLease!.chunk.byteLength : 0),
                0
            ) + prepared.reduce(
                (total, state) => total + (!state.context && state.surfaceLease
                    ? state.surfaceLease.chunk.byteLength : 0),
                0
            );
            if (projectedBytes > this.budgetBytes) {
                this.failedChunkCount += 1;
                throw new RangeError("compiled surface working-set budget cannot admit the exact demand set");
            }

            // Publish the new exact demand in one microtask turn. The old coverage stays
            // mounted for the entire authority/compilation wait, so rendering cannot
            // observe the former load-before-replacement hole.
            for (const state of retiring) {
                this.releaseState(state);
                this.demanded.delete(keyString(state.key));
            }
            for (const state of prepared) {
                if (!state.context && state.surfaceLease) await this.mountPreparedState(state);
            }
        } catch (reason) {
            for (const state of prepared) {
                if (!state.context) this.releaseTransient(state);
            }
            for (const state of added) {
                if (this.demanded.get(keyString(state.key)) !== state) continue;
                this.releaseState(state);
                this.demanded.delete(keyString(state.key));
            }
            throw reason;
        }
    }

    public uploadFog(key: RenderChunkKey, fog: Uint8Array): boolean {
        this.assertReady();
        return this.presentation.uploadFog(key, fog);
    }

    public setTime(seconds: number): void {
        this.assertReady();
        this.presentation.setTime(seconds);
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        if (this.stateValue === "disposed") throw new Error("WorldRenderSession is disposed");
        this.presentation.setFloatingOrigin(worldX, worldZ);
    }

    public handleContextLost(): void {
        if (this.stateValue === "lost") return;
        this.assertReady();
        this.graph.contextLost();
        this.presentation.handleContextLost();
        this.stateValue = "lost";
    }

    public handleContextRestored(): void {
        if (this.stateValue !== "lost") throw new Error("WorldRenderSession context is not lost");
        this.presentation.handleContextRestored();
        this.graph.contextRestored();
        this.stateValue = "ready";
    }

    public async getSettled(): Promise<void> {
        await this.demandTransition;
        await Promise.all([...this.demanded.values()].map(state => state.task).filter(Boolean) as Promise<void>[]);
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        this.detachEditor?.();
        for (const state of [...this.demanded.values()]) this.releaseState(state);
        this.demanded.clear();
        const errors: Error[] = [];
        try { this.graph.dispose(); } catch (reason) { errors.push(asError(reason)); }
        try { this.queries.dispose(); } catch (reason) { errors.push(asError(reason)); }
        try { this.presentation.dispose(); } catch (reason) { errors.push(asError(reason)); }
        try { this.compilation.dispose(); } catch (reason) { errors.push(asError(reason)); }
        try { this.authority.dispose(); } catch (reason) { errors.push(asError(reason)); }
        this.stateValue = "disposed";
        if (errors.length > 0) throw new Error(`WorldRenderSession disposal failed: ${errors.map(error => error.message).join("; ")}`);
    }

    public get stats(): Readonly<WorldRenderSessionStats> {
        let pendingChunks = 0;
        let mountedChunks = 0;
        for (const state of this.demanded.values()) {
            if (state.context) mountedChunks += 1;
            else if (state.task) pendingChunks += 1;
        }
        return Object.freeze({
            state: this.stateValue,
            demandedChunks: this.demanded.size,
            pendingChunks,
            mountedChunks,
            mountedCompiledBytes: this.mountedBytes,
            compiledWorkingSetBudgetBytes: this.budgetBytes,
            demandUpdates: this.demandUpdateCount,
            editRefreshes: this.editRefreshCount,
            staleOutcomes: this.staleOutcomeCount,
            failedChunks: this.failedChunkCount,
            layerOrder: this.graph.order
        });
    }

    private installBuiltins(): void {
        this.graph.register({
            id: "ground",
            requires: ["compiled-surface", "surface-textures", "lighting"],
            owns: ["ground"],
            mount: context => {
                this.presentation.mountGround(context.lease, context.lod);
                this.queries.bindLease(context.lease);
            },
            unmount: context => {
                this.queries.unbindLease(context.key, context.lease);
                this.presentation.unmountGround(context.key);
            },
            setLod: context => { this.presentation.setLod(context.key, context.lod); },
            dispose: () => undefined
        });
        this.graph.register({
            id: "water",
            requires: ["ground", "lighting"],
            owns: ["water"],
            mount: context => { this.presentation.mountWater(context.key); },
            unmount: context => { this.presentation.unmountWater(context.key); },
            dispose: () => undefined
        });
        this.graph.register({
            id: "vegetation",
            requires: ["ground", "lighting", "authority"],
            owns: ["vegetation"],
            mount: context => { this.presentation.mountVegetation(context.key); },
            unmount: context => { this.presentation.unmountVegetation(context.key); },
            dispose: () => undefined
        });
        this.graph.register({
            id: "fog",
            requires: ["ground", "dynamic-fog"],
            mount: () => undefined,
            unmount: () => undefined,
            dispose: () => undefined
        });
    }

    private async prepareState(state: DemandState): Promise<void> {
        const generation = state.generation;
        try {
            state.authorityLease = await this.authority.retain(state.key, {
                priority: state.priority,
                lane: state.lane
            });
            if (!this.isCurrent(state, generation)) return this.releaseTransient(state);
            state.request = this.compilation.request(state.authorityLease.snapshot, state.key, {
                priority: state.priority,
                lane: state.lane
            });
            state.authorityLease.release();
            state.authorityLease = undefined;
            const outcome = await state.request.result;
            state.request = undefined;
            if (!this.isCurrent(state, generation) || outcome.status === "stale") {
                if (outcome.status === "ready") outcome.lease.release();
                this.staleOutcomeCount += 1;
                return;
            }
            state.surfaceLease = outcome.lease;
        } catch (reason) {
            this.releaseTransient(state);
            if (this.isCurrent(state, generation)) {
                this.failedChunkCount += 1;
                this.reportError(asError(reason));
                throw reason;
            }
        } finally {
            if (this.isCurrent(state, generation)) state.task = undefined;
        }
    }

    private async mountPreparedState(state: DemandState): Promise<void> {
        const lease = state.surfaceLease;
        if (!lease) throw new Error("world render demand was published without a prepared surface lease");
        if (this.mountedBytes + lease.chunk.byteLength > this.budgetBytes) {
            throw new RangeError("compiled surface working-set budget cannot admit the exact demand set");
        }
        state.compiledBytesAccounted = true;
        this.mountedBytes += lease.chunk.byteLength;
        const context = this.context(state, lease);
        try {
            await this.graph.mount(context);
            state.context = context;
        } catch (reason) {
            this.mountedBytes -= lease.chunk.byteLength;
            state.compiledBytesAccounted = false;
            state.surfaceLease = undefined;
            lease.release();
            throw reason;
        }
    }

    private async loadState(state: DemandState): Promise<void> {
        await this.prepareState(state);
        if (state.surfaceLease && !state.context) await this.mountPreparedState(state);
    }

    private context(state: DemandState, lease: ResidentSurfaceLease): WorldRenderSessionChunkContext {
        return Object.freeze({
            key: Object.freeze({ ...state.key }),
            effectiveRevision: lease.effectiveRevision,
            lod: state.lod,
            chunk: lease.chunk,
            lease,
            sample: (localU: number, localV: number) => sampleCompiledSurfaceChunk(lease.chunk, localU, localV)
        });
    }

    private applyChangeSet(changeSet: WorldChangeSet): void {
        if (this.stateValue === "disposed") return;
        const keys = changeSet.renderChunks.map(chunk => chunk.key);
        this.compilation.invalidate(keys);
        this.queries.invalidate(keys);
        for (const key of keys) {
            const state = this.demanded.get(keyString(key));
            if (!state) continue;
            this.editRefreshCount += 1;
            this.releaseMounted(state);
            state.request?.cancel();
            state.request = undefined;
            state.authorityLease?.release();
            state.authorityLease = undefined;
            state.generation = this.issueGeneration();
            state.task = this.loadState(state);
            void state.task.catch(error => this.reportError(asError(error)));
        }
    }

    private releaseState(state: DemandState): void {
        state.generation = this.issueGeneration();
        state.request?.cancel();
        state.request = undefined;
        state.authorityLease?.release();
        state.authorityLease = undefined;
        this.releaseMounted(state);
    }

    private releaseMounted(state: DemandState): void {
        if (!state.context || !state.surfaceLease) return;
        const bytes = state.surfaceLease.chunk.byteLength;
        try {
            this.graph.unmount(state.context);
        } finally {
            state.context = undefined;
            state.surfaceLease = undefined;
            if (state.compiledBytesAccounted) this.mountedBytes -= bytes;
            state.compiledBytesAccounted = false;
        }
    }

    private releaseTransient(state: DemandState): void {
        state.request?.cancel();
        state.request = undefined;
        state.authorityLease?.release();
        state.authorityLease = undefined;
        if (state.surfaceLease && state.compiledBytesAccounted) {
            this.mountedBytes -= state.surfaceLease.chunk.byteLength;
            state.compiledBytesAccounted = false;
        }
        state.surfaceLease?.release();
        state.surfaceLease = undefined;
    }

    private isCurrent(state: DemandState, generation: number): boolean {
        return state.generation === generation && this.demanded.get(keyString(state.key)) === state;
    }

    private issueGeneration(): number {
        if (this.nextGeneration >= Number.MAX_SAFE_INTEGER) throw new RangeError("world render session generation space is exhausted");
        this.nextGeneration += 1;
        return this.nextGeneration;
    }

    private assertReady(): void {
        if (this.stateValue !== "ready") throw new Error("WorldRenderSession is not ready");
    }
}

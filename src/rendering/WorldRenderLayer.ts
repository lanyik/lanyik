import { Object3D } from "three";

import { WorldChunkLod, WorldChunkMetadata, WorldChunkKind } from "../helpers/chunks";
import { MapInfo, Point } from "../interfaces";
import { WorldChunk, WorldSource } from "../world/WorldSource";
import { WorldChunkActivation } from "./WorldChunkScheduler";
import type { WorldRenderRefreshKind } from "../world/WorldEditingFacade";

export interface WorldRenderLayerHost {
    readonly map: MapInfo;
    readonly source: WorldSource;
    readonly tileSize: number;
    /** Aborted as soon as the owning render-world generation is superseded. */
    readonly signal: AbortSignal;
    addObject(object: Object3D): void;
    removeObject(object: Object3D): void;
    invalidateVisibility(): void;
    requestWorldCopyRefresh(): void;
}

export interface WorldRenderChunkContext extends WorldRenderLayerHost {
    readonly chunk: WorldChunk;
    readonly key: string;
    readonly points: readonly Point[];
    readonly revision: number;
    isCurrent(): boolean;
}

export interface WorldRenderTileRefreshContext extends WorldRenderLayerHost {
    readonly tiles: readonly Point[];
    readonly refreshKind: WorldRenderRefreshKind;
}

//Layers own construction and disposal of their objects. HexMap owns when a
//source chunk is resident and when a tagged render chunk changes LOD. `kinds`
//defaults to `[id]`; custom objects should tag their chunk metadata with one of
//those values so scheduler callbacks route back to the layer.
export interface WorldRenderLayer {
    readonly id: string;
    readonly kinds?: readonly WorldChunkKind[];
    initialize?(host: WorldRenderLayerHost): void | Promise<void>;
    unloadWorld?(host: WorldRenderLayerHost): void;
    mountChunk(context: WorldRenderChunkContext): void | Promise<void>;
    unmountChunk(context: WorldRenderChunkContext): void;
    /** Return false when the layer cannot handle this refresh kind incrementally. */
    refreshTiles?(context: WorldRenderTileRefreshContext): boolean | void | Promise<boolean | void>;
    enabled?(metadata: WorldChunkMetadata): boolean;
    activateLod?(
        metadata: WorldChunkMetadata,
        lod: WorldChunkLod,
        objects: Object3D[]
    ): WorldChunkActivation | void;
    releaseChunk?(metadata: WorldChunkMetadata): void;
    dispose(): void;
}

export class WorldRenderLayerLifecycleError extends Error {
    public readonly name = "WorldRenderLayerLifecycleError";

    constructor(message: string, public readonly errors: readonly Error[]) {
        super(`${message}${errors.length > 0 ? `: ${errors.map(error => error.message).join("; ")}` : ""}`);
    }
}

function asLifecycleError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

export class WorldRenderLayerRegistry {
    private readonly layers = new Map<string, WorldRenderLayer>();
    private readonly kinds = new Map<WorldChunkKind, WorldRenderLayer>();

    public register(layer: WorldRenderLayer): void {
        if (!layer || typeof layer !== "object" || typeof layer.id !== "string" || !layer.id.trim()) {
            throw new TypeError("world render layer id must be a non-empty string");
        }
        if (this.layers.has(layer.id)) throw new Error(`world render layer "${layer.id}" is already registered`);
        if (typeof layer.mountChunk !== "function" || typeof layer.unmountChunk !== "function"
            || typeof layer.dispose !== "function") {
            throw new TypeError("world render layer must implement mountChunk(), unmountChunk() and dispose()");
        }
        const kinds = layer.kinds ?? [layer.id];
        if (kinds.length === 0 || kinds.some(kind => typeof kind !== "string" || !kind.trim())) {
            throw new TypeError("world render layer kinds must be non-empty strings");
        }
        for (const kind of new Set(kinds)) {
            const owner = this.kinds.get(kind);
            if (owner) throw new Error(`world render kind "${kind}" is already owned by layer "${owner.id}"`);
        }
        this.layers.set(layer.id, layer);
        for (const kind of new Set(kinds)) this.kinds.set(kind, layer);
    }

    public unregister(id: string): WorldRenderLayer | undefined {
        const layer = this.layers.get(id);
        if (!layer) return undefined;
        this.layers.delete(id);
        for (const [kind, owner] of this.kinds) if (owner === layer) this.kinds.delete(kind);
        return layer;
    }

    public get(id: string): WorldRenderLayer | undefined { return this.layers.get(id); }
    public forKind(kind: WorldChunkKind): WorldRenderLayer | undefined { return this.kinds.get(kind); }
    public values(): readonly WorldRenderLayer[] { return [...this.layers.values()]; }

    public dispose(): void {
        const layers = [...this.layers.values()].reverse();
        this.layers.clear();
        this.kinds.clear();
        const errors: Error[] = [];
        for (const layer of layers) {
            try {
                layer.dispose();
            } catch (reason) {
                errors.push(asLifecycleError(reason));
            }
        }
        if (errors.length > 0) {
            throw new WorldRenderLayerLifecycleError("one or more world render layers failed to dispose", errors);
        }
    }
}

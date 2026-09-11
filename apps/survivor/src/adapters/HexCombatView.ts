import {
    DEFAULT_WORLD_WATER_STYLE,
    HexMap,
    Land,
    ProceduralWorldSource,
    createWorldSurfaceResolver,
    getHexCenter,
    type Point,
    type HexMapFrameStartEvent,
    type HexMapFrameEndEvent,
    type WorldWaterGenerationStyle
} from "three-hex-map";
import workerUrl from "three-hex-map/world-generator.worker?url";
import type { CombatStart, CombatView } from "../app/CombatView";
import type { CombatRenderState, MovementInput } from "../core/CombatState";
import { CombatLayer } from "../presentation/CombatLayer";
import { MovementInputController } from "../presentation/MovementInputController";
import { GAME_CONFIG } from "../core/GameConfig";
import { HexRegionMap } from "./HexRegionMap";
import type { AttachRegionMap } from "../app/RegionMapBinding";

export const COMBAT_WATER_STYLE: Readonly<WorldWaterGenerationStyle> = Object.freeze({
    ...DEFAULT_WORLD_WATER_STYLE,
    oceanLevel: 0.32,
    riverSourcesPerCell: 2,
    riverLength: 70
});

function isArenaGround(type: Land, modifiers: readonly string[] | undefined): boolean {
    return type !== Land.sea
        && type !== Land.coastal
        && type !== Land.mountain
        && !modifiers?.includes("lake")
        && !modifiers?.includes("river");
}

/** Finds one bounded, deterministic dry patch before workers or renderer own the world. */
export function findCombatStart(seed: string): { readonly tile: Point; readonly point: CombatStart } {
    const resolver = createWorldSurfaceResolver({ seed, waterStyle: COMBAT_WATER_STYLE });
    const window = resolver.createWindow();
    try {
        for (let ring = 0; ring <= 14; ring += 1) {
            for (let x = -ring; x <= ring; x += 1) {
                for (let y = -ring; y <= ring; y += 1) {
                    if (ring > 0 && Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
                    const tile = { x: x * 6, y: y * 6 };
                    let clear = true;
                    for (let dx = -2; dx <= 2 && clear; dx += 1) {
                        for (let dy = -2; dy <= 2; dy += 1) {
                            const sample = window.resolveGeneratedTile(tile.x + dx, tile.y + dy);
                            if (!isArenaGround(sample.type, sample.modifiers)) { clear = false; break; }
                        }
                    }
                    if (!clear) continue;
                    const center = getHexCenter(tile.x, tile.y, 1);
                    return { tile: Object.freeze(tile), point: Object.freeze({ x: center.x, z: center.y }) };
                }
            }
        }
    } finally {
        window.clear();
    }
    throw new Error("当前世界种子在出生搜索范围内没有连续干燥地面");
}

export class HexCombatView implements CombatView {
    private readonly map: HexMap;
    private readonly layer: CombatLayer;
    private readonly layerReady: Promise<void>;
    private readonly input: MovementInputController;
    private readonly canvas: HTMLCanvasElement;
    private readonly regionMaps = new Set<HexRegionMap>();
    private attempt: { readonly controller: AbortController; source: ProceduralWorldSource | undefined } | undefined;

    constructor(private readonly onError: (error: Error) => void, private readonly terrainWorkers: number) {
        this.map = new HexMap({
            element: "#survivor-world",
            size: 34,
            texturesBaseUrl: `${import.meta.env.BASE_URL}textures/`,
            treeModel: `${import.meta.env.BASE_URL}Assets/models/oak`,
            maxPixelRatio: 1.5,
            treesPerTile: 3,
            grassDensity: 10,
            gridVisible: false,
            skyVisible: false,
            pointerColor: 0x658287,
            selectorColor: 0xffbf69,
            renderDistance: 1500,
            horizonFogStart: GAME_CONFIG.presentation.horizonFogStart,
            horizonFogEnd: GAME_CONFIG.presentation.horizonFogEnd,
            horizonFogColor: GAME_CONFIG.presentation.horizonFogColor,
            lodNearDistance: 420,
            lodFarDistance: 780,
            vegetationRenderDistance: 950
        });
        const camera = this.map.getCamera();
        camera.position.set(-230, 330, 250);
        camera.fov = 47;
        camera.updateProjectionMatrix();
        camera.lookAt(0, 0, 0);
        this.map.cameraPanEnabled = false;
        this.map.on("error", onError);
        this.layer = new CombatLayer(this.map.createResourceAccount("survivor-combat-assets"));
        this.layerReady = this.map.registerWorldRenderLayer(this.layer);
        const canvas = document.querySelector<HTMLCanvasElement>("#survivor-world");
        if (!canvas) throw new Error("Survivor world canvas is missing");
        this.canvas = canvas;
        this.input = new MovementInputController(canvas);
    }

    public async load(seed: string): Promise<CombatStart> {
        this.cancelLoad();
        this.layer.reset();
        this.input.setEnabled(false);
        const controller = new AbortController();
        const source = new ProceduralWorldSource({
            seed,
            workerUrl,
            workerCount: this.terrainWorkers,
            chunkSize: 24,
            waterStyle: COMBAT_WATER_STYLE,
            workCoordinator: this.map.workCoordinator
        });
        const attempt = { controller, source: source as ProceduralWorldSource | undefined };
        this.attempt = attempt;
        try {
            const start = findCombatStart(seed);
            await this.layerReady;
            controller.signal.throwIfAborted();
            // HexMap takes ownership as soon as loadWorld begins, including failure paths.
            attempt.source = undefined;
            await this.map.loadWorld({
                source,
                initialTile: start.tile,
                loadRadius: 2,
                retentionRadius: 3,
                maxResidentChunks: 64,
                adaptiveStreaming: false
            });
            controller.signal.throwIfAborted();
            this.map.setCameraTarget(start.point.x * this.map.size, start.point.z * this.map.size);
            this.input.setEnabled(true);
            this.canvas.focus({ preventScroll: true });
            return start.point;
        } finally {
            attempt.source?.dispose();
            attempt.source = undefined;
            if (this.attempt === attempt) this.attempt = undefined;
        }
    }

    public readMovement(): MovementInput { return this.input.read(this.map.getCamera()); }
    public get workerActivity() { return this.map.workerActivity; }

    public attachRegionMap: AttachRegionMap = canvas => {
        const minimap = new HexRegionMap(this.map, canvas, this.onError);
        this.regionMaps.add(minimap);
        return {
            update: combat => minimap.update(combat), setExpanded: expanded => minimap.setExpanded(expanded),
            dispose: () => { minimap.dispose(); this.regionMaps.delete(minimap); }
        };
    };

    public onFrame(before: (frame: HexMapFrameStartEvent) => void, after: (frame: HexMapFrameEndEvent) => void): () => void {
        this.map.on("beforeframe", before).on("afterframe", after);
        return () => { this.map.off("beforeframe", before).off("afterframe", after); };
    }

    public render(state: CombatRenderState, alpha: number, timestampMs: number): void {
        this.layer.update(state, alpha, timestampMs);
        const player = state.player;
        const blend = Math.max(0, Math.min(1, alpha));
        const x = player.previousX + (player.x - player.previousX) * blend;
        const z = player.previousZ + (player.z - player.previousZ) * blend;
        this.map.setCameraTarget(x * this.map.size, z * this.map.size);
    }

    public clearMovement(): void { this.input.clear(); }

    public dispose(): Promise<void> {
        this.cancelLoad();
        this.input.dispose();
        for (const minimap of this.regionMaps) minimap.dispose();
        this.regionMaps.clear();
        return this.map.disposeAsync();
    }

    private cancelLoad(): void {
        this.attempt?.controller.abort();
        this.attempt?.source?.dispose();
        if (this.attempt) this.attempt.source = undefined;
        this.attempt = undefined;
    }
}

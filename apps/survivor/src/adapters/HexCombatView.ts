import {
    HexMap,
    Land,
    ProceduralWorldSource,
    StaticWorldSource,
    createWorldSurfaceResolver,
    getHexCenter,
    type Point,
    type HexMapFrameStartEvent,
    type HexMapFrameEndEvent,
    type WorldSource,
    type WorldOverviewSource,
} from "three-hex-map";
import workerUrl from "three-hex-map/world-generator.worker?url";
import type { CombatStart, CombatView } from "../app/CombatView";
import type { CombatRenderState, MovementInput } from "../core/CombatState";
import { CombatLayer } from "../presentation/CombatLayer";
import { CombatAudio } from "../presentation/CombatAudio";
import { MovementInputController } from "../presentation/MovementInputController";
import { GAME_CONFIG } from "../core/GameConfig";
import { WORLD_VIEW } from "../core/WorldView";
import { HexRegionMap } from "./HexRegionMap";
import type { AttachRegionMap } from "../app/RegionMapBinding";
import { COMBAT_ENVIRONMENT, COMBAT_WATER_STYLE } from "./CombatEnvironment";
import { ProceduralCombatTerrain } from "./ProceduralCombatTerrain";
import { createHomesteadMap } from "./HomesteadMap";
import { HOMESTEAD, type WorldLocation } from "../core/Homestead";
import { CHALLENGE_SPAWN } from "../core/BossChallenge";
import { createChallengeMap } from "./ChallengeMap";
import { overviewPoint } from "./MapProjection";

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
    const terrain = new ProceduralCombatTerrain(seed);
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
                    if (!terrain.isClear(center.x, center.y, .6)) continue;
                    return { tile: Object.freeze(tile), point: Object.freeze({ x: center.x, z: center.y }) };
                }
            }
        }
    } finally {
        window.clear();
        terrain.dispose();
    }
    throw new Error("当前世界种子在出生搜索范围内没有连续干燥地面");
}

export class HexCombatView implements CombatView {
    public readonly audio = new CombatAudio();
    private readonly unlockAudio = () => { if (this.audio.getSnapshot().status !== "failed") void this.audio.unlock(); };
    private readonly map: HexMap;
    private readonly layer: CombatLayer;
    private readonly layerReady: Promise<void>;
    private readonly input: MovementInputController;
    private readonly canvas: HTMLCanvasElement;
    private readonly regionMaps = new Map<HexRegionMap, WorldOverviewSource | undefined>();
    private attempt: { readonly controller: AbortController; source: WorldSource | undefined } | undefined;
    private location: WorldLocation = "wilds";
    private seed = "";

    constructor(private readonly onError: (error: Error) => void, private readonly terrainWorkers: number) {
        this.map = new HexMap({
            element: "#survivor-world",
            ...COMBAT_ENVIRONMENT,
            texturesBaseUrl: `${import.meta.env.BASE_URL}textures/`,
            treeModel: `${import.meta.env.BASE_URL}Assets/models/oak`,
            maxPixelRatio: 1.5,
            terrainTextureRegionSize: 4,
            grassDensity: 10,
            grassBladeHeight: 3,
            foregroundFadeRadius: COMBAT_ENVIRONMENT.size * 2,
            foregroundFadeHeight: COMBAT_ENVIRONMENT.size * .9,
            gridVisible: false,
            skyVisible: true,
            pointerColor: 0x658287,
            selectorColor: 0xffbf69,
            renderDistance: WORLD_VIEW.terrainEnd * WORLD_VIEW.unitScale,
            horizonFogStart: GAME_CONFIG.presentation.horizonFogStart,
            horizonFogEnd: GAME_CONFIG.presentation.horizonFogEnd,
            horizonFogColor: GAME_CONFIG.presentation.horizonFogColor,
            lodNearDistance: 420,
            lodFarDistance: 1000,
            vegetationRenderDistance: WORLD_VIEW.vegetationEnd * WORLD_VIEW.unitScale
        });
        try {
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
            window.addEventListener("pointerdown", this.unlockAudio);
            window.addEventListener("keydown", this.unlockAudio);
        } catch (error) {
            this.map.dispose();
            throw error;
        }
    }

    public async load(seed: string, position?: CombatStart, location: WorldLocation = "wilds"): Promise<CombatStart> {
        this.cancelLoad();
        this.location = location; this.seed = seed;
        this.input.setEnabled(false);
        const controller = new AbortController();
        const source = location !== "wilds" ? new StaticWorldSource(location === "homestead" ? createHomesteadMap() : createChallengeMap(), { chunkSize: WORLD_VIEW.terrainChunkSize }) : new ProceduralWorldSource({
            seed,
            workerUrl,
            workerCount: this.terrainWorkers,
            chunkSize: WORLD_VIEW.terrainChunkSize,
            waterStyle: COMBAT_WATER_STYLE,
            workCoordinator: this.map.workCoordinator
        });
        const attempt = { controller, source: source as WorldSource | undefined };
        this.attempt = attempt;
        try {
            const start = position ? { point: { x: position.x, z: position.z }, tile: { x: Math.round(position.x / 1.5), y: Math.round(position.z / Math.sqrt(3)) } } : findCombatStart(seed);
            const target = location !== "wilds" && !position ? { point: location === "homestead" ? HOMESTEAD.spawn : CHALLENGE_SPAWN,
                tile: location === "homestead" ? { x: 32, y: 32 } : { x: 20, y: 30 } } : start;
            await this.layerReady;
            controller.signal.throwIfAborted();
            // HexMap takes ownership as soon as loadWorld begins, including failure paths.
            attempt.source = undefined;
            await this.map.loadWorld({
                source,
                initialTile: target.tile,
                loadRadius: WORLD_VIEW.terrainLoadRadius,
                retentionRadius: WORLD_VIEW.terrainRetentionRadius,
                maxResidentChunks: 64,
                adaptiveStreaming: false
            });
            controller.signal.throwIfAborted();
            this.layer.setLocation(location);
            this.map.setCameraTarget(target.point.x * this.map.size, target.point.z * this.map.size);
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

    public attachRegionMap: AttachRegionMap = (canvas, controls, preview) => {
        let source: WorldOverviewSource | undefined;
        if (preview && preview.location !== this.location) source = preview.location === "wilds"
            ? new ProceduralWorldSource({ seed: this.seed, workerUrl, workerCount: 1, chunkSize: WORLD_VIEW.terrainChunkSize,
                waterStyle: COMBAT_WATER_STYLE, workCoordinator: this.map.workCoordinator })
            : new StaticWorldSource(preview.location === "homestead" ? createHomesteadMap() : createChallengeMap(), { chunkSize: WORLD_VIEW.terrainChunkSize });
        let current = preview?.combat;
        const focus = preview ? () => {
            const point = overviewPoint(current!.player.x, current!.player.z);
            return { x: Math.round(point.x - .5), y: Math.round(point.y - .5) };
        } : undefined;
        let minimap: HexRegionMap;
        try { minimap = new HexRegionMap(this.map, canvas, controls, this.onError, source, focus); }
        catch (error) { source?.dispose(); throw error; }
        this.regionMaps.set(minimap, source);
        return {
            update: (combat, exploration) => { current = combat; minimap.update(combat, exploration); }, setExpanded: expanded => minimap.setExpanded(expanded),
            recenter: () => minimap.recenter(), navigate: () => minimap.navigate(),
            dispose: () => { minimap.dispose(); source?.dispose(); this.regionMaps.delete(minimap); }
        };
    };

    public onFrame(before: (frame: HexMapFrameStartEvent) => void, after: (frame: HexMapFrameEndEvent) => void): () => void {
        this.map.on("beforeframe", before).on("afterframe", after);
        return () => { this.map.off("beforeframe", before).off("afterframe", after); };
    }

    public render(state: CombatRenderState, alpha: number, timestampMs: number): void {
        this.layer.update(state, alpha, timestampMs);
        this.audio.update(state.player);
        const player = state.player;
        const blend = Math.max(0, Math.min(1, alpha));
        const x = player.previousX + (player.x - player.previousX) * blend;
        const z = player.previousZ + (player.z - player.previousZ) * blend;
        this.map.setCameraTarget(x * this.map.size, z * this.map.size);
    }

    public clearMovement(): void { this.input.clear(); }
    public setPresentationActive(active: boolean): void { this.layer.setPresentationActive(active); this.audio.setActive(active); }
    public reset(): void { this.layer.reset(); this.audio.reset(); }

    public dispose(): Promise<void> {
        this.cancelLoad();
        this.input.dispose();
        window.removeEventListener("pointerdown", this.unlockAudio);
        window.removeEventListener("keydown", this.unlockAudio);
        for (const [minimap, source] of this.regionMaps) { minimap.dispose(); source?.dispose(); }
        this.regionMaps.clear();
        return Promise.all([this.audio.dispose(), this.map.disposeAsync()]).then(() => undefined);
    }

    private cancelLoad(): void {
        this.attempt?.controller.abort();
        this.attempt?.source?.dispose();
        if (this.attempt) this.attempt.source = undefined;
        this.attempt = undefined;
    }
}

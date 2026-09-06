import { HexMap, ProceduralWorldSource } from "three-hex-map";
import workerUrl from "three-hex-map/world-generator.worker?url";
import type { WorldSelection, WorldView } from "../app/WorldView";
import type { TilePosition } from "../content/minerals";
import { MineralField } from "../core/resources/MineralField";
import { MineralLayer } from "../presentation/layers/MineralLayer";
import { surveyLanding, toSurveyTerrain } from "./surveyTerrain";
import type { LandingSurvey } from "../scenarios/landingSurvey";
import type { TerrainWindow } from "../scenarios/landingSurvey";
import type { ConstructionTile, IndustrySnapshot, Placement } from "../core/construction/Industry";
import { BuildingLayer } from "../presentation/layers/BuildingLayer";
import { ExplorerLayer } from "../presentation/layers/ExplorerLayer";
import { ExplorerInput } from "../presentation/ExplorerInput";
import type { ExplorerSnapshot, GroundPoint, MovementInput } from "../core/exploration/Explorer";

export class HexWorldView implements WorldView {
    private readonly map: HexMap;
    private readonly layerReady: Promise<void>;
    private readonly minerals: MineralLayer;
    private readonly buildings: BuildingLayer;
    private readonly explorer: ExplorerLayer;
    private readonly input: ExplorerInput;
    private following = false;
    private followPoint: GroundPoint | undefined;
    private readonly canvas: HTMLCanvasElement;
    private terrain: TerrainWindow | undefined;
    private constructionTiles: readonly ConstructionTile[] = [];
    private pointer: { x: number; y: number } | undefined;
    private readonly cameraState = new Float64Array(32).fill(NaN);
    private field: MineralField | undefined;
    private attempt: { controller: AbortController; source: ProceduralWorldSource | undefined } | undefined;

    constructor(onSelect: (selection: WorldSelection) => void, onError: (error: Error) => void,
        private readonly onHover: (position: TilePosition | undefined) => void) {
        this.map = new HexMap({
            element: "#expedition-world",
            size: 48,
            texturesBaseUrl: `${import.meta.env.BASE_URL}textures/`,
            treeModel: `${import.meta.env.BASE_URL}Assets/models/oak`,
            maxPixelRatio: 1.5,
            cameraMaxDistance: 1800,
            treesPerTile: 4,
            grassDensity: 12,
            gridVisible: false,
            pointerColor: 0x79d7ce,
            selectorColor: 0xefc17b,
            renderDistance: 2800,
            lodNearDistance: 550,
            lodFarDistance: 1100,
            vegetationRenderDistance: 2400
        });
        const target = this.map.getCameraTarget();
        const camera = this.map.getCamera();
        camera.position.set(target.x - 400, target.y + 640, target.z + 400);
        camera.lookAt(target);
        this.map.on("click", ({ x, y, tile }) => {
            onSelect({ x, y, terrain: tile.type, modifiers: tile.modifiers ?? [],
                mineral: this.field?.nodeAt(x, y, toSurveyTerrain(tile)) });
        });
        this.map.on("error", onError);
        this.minerals = new MineralLayer(this.map.createResourceAccount("mineral-assets"));
        this.buildings = new BuildingLayer(this.map.createResourceAccount("building-assets"));
        this.explorer = new ExplorerLayer(this.map.createResourceAccount("explorer-assets"));
        this.layerReady = this.map.registerWorldRenderLayer(this.minerals).then(() => this.map.registerWorldRenderLayer(this.buildings))
            .then(() => this.map.registerWorldRenderLayer(this.explorer));
        this.canvas = document.querySelector<HTMLCanvasElement>("#expedition-world")!;
        this.input = new ExplorerInput(this.canvas);
        this.canvas.addEventListener("pointermove", this.pointerMoved);
        this.canvas.addEventListener("pointerleave", this.pointerLeft);
        this.map.on("frame", () => {
            if (!this.pointer) return;
            const camera = this.map.getCamera();
            let changed = false;
            for (let index = 0; index < 32; index += 1) {
                const value = index < 16 ? camera.matrixWorld.elements[index] : camera.projectionMatrix.elements[index - 16];
                if (this.cameraState[index] !== value) { this.cameraState[index] = value; changed = true; }
            }
            if (changed) this.updateHover();
        });
    }

    public async load(seed: string): Promise<LandingSurvey> {
        this.cancelSurvey();
        this.showExplorer(undefined);
        this.terrain = undefined;
        this.constructionTiles = [];
        this.buildings.setBuildings([]);
        this.buildings.showPlacement(undefined);
        this.minerals.setDepleted([]);
        const controller = new AbortController();
        const source = new ProceduralWorldSource({
            seed,
            workerUrl,
            chunkSize: 24,
            workCoordinator: this.map.workCoordinator
        });
        const attempt = { controller, source: source as ProceduralWorldSource | undefined };
        this.attempt = attempt;
        try {
            await this.layerReady;
            controller.signal.throwIfAborted();
            const field = new MineralField(seed);
            const { survey, terrain } = await surveyLanding(source, field, controller.signal);
            controller.signal.throwIfAborted();
            // loadWorld takes ownership even when its load plan fails.
            attempt.source = undefined;
            await this.map.loadWorld({ source, initialTile: survey.landing, adaptiveStreaming: false });
            controller.signal.throwIfAborted();
            this.field = field;
            this.terrain = terrain;
            this.constructionTiles = terrain.tiles.map((tile, index) => Object.freeze({ terrain: Object.freeze(tile),
                mineral: field.nodeAt(terrain.originX + index % terrain.size, terrain.originY + Math.floor(index / terrain.size), tile) }));
            return survey;
        } finally {
            attempt.source?.dispose();
            attempt.source = undefined;
            if (this.attempt === attempt) this.attempt = undefined;
        }
    }

    public focus(position: TilePosition): void { this.map.setCameraTargetTile(position.x, position.y); }

    public readTile(position: TilePosition): ConstructionTile | undefined {
        const window = this.terrain;
        if (!window || !this.field) return undefined;
        const x = position.x - window.originX;
        const y = position.y - window.originY;
        if (x < 0 || y < 0 || x >= window.size || y >= window.size) return undefined;
        return this.constructionTiles[y * window.size + x];
    }
    public showIndustry(state: IndustrySnapshot): void {
        this.buildings.setBuildings(state.buildings);
        this.minerals.setDepleted(state.depleted);
    }
    public showPlacement(placement: Placement | undefined): void { this.buildings.showPlacement(placement); }
    public readMovement(): MovementInput { return this.input.read(this.map.getCamera()); }
    public clearMovement(): void { this.input.clear(); }
    public showExplorer(state: ExplorerSnapshot | undefined, point?: GroundPoint): void {
        const following = !!state;
        if (following !== this.following) {
            this.following = following;
            this.followPoint = undefined;
            this.map.cameraPanEnabled = !following;
            this.input.setEnabled(following);
        }
        const position = point ?? state;
        this.explorer.update(state, position);
        if (position && (position.x !== this.followPoint?.x || position.z !== this.followPoint?.z)) {
            this.map.setCameraTarget(position.x * this.map.size, position.z * this.map.size);
            this.followPoint = { x: position.x, z: position.z };
        }
    }

    public dispose(): Promise<void> {
        this.cancelSurvey();
        this.canvas.removeEventListener("pointermove", this.pointerMoved);
        this.canvas.removeEventListener("pointerleave", this.pointerLeft);
        this.input.dispose();
        this.terrain = undefined;
        this.constructionTiles = [];
        return this.map.disposeAsync();
    }

    private readonly pointerMoved = (event: PointerEvent): void => {
        this.pointer = { x: event.clientX, y: event.clientY };
        this.updateHover();
    };
    private readonly pointerLeft = (): void => { this.pointer = undefined; this.onHover(undefined); };
    private updateHover(): void {
        const tile = this.pointer && this.map.pickTileAtScreen(this.pointer.x, this.pointer.y);
        this.onHover(tile && { x: tile.x, y: tile.y });
    }

    private cancelSurvey(): void {
        this.attempt?.controller.abort();
        this.attempt?.source?.dispose();
        if (this.attempt) this.attempt.source = undefined;
        this.attempt = undefined;
    }
}

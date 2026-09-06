import { HexMap, ProceduralWorldSource } from "three-hex-map";
import workerUrl from "three-hex-map/world-generator.worker?url";
import type { WorldSelection, WorldView } from "../app/WorldView";
import type { TilePosition } from "../content/minerals";
import { MineralField } from "../core/resources/MineralField";
import { MineralLayer } from "../presentation/layers/MineralLayer";
import { surveyLanding, toSurveyTerrain } from "./surveyTerrain";
import type { LandingSurvey } from "../scenarios/landingSurvey";

export class HexWorldView implements WorldView {
    private readonly map: HexMap;
    private readonly layerReady: Promise<void>;
    private field: MineralField | undefined;
    private attempt: { controller: AbortController; source: ProceduralWorldSource | undefined } | undefined;

    constructor(onSelect: (selection: WorldSelection) => void, onError: (error: Error) => void) {
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
        this.layerReady = this.map.registerWorldRenderLayer(new MineralLayer(this.map.createResourceAccount("mineral-assets")));
    }

    public async load(seed: string): Promise<LandingSurvey> {
        this.cancelSurvey();
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
            const survey = await surveyLanding(source, field, controller.signal);
            controller.signal.throwIfAborted();
            // loadWorld takes ownership even when its load plan fails.
            attempt.source = undefined;
            await this.map.loadWorld({ source, initialTile: survey.landing, adaptiveStreaming: false });
            controller.signal.throwIfAborted();
            this.field = field;
            return survey;
        } finally {
            attempt.source?.dispose();
            attempt.source = undefined;
            if (this.attempt === attempt) this.attempt = undefined;
        }
    }

    public focus(position: TilePosition): void { this.map.setCameraTargetTile(position.x, position.y); }

    public dispose(): Promise<void> {
        this.cancelSurvey();
        return this.map.disposeAsync();
    }

    private cancelSurvey(): void {
        this.attempt?.controller.abort();
        this.attempt?.source?.dispose();
        if (this.attempt) this.attempt.source = undefined;
        this.attempt = undefined;
    }
}

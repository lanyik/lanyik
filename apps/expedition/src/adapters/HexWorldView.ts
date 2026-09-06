import { HexMap, ProceduralWorldSource } from "three-hex-map";
import workerUrl from "three-hex-map/world-generator.worker?url";
import type { WorldSelection, WorldView } from "../app/WorldView";

export class HexWorldView implements WorldView {
    private readonly map: HexMap;

    constructor(onSelect: (selection: WorldSelection) => void, onError: (error: Error) => void) {
        this.map = new HexMap({
            element: "#expedition-world",
            size: 48,
            texturesBaseUrl: `${import.meta.env.BASE_URL}textures/`,
            treeModel: `${import.meta.env.BASE_URL}Assets/models/oak`,
            maxPixelRatio: 1.5,
            treesPerTile: 4,
            grassDensity: 12,
            gridVisible: false,
            pointerColor: 0x79d7ce,
            selectorColor: 0xefc17b,
            renderDistance: 1400,
            lodNearDistance: 550,
            lodFarDistance: 1100,
            vegetationRenderDistance: 1250
        });
        const target = this.map.getCameraTarget();
        const camera = this.map.getCamera();
        camera.position.set(target.x - 280, target.y + 360, target.z + 280);
        camera.lookAt(target);
        this.map.on("click", ({ x, y, tile }) => {
            onSelect({ x, y, terrain: tile.type, modifiers: tile.modifiers ?? [] });
        });
        this.map.on("error", onError);
    }

    public async load(seed: string): Promise<void> {
        const source = new ProceduralWorldSource({
            seed,
            workerUrl,
            chunkSize: 24,
            workCoordinator: this.map.workCoordinator
        });
        await this.map.loadWorld({ source, initialTile: { x: 0, y: 0 }, adaptiveStreaming: false });
    }

    public dispose(): Promise<void> { return this.map.disposeAsync(); }
}

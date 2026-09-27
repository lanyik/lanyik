import { BufferGeometryLoader, Group, Mesh, MeshStandardMaterial, type BufferGeometry } from "three";
import { HOMESTEAD } from "../core/Homestead";
import { AssetLoader } from "./AssetLoader";
import { HomesteadSea } from "./HomesteadSea";

/** Downloaded CC0 buildings, baked offline; shared lifetime and budget with the combat layer. */
export class HomesteadModels {
    public readonly root = new Group();
    private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: .9 });
    private readonly sea = new HomesteadSea();
    private constructor(private readonly models: Record<string, BufferGeometry>) {
        this.root.name = "homestead-buildings";
        this.root.add(this.sea.root);
        for (const building of HOMESTEAD.buildings) {
            const mesh = new Mesh(models[building.model], this.material);
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.name = `homestead-${building.model}`; mesh.position.set(building.x, .025, building.z);
            this.root.add(mesh);
        }
    }
    public static async load(signal: AbortSignal): Promise<HomesteadModels> {
        const loader = new AssetLoader(signal), models: Record<string, BufferGeometry> = {};
        try {
            const json = JSON.parse(new TextDecoder().decode(await loader.bytes(`${import.meta.env.BASE_URL}homestead/models.json`)));
            loader.signal.throwIfAborted();
            for (const building of HOMESTEAD.buildings) models[building.model] = new BufferGeometryLoader().parse(json[building.model]);
            return new HomesteadModels(models);
        } catch (error) { Object.values(models).forEach(geometry => geometry.dispose()); throw error; }
        finally { loader.dispose(); }
    }
    public update(seconds: number): void { this.sea.update(seconds); }
    public dispose(): void {
        this.root.removeFromParent(); this.sea.dispose(); this.material.dispose();
        Object.values(this.models).forEach(geometry => geometry.dispose());
    }
}

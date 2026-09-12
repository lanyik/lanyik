import { BufferGeometryLoader, Color, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, TorusGeometry, type BufferGeometry, type Vector2 } from "three";
import { MAX_GROUND_EQUIPMENT } from "../core/GameConfig";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";
import { installActorFade } from "./ActorVisibility";
import { AssetLoader } from "./AssetLoader";

export class LootModels {
    public readonly root = new Group();
    public readonly loot: readonly InstancedMesh[];
    public readonly chest: InstancedMesh;
    private readonly materials: MeshStandardMaterial[];
    private readonly geometries: BufferGeometry[];

    private constructor(models: Record<string, BufferGeometry>, center: Vector2) {
        const material = new MeshStandardMaterial({ vertexColors: true, roughness: .65, metalness: .25 });
        const gemMaterial = new MeshStandardMaterial({ roughness: .2, metalness: .65, emissive: 0x18212b });
        this.materials = [material, gemMaterial];
        for (const entry of this.materials) installActorFade(entry, center);
        const orb = new IcosahedronGeometry(.22, 0), jewel = new TorusGeometry(.15, .055, 6, 12);
        this.geometries = [...Object.values(models), orb, jewel];
        const make = (geometry: BufferGeometry, mat: MeshStandardMaterial, count: number) => {
            const mesh = new InstancedMesh(geometry, mat, count); mesh.count = 0; mesh.frustumCulled = false;
            mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.setColorAt(0, new Color()); mesh.instanceColor!.setUsage(DynamicDrawUsage);
            this.root.add(mesh); return mesh;
        };
        this.loot = [models["weapon-sword"], orb, models.potion, models.potion, models.potion, models.potion, models["shield-round"], jewel]
            .map(geometry => make(geometry, geometry === orb || geometry === jewel ? gemMaterial : material, MAX_GROUND_EQUIPMENT));
        this.chest = make(models.chest, material, MAX_COMBAT_CHUNKS);
    }

    public static async load(center: Vector2, signal: AbortSignal): Promise<LootModels> {
        const loader = new AssetLoader(signal), models: Record<string, BufferGeometry> = {};
        try {
            const json = JSON.parse(new TextDecoder().decode(await loader.bytes(`${import.meta.env.BASE_URL}loot/models.json`)));
            loader.signal.throwIfAborted();
            for (const name of ["chest", "potion", "weapon-sword", "shield-round"]) models[name] = new BufferGeometryLoader().parse(json[name]);
            return new LootModels(models, center);
        } catch (error) { for (const geometry of Object.values(models)) geometry.dispose(); throw error; }
        finally { loader.dispose(); }
    }

    public reset(): void { for (const mesh of this.loot) mesh.count = 0; this.chest.count = 0; }
    public dispose(): void {
        this.root.removeFromParent();
        for (const mesh of [...this.loot, this.chest]) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}

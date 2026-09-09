import { DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader, type Texture, type BufferGeometry, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { InstancedBufferAttribute, type Vector2 } from "three";
import { installActorFade } from "./ActorVisibility";
import { ActorAction } from "../core/CombatWorld";
import { ACTOR_POSES, MOVEMENT_POSES, writeActorPose } from "./ActorPose";

const NAMES = ["Ranger", "Puglin", "Imp", "Puglin_Brute", "Imp_Shaman"] as const;

/** One fixed instance pool per primitive; all actors share build-time baked animation poses. */
export class ActorModels {
    public readonly hero = new Group();
    public readonly enemies: InstancedMesh[][] = [];
    private readonly geometries = new Set<BufferGeometry>();
    private readonly materials = new Set<Material>();
    private readonly textures = new Set<Texture>();
    private readonly heroMeshes: Mesh[] = [];
    private heroCycle = 0;
    private readonly pose = new Mesh();

    private constructor() { this.pose.morphTargetInfluences = new Array(ACTOR_POSES).fill(0); }

    public static async load(capacity: number, viewCenter: Vector2): Promise<ActorModels> {
        const actors = new ActorModels();
        try {
            for (let kind = 0; kind < NAMES.length; kind++) {
                const base = `${import.meta.env.BASE_URL}actors/${NAMES[kind]}`;
                const gltf = await new GLTFLoader().loadAsync(`${base}.glb`);
                const parts: Mesh[] = [];
                gltf.scene.traverse(object => {
                    if (object instanceof Mesh) {
                        actors.geometries.add(object.geometry);
                        const materials = Array.isArray(object.material) ? object.material : [object.material];
                        for (const material of materials) actors.materials.add(material);
                        parts.push(object);
                    }
                });
                if (parts.length !== 1) throw new Error(`${NAMES[kind]}: expected one baked primitive`);
                const atlases: Texture[] = [];
                for (const channel of ["color", "normal", "orm", "emissive"]) {
                    const atlas = await new TextureLoader().loadAsync(`${base}-${channel}.png`).catch(error => {
                        throw new Error(`${NAMES[kind]}-${channel}.png: texture load failed`, { cause: error });
                    });
                    if (channel === "color" || channel === "emissive") atlas.colorSpace = SRGBColorSpace;
                    atlas.flipY = false; actors.textures.add(atlas); atlases.push(atlas);
                }
                const pool: InstancedMesh[] = [];
                if (kind > 0) actors.enemies.push(pool);
                for (const mesh of parts) {
                    const cycle: unknown = mesh.userData.cycle;
                    if (!(mesh.material instanceof MeshStandardMaterial) || mesh.geometry.morphAttributes.position?.length !== (kind === 0 ? MOVEMENT_POSES : ACTOR_POSES)
                        || mesh.geometry.morphAttributes.normal?.length !== (kind === 0 ? MOVEMENT_POSES : ACTOR_POSES)
                        || typeof cycle !== "number" || !Number.isFinite(cycle) || cycle <= 0) throw new Error(`${NAMES[kind]}: invalid baked actor`);
                    mesh.material.map = atlases[0]; mesh.material.normalMap = atlases[1];
                    mesh.material.roughnessMap = atlases[2]; mesh.material.metalnessMap = atlases[2];
                    mesh.material.emissiveMap = atlases[3];
                    mesh.material.needsUpdate = true;
                    if (kind === 0) { actors.hero.add(mesh); actors.heroMeshes.push(mesh); actors.heroCycle = cycle; }
                    else {
                        installActorFade(mesh.material, viewCenter, true);
                        mesh.geometry.setAttribute("actorHome", new InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(DynamicDrawUsage));
                        const instance = new InstancedMesh(mesh.geometry, mesh.material, capacity);
                        instance.userData.cycle = cycle;
                        instance.name = NAMES[kind];
                        instance.instanceMatrix.setUsage(DynamicDrawUsage);
                        instance.setColorAt(0, mesh.material.color.clone().set(0xffffff));
                        // Allocate full capacity before shrinking the active prefix. Budget collectors see the texture immediately.
                        instance.setMorphAt(0, actors.pose);
                        instance.count = 0; instance.frustumCulled = false;
                        pool.push(instance);
                    }
                }
            }
            return actors;
        } catch (error) { actors.dispose(); throw error; }
    }

    public animateHero(seconds: number, moving: boolean): void {
        writeActorPose(this.pose.morphTargetInfluences!, seconds / this.heroCycle, moving ? ActorAction.Moving : ActorAction.Idle, 0);
        for (const mesh of this.heroMeshes) for (let index = 0; index < MOVEMENT_POSES; index++) mesh.morphTargetInfluences![index] = this.pose.morphTargetInfluences![index];
    }
    public animateEnemy(mesh: InstancedMesh, index: number, seconds: number, phaseOffset: number, action: ActorAction, progress: number): void {
        writeActorPose(this.pose.morphTargetInfluences!, seconds / mesh.userData.cycle + phaseOffset, action, progress);
        mesh.setMorphAt(index, this.pose);
    }
    public dispose(): void {
        for (const pool of this.enemies) for (const mesh of pool) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
        for (const texture of this.textures) texture.dispose();
        this.pose.geometry.dispose();
        (this.pose.material as Material).dispose();
    }
}

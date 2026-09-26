import { DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshStandardMaterial, SRGBColorSpace, type Texture, type BufferGeometry, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { InstancedBufferAttribute, type Vector2, type Vector3 } from "three";
import { installActorFade } from "./ActorVisibility";
import { ActorAction } from "../core/CombatWorld";
import { ACTOR_POSES, ActorPoseMixer } from "./ActorPose";
import { HERO_POSES, HERO_CLIPS } from "./HeroClips.generated";
import { HeroPose } from "./HeroPose";
import type { PlayerRenderState } from "../core/CombatState";
import { AssetLoader } from "./AssetLoader";
import { GAME_CONFIG, ENTITY_CAPACITY } from "../core/GameConfig";

const NAMES = ["Ranger", "Puglin", "Puglin_Brute", "Imp_Shaman", "RiftSpider", "StoneSentinel"] as const;

function disposeDecodedActor(gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>): void {
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
    gltf.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
}

/** One fixed instance pool per primitive; all actors share build-time baked animation poses. */
export class ActorModels {
    public readonly hero = new Group();
    public readonly enemies: InstancedMesh[][] = [];
    private readonly geometries = new Set<BufferGeometry>();
    private readonly materials = new Set<Material>();
    private readonly textures = new Set<Texture>();
    private readonly heroMeshes: Mesh[] = [];
    private readonly heroPose = new HeroPose();
    private readonly pose = new Mesh();
    private readonly mixer = new ActorPoseMixer(ENTITY_CAPACITY);

    private constructor() { this.pose.morphTargetInfluences = new Array(ACTOR_POSES).fill(0); }

    public static async load(capacity: number, viewCenter: Vector2, signal: AbortSignal): Promise<ActorModels> {
        const actors = new ActorModels();
        const loader = new AssetLoader(signal);
        try {
            const parts: Mesh[][] = NAMES.map(() => []), atlases: Texture[][] = NAMES.map(() => []);
            const channels = ["color", "normal", "orm", "emissive"] as const;
            const requests = NAMES.flatMap((name, kind) => [-1, 0, 1, 2, 3].map(channel => ({ name, kind, channel })));
            await loader.parallel(requests, GAME_CONFIG.presentation.assetLoadConcurrency, async ({ name, kind, channel }) => {
                const base = `${import.meta.env.BASE_URL}actors/${name}`;
                if (channel < 0) {
                    const gltf = await loader.decode(new GLTFLoader().parseAsync(await loader.bytes(`${base}.glb`), ""), disposeDecodedActor)
                        .catch(error => {
                            loader.signal.throwIfAborted();
                            throw new Error(`${name}.glb: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
                        });
                    gltf.scene.traverse(object => {
                        if (!(object instanceof Mesh)) return;
                        actors.geometries.add(object.geometry);
                        for (const material of Array.isArray(object.material) ? object.material : [object.material]) actors.materials.add(material);
                        parts[kind].push(object);
                    });
                    if (parts[kind].length !== 1) throw new Error(`${name}: expected one baked primitive`);
                } else {
                    const atlas = await loader.texture(`${base}-${channels[channel]}.png`);
                    if (channel === 0 || channel === 3) atlas.colorSpace = SRGBColorSpace;
                    actors.textures.add(atlas); atlases[kind][channel] = atlas;
                }
            });
            for (let kind = 0; kind < NAMES.length; kind++) {
                const pool: InstancedMesh[] = [];
                if (kind > 0) actors.enemies.push(pool);
                for (const mesh of parts[kind]) {
                    const cycle: unknown = mesh.userData.cycle;
                    const idleCycle: unknown = mesh.userData.idleCycle;
                    if (!(mesh.material instanceof MeshStandardMaterial) || mesh.geometry.morphAttributes.position?.length !== (kind === 0 ? HERO_POSES : ACTOR_POSES)
                        || mesh.geometry.morphAttributes.normal?.length !== (kind === 0 ? HERO_POSES : ACTOR_POSES)
                        || typeof cycle !== "number" || !Number.isFinite(cycle) || cycle <= 0
                        || typeof idleCycle !== "number" || !Number.isFinite(idleCycle) || idleCycle <= 0) throw new Error(`${NAMES[kind]}: invalid baked actor`);
                    mesh.material.map = atlases[kind][0]; mesh.material.normalMap = atlases[kind][1];
                    mesh.material.roughnessMap = atlases[kind][2]; mesh.material.metalnessMap = atlases[kind][2];
                    mesh.material.emissiveMap = atlases[kind][3];
                    mesh.material.needsUpdate = true;
                    if (kind === 0) {
                        if (JSON.stringify(mesh.userData.heroClips) !== JSON.stringify(HERO_CLIPS)) throw new Error("Ranger: mismatched hero clips; rebuild assets");
                        actors.hero.add(mesh); actors.heroMeshes.push(mesh);
                    }
                    else {
                        installActorFade(mesh.material, viewCenter, true);
                        mesh.geometry.setAttribute("actorHome", new InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(DynamicDrawUsage));
                        const instance = new InstancedMesh(mesh.geometry, mesh.material, capacity);
                        instance.userData.cycle = cycle;
                        instance.userData.idleCycle = idleCycle;
                        if (kind === 3) {
                            const socket = mesh.userData.castingHand;
                            if (!Array.isArray(socket) || socket.length !== ACTOR_POSES * 3 || !socket.every(Number.isFinite)) throw new Error("Imp_Shaman: invalid casting hand curve");
                            instance.userData.castingHand = socket;
                        }
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
        finally { loader.dispose(); }
    }

    public animateHero(player: PlayerRenderState, timestampMs: number, active: boolean, frozen: boolean): number {
        for (const mesh of this.heroMeshes) this.heroPose.write(mesh.morphTargetInfluences!, player, timestampMs, active, frozen);
        return this.heroPose.heading;
    }
    public suspendHero(): void { this.heroPose.suspend(); }
    public animateEnemy(mesh: InstancedMesh, index: number, slot: number, id: number, seconds: number, action: ActorAction, progress: number): void {
        const cycle = action === ActorAction.Idle ? mesh.userData.idleCycle : mesh.userData.cycle;
        this.mixer.write(this.pose.morphTargetInfluences!, slot, id, seconds, seconds / cycle + id * .37, action, progress);
        mesh.setMorphAt(index, this.pose);
    }
    public castingHand(mesh: InstancedMesh, result: Vector3): boolean {
        const socket: number[] | undefined = mesh.userData.castingHand;
        if (!socket) return false;
        result.set(0, 0, 0);
        for (let i = 0; i < ACTOR_POSES; i++) {
            const weight = this.pose.morphTargetInfluences![i];
            result.x += socket[i * 3] * weight; result.y += socket[i * 3 + 1] * weight; result.z += socket[i * 3 + 2] * weight;
        }
        return true;
    }
    public reset(): void { this.mixer.reset(); this.heroPose.reset(); }
    public get poseBuffers(): readonly ArrayBufferView[] { return [...this.mixer.buffers, ...this.heroPose.buffers]; }
    public dispose(): void {
        for (const pool of this.enemies) for (const mesh of pool) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
        for (const texture of this.textures) texture.dispose();
        this.pose.geometry.dispose();
        (this.pose.material as Material).dispose();
    }
}

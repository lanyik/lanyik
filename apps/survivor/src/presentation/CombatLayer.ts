import {
    BoxGeometry,
    CircleGeometry,
    CylinderGeometry,
    Color,
    DoubleSide,
    DynamicDrawUsage,
    Group,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    OctahedronGeometry,
    RingGeometry,
    SphereGeometry,
    Vector2
} from "three";
import {
    collectObject3DResourceAllocations,
    type ResourceBudgetAccount,
    type WorldRenderLayer,
    type WorldRenderLayerHost
} from "three-hex-map";
import {
    MAX_ENEMIES,
    MAX_EXPERIENCE_ORBS,
    MAX_GROUND_EQUIPMENT,
    MAX_PROJECTILES,
    type CombatRenderState
} from "../core/CombatSimulation";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";

import { ActorModels } from "./ActorModels";
import { ACTOR_FADE_END, actorVisibility, installActorFade } from "./ActorVisibility";
const RARITY_COLORS = [new Color(0xd7d9dc), new Color(0x5fa8ff), new Color(0xc56cff), new Color(0xffa93a), new Color(0x70f5ed), new Color(0xff79dc)] as const;
const CHEST_COLORS = [new Color(0xb87838), new Color(0xd7e0ed), new Color(0xffc34b), new Color(0x70f5ed), new Color(0xff79dc)] as const;
const WHITE = new Color(0xffffff);
const ELITE = new Color(0xffc857);
const BOSS = new Color(0xa922ee);

/** Converts the map's flat-top even-q layout back from logical ground coordinates. */
export function groundTile(point: { readonly x: number; readonly z: number }): { readonly x: number; readonly y: number } {
    const q = point.x * 2 / 3;
    const r = (point.z - Math.sqrt(3) / 2) / Math.sqrt(3) - q / 2;
    let x = Math.round(q);
    let y = Math.round(r);
    const s = Math.round(-q - r);
    const dx = Math.abs(x - q);
    const dy = Math.abs(y - r);
    const ds = Math.abs(s + q + r);
    if (dx > dy && dx > ds) x = -y - s;
    else if (dy > ds) y = -x - s;
    return { x, y: y + Math.ceil(x / 2) };
}

export class CombatLayer implements WorldRenderLayer {
    public readonly id = "survivor-combat";
    private readonly root = new Group();
    private readonly player = new Group();
    private readonly playerBody = new Group();
    private readonly shield = new Group();
    private readonly pulse = new Group();
    private actors: ActorModels | undefined;
    private actorLoading: Promise<void> | undefined;
    private disposed = false;
    private readonly projectiles: InstancedMesh;
    private readonly experience: InstancedMesh;
    private readonly loot: readonly InstancedMesh[];
    private readonly chests: InstancedMesh;
    private readonly chestLids: InstancedMesh;
    private readonly chestLocks: InstancedMesh;
    private readonly geometries = [
        new SphereGeometry(0.09, 8, 6),
        new OctahedronGeometry(0.11, 0),
        new BoxGeometry(0.22, 0.22, 0.22),
        new RingGeometry(0.42, 0.49, 32),
        new CircleGeometry(0.34, 24),
        new BoxGeometry(0.65, 0.36, 0.46),
        new BoxGeometry(0.7, 0.13, 0.5),
        new BoxGeometry(0.09, 0.16, 0.045),
        new OctahedronGeometry(0.21, 0),
        new CylinderGeometry(0.09, 0.13, 0.32, 8)
    ] as const;
    private readonly projectileMaterial = new MeshBasicMaterial({ color: 0xffe79a });
    private readonly experienceMaterial = new MeshBasicMaterial({ color: 0x66f5ff });
    private readonly lootMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x17110a, roughness: 0.3, metalness: 0.55 });
    private readonly emberMaterial = new MeshBasicMaterial({ color: 0xffc35c });
    private readonly auraMaterial = new MeshBasicMaterial({ color: 0x70ecff, transparent: true, opacity: 0.48, side: DoubleSide, depthWrite: false });
    private readonly shadowMaterial = new MeshBasicMaterial({ color: 0x06090b, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false });
    private readonly dummy = new Object3D();
    private readonly color = new Color();
    private readonly viewCenter = new Vector2();
    private readonly heightCache = new Map<string, number>();
    private host: WorldRenderLayerHost | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        installActorFade(this.lootMaterial, this.viewCenter);
        installActorFade(this.emberMaterial, this.viewCenter);
        this.root.name = "survivor-combat";
        this.projectiles = this.instance(this.geometries[0], this.projectileMaterial, MAX_PROJECTILES);
        this.experience = this.instance(this.geometries[1], this.experienceMaterial, MAX_EXPERIENCE_ORBS);
        this.loot = [2, 8, 9].map(index => this.instance(this.geometries[index], this.lootMaterial, MAX_GROUND_EQUIPMENT));
        this.chests = this.instance(this.geometries[5], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLids = this.instance(this.geometries[6], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLocks = this.instance(this.geometries[7], this.emberMaterial, MAX_COMBAT_CHUNKS);
        for (const mesh of this.loot) { mesh.setColorAt(0, WHITE); mesh.count = 0; }
        this.chests.setColorAt(0, WHITE);
        this.chestLids.setColorAt(0, WHITE);
        this.projectiles.count = this.experience.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.buildPlayer();
        this.root.add(this.projectiles, this.experience, ...this.loot, this.chests, this.chestLids, this.chestLocks, this.player);
        resources.acquireRequired("combat-render-pool", {}, true, collectObject3DResourceAllocations([this.root]));
    }

    public async initialize(host: WorldRenderLayerHost): Promise<void> {
        if (!host.surface) throw new Error("Combat rendering requires a world surface");
        if (!this.actorLoading) {
            this.actorLoading = ActorModels.load(MAX_ENEMIES, this.viewCenter).then(actors => {
                if (this.disposed) { actors.dispose(); throw new Error("Combat layer disposed during actor loading"); }
                try {
                    this.resources.acquireRequired("combat-actor-models", {}, true,
                        collectObject3DResourceAllocations([actors.hero, ...actors.enemies.flat()]));
                } catch (error) { actors.dispose(); throw error; }
                this.actors = actors;
                this.playerBody.add(actors.hero);
                for (const pool of actors.enemies) this.root.add(...pool);
            }).catch(error => { this.actorLoading = undefined; throw error; });
        }
        await this.actorLoading;
        host.signal.throwIfAborted();
        this.host = host;
        this.root.scale.setScalar(host.tileSize);
        host.addObject(this.root);
    }

    public update(state: CombatRenderState, alpha: number, timestampMs: number): void {
        if (!this.host || !this.actors) return;
        const blend = Math.max(0, Math.min(1, alpha));
        const playerX = state.player.previousX + (state.player.x - state.player.previousX) * blend;
        const playerZ = state.player.previousZ + (state.player.z - state.player.previousZ) * blend;
        this.viewCenter.set(playerX, playerZ);
        this.player.position.set(playerX, this.height(playerX, playerZ), playerZ);
        this.playerBody.rotation.y = state.player.heading;
        this.actors.animateHero(state.player.animationTime / .8, Math.hypot(state.player.x - state.player.previousX, state.player.z - state.player.previousZ) > .0001);
        this.playerBody.rotation.z = state.player.gameOver ? -Math.PI / 2 : 0;
        this.playerBody.visible = !state.player.invulnerable || Math.floor(timestampMs / 70) % 2 === 0;
        this.shield.visible = state.player.shieldReady;
        this.pulse.visible = state.player.pulse > 0;
        this.pulse.scale.setScalar(1 + (1 - state.player.pulse) * 5.5);

        for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        for (let index = 0; index < state.enemies.count; index++) {
            const x = state.enemies.previousX[index] + (state.enemies.x[index] - state.enemies.previousX[index]) * blend;
            const z = state.enemies.previousZ[index] + (state.enemies.z[index] - state.enemies.previousZ[index]) * blend;
            // Render resident actors ahead of the active simulation ring, without a chunk-boundary pop.
            const homeX = state.enemies.homeX[index], homeZ = state.enemies.homeZ[index];
            const distance = Math.max(Math.hypot(x - playerX, z - playerZ) - state.enemies.radius[index] * 2,
                Math.hypot(homeX - playerX, homeZ - playerZ));
            if (actorVisibility(distance) === 0) continue;
            const dx = state.enemies.x[index] - state.enemies.previousX[index];
            const dz = state.enemies.z[index] - state.enemies.previousZ[index];
            const moving = Math.hypot(dx, dz) > .0001;
            const rotation = moving ? Math.atan2(dx, dz) : Math.atan2(playerX - x, playerZ - z);
            this.color.copy(WHITE);
            if (state.enemies.elite[index]) this.color.lerp(ELITE, .38);
            if (state.enemies.boss[index]) this.color.lerp(BOSS, .5);
            if (state.enemies.hitFlash[index] > 0) this.color.setRGB(2, 2, 2);
            for (const mesh of this.actors.enemies[state.enemies.kinds[index]]) {
                const instance = mesh.count++;
                this.setInstance(mesh, instance, x, this.height(x, z), z, state.enemies.radius[index] / .3, rotation);
                mesh.setColorAt(instance, this.color);
                mesh.geometry.getAttribute("actorHome").setXY(instance, homeX, homeZ);
                this.actors.animateEnemy(mesh, instance, state.player.animationTime / .8 + state.enemies.ids[index] * .37, moving);
            }
        }
        for (const pool of this.actors.enemies) for (const mesh of pool) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor!.needsUpdate = true;
            mesh.morphTexture!.needsUpdate = true;
            mesh.geometry.getAttribute("actorHome").needsUpdate = true;
        }

        this.projectiles.count = state.projectiles.count;
        for (let index = 0; index < state.projectiles.count; index += 1) {
            const x = state.projectiles.previousX[index] + (state.projectiles.x[index] - state.projectiles.previousX[index]) * blend;
            const z = state.projectiles.previousZ[index] + (state.projectiles.z[index] - state.projectiles.previousZ[index]) * blend;
            this.setInstance(this.projectiles, index, x, this.height(x, z) + 0.42, z, state.projectiles.critical[index] ? 1.65 : 1, 0);
        }
        this.projectiles.instanceMatrix.needsUpdate = true;

        this.experience.count = state.experience.count;
        for (let index = 0; index < state.experience.count; index += 1) {
            const x = state.experience.previousX[index] + (state.experience.x[index] - state.experience.previousX[index]) * blend;
            const z = state.experience.previousZ[index] + (state.experience.z[index] - state.experience.previousZ[index]) * blend;
            const bob = 0.18 + Math.sin(timestampMs * 0.004 + index * 0.71) * 0.055;
            const scale = Math.min(1.8, 0.85 + Math.log2(Math.max(1, state.experience.value[index])) * 0.1);
            this.setInstance(this.experience, index, x, this.height(x, z) + bob, z, scale, timestampMs * 0.002);
        }
        this.experience.instanceMatrix.needsUpdate = true;

        for (const mesh of this.loot) mesh.count = 0;
        for (let index = 0; index < state.loot.count; index++) {
            const x = state.loot.x[index], z = state.loot.z[index];
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const bob = .24 + Math.sin(timestampMs * .003 + state.loot.itemIds[index]) * .08;
            const mesh = this.loot[state.loot.kinds[index]], instance = mesh.count++;
            this.setInstance(mesh, instance, x, this.height(x, z) + bob, z, 1, timestampMs * .0015);
            mesh.setColorAt(instance, RARITY_COLORS[state.loot.rarities[index]]);
        }
        for (const mesh of this.loot) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor!.needsUpdate = true;
        }

        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        for (let index = 0; index < state.chests.count; index += 1) {
            const x = state.chests.x[index];
            const z = state.chests.z[index];
            if (Math.hypot(x - playerX, z - playerZ) > ACTOR_FADE_END + 1) continue;
            const instance = this.chests.count++;
            this.chestLids.count++;
            this.chestLocks.count++;
            const y = this.height(x, z);
            this.setInstance(this.chests, instance, x, y + 0.2, z, 1, 0);
            this.setInstance(this.chestLids, instance, x, y + 0.445, z, 1, 0);
            this.setInstance(this.chestLocks, instance, x, y + 0.34, z + 0.26, 1, 0);
            this.color.copy(CHEST_COLORS[state.chests.tiers[index]]);
            if (state.chests.tiers[index] === 4) this.color.setHSL((timestampMs * 0.00015 + index * 0.13) % 1, 0.85, 0.65);
            this.chests.setColorAt(instance, this.color);
            this.chestLids.setColorAt(instance, this.color);
        }
        for (const mesh of [this.chests, this.chestLids, this.chestLocks]) mesh.instanceMatrix.needsUpdate = true;
        this.chests.instanceColor!.needsUpdate = true;
        this.chestLids.instanceColor!.needsUpdate = true;
    }

    public reset(): void {
        this.projectiles.count = this.experience.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.heightCache.clear();
        if (this.actors) for (const pool of this.actors.enemies) for (const mesh of pool) mesh.count = 0;
        for (const mesh of this.loot) mesh.count = 0;
    }

    public mountChunk(): void {}
    public unmountChunk(): void {}
    public surfaceChanged(): void { this.heightCache.clear(); }

    public unloadWorld(host: WorldRenderLayerHost): void {
        host.removeObject(this.root);
        this.host = undefined;
        this.heightCache.clear();
    }

    public dispose(): void {
        this.disposed = true;
        this.host?.removeObject(this.root);
        this.host = undefined;
        this.actors?.dispose();
        for (const mesh of [this.projectiles, this.experience, ...this.loot, this.chests, this.chestLids, this.chestLocks]) mesh.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of [
            this.projectileMaterial,
            this.experienceMaterial,
            this.lootMaterial,
            this.emberMaterial,
            this.auraMaterial,
            this.shadowMaterial
        ]) material.dispose();
        this.resources.dispose();
    }

    private instance(geometry: ConstructorParameters<typeof InstancedMesh>[0], material: ConstructorParameters<typeof InstancedMesh>[1], count: number): InstancedMesh {
        const mesh = new InstancedMesh(geometry, material, count);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        return mesh;
    }

    private buildPlayer(): void {
        const aura = new Mesh(this.geometries[3], this.auraMaterial);
        aura.position.y = 0.035;
        aura.rotation.x = -Math.PI / 2;
        const pulse = new Mesh(this.geometries[3], this.auraMaterial);
        pulse.position.y = 0.06;
        pulse.rotation.x = -Math.PI / 2;
        this.shield.add(aura);
        this.pulse.add(pulse);
        const shadow = new Mesh(this.geometries[4], this.shadowMaterial);
        shadow.position.y = 0.02;
        shadow.rotation.x = -Math.PI / 2;
        this.player.add(shadow, this.shield, this.pulse, this.playerBody);
    }

    private setInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number, rotation: number): void {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(0, rotation, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }

    private height(x: number, z: number): number {
        const host = this.host!;
        const tile = groundTile({ x, z });
        const key = `${tile.x},${tile.y}`;
        const cached = this.heightCache.get(key);
        if (cached !== undefined) return cached;
        if (this.heightCache.size >= 4096) this.heightCache.clear();
        const height = host.surface!.getTileCenterHeight(tile.x, tile.y) / host.tileSize + 0.025;
        this.heightCache.set(key, height);
        return height;
    }
}

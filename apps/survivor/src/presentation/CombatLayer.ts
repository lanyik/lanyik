import {
    BoxGeometry,
    CircleGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    DynamicDrawUsage,
    Group,
    IcosahedronGeometry,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    OctahedronGeometry,
    RingGeometry,
    SphereGeometry
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

const ENEMY_COLORS = [new Color(0xc84b58), new Color(0xaa68f0), new Color(0xd17a37), new Color(0x4aaccb)] as const;
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
    private readonly enemies: InstancedMesh;
    private readonly projectiles: InstancedMesh;
    private readonly experience: InstancedMesh;
    private readonly loot: InstancedMesh;
    private readonly chests: InstancedMesh;
    private readonly chestLids: InstancedMesh;
    private readonly chestLocks: InstancedMesh;
    private readonly geometries = [
        new IcosahedronGeometry(0.36, 1),
        new SphereGeometry(0.09, 8, 6),
        new OctahedronGeometry(0.11, 0),
        new BoxGeometry(0.22, 0.22, 0.22),
        new CylinderGeometry(0.18, 0.24, 0.52, 10),
        new SphereGeometry(0.17, 12, 8),
        new ConeGeometry(0.35, 0.68, 8, 1, true),
        new BoxGeometry(0.06, 0.08, 0.48),
        new RingGeometry(0.42, 0.49, 32),
        new CircleGeometry(0.34, 24),
        new BoxGeometry(0.65, 0.36, 0.46),
        new BoxGeometry(0.7, 0.13, 0.5),
        new BoxGeometry(0.09, 0.16, 0.045)
    ] as const;
    private readonly enemyMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.05 });
    private readonly projectileMaterial = new MeshBasicMaterial({ color: 0xffe79a });
    private readonly experienceMaterial = new MeshBasicMaterial({ color: 0x66f5ff });
    private readonly lootMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x17110a, roughness: 0.3, metalness: 0.55 });
    private readonly coatMaterial = new MeshStandardMaterial({ color: 0x381f37, roughness: 0.8 });
    private readonly armorMaterial = new MeshStandardMaterial({ color: 0xb8c4ca, roughness: 0.34, metalness: 0.62 });
    private readonly skinMaterial = new MeshStandardMaterial({ color: 0xd6b79d, roughness: 0.82 });
    private readonly emberMaterial = new MeshBasicMaterial({ color: 0xffc35c });
    private readonly auraMaterial = new MeshBasicMaterial({ color: 0x70ecff, transparent: true, opacity: 0.48, side: DoubleSide, depthWrite: false });
    private readonly shadowMaterial = new MeshBasicMaterial({ color: 0x06090b, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false });
    private readonly dummy = new Object3D();
    private readonly color = new Color();
    private readonly heightCache = new Map<string, number>();
    private readonly enemyColorState = new Uint16Array(MAX_ENEMIES).fill(0xffff);
    private readonly lootColorState = new Uint8Array(MAX_GROUND_EQUIPMENT).fill(0xff);
    private host: WorldRenderLayerHost | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        this.root.name = "survivor-combat";
        this.enemies = this.instance(this.geometries[0], this.enemyMaterial, MAX_ENEMIES);
        this.projectiles = this.instance(this.geometries[1], this.projectileMaterial, MAX_PROJECTILES);
        this.experience = this.instance(this.geometries[2], this.experienceMaterial, MAX_EXPERIENCE_ORBS);
        this.loot = this.instance(this.geometries[3], this.lootMaterial, MAX_GROUND_EQUIPMENT);
        this.chests = this.instance(this.geometries[10], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLids = this.instance(this.geometries[11], this.lootMaterial, MAX_COMBAT_CHUNKS);
        this.chestLocks = this.instance(this.geometries[12], this.emberMaterial, MAX_COMBAT_CHUNKS);
        this.enemies.setColorAt(0, WHITE);
        this.loot.setColorAt(0, WHITE);
        this.chests.setColorAt(0, WHITE);
        this.chestLids.setColorAt(0, WHITE);
        this.enemies.count = this.projectiles.count = this.experience.count = this.loot.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.buildPlayer();
        this.root.add(this.enemies, this.projectiles, this.experience, this.loot, this.chests, this.chestLids, this.chestLocks, this.player);
        resources.acquireRequired("combat-render-pool", {}, true, collectObject3DResourceAllocations([this.root]));
    }

    public initialize(host: WorldRenderLayerHost): void {
        if (!host.surface) throw new Error("Combat rendering requires a world surface");
        this.host = host;
        this.root.scale.setScalar(host.tileSize);
        host.addObject(this.root);
    }

    public update(state: CombatRenderState, alpha: number, timestampMs: number): void {
        if (!this.host) return;
        const blend = Math.max(0, Math.min(1, alpha));
        const playerX = state.player.previousX + (state.player.x - state.player.previousX) * blend;
        const playerZ = state.player.previousZ + (state.player.z - state.player.previousZ) * blend;
        this.player.position.set(playerX, this.height(playerX, playerZ), playerZ);
        this.playerBody.rotation.y = state.player.heading;
        this.playerBody.rotation.z = state.player.gameOver ? -Math.PI / 2 : 0;
        this.playerBody.visible = !state.player.invulnerable || Math.floor(timestampMs / 70) % 2 === 0;
        this.shield.visible = state.player.shieldReady;
        this.pulse.visible = state.player.pulse > 0;
        this.pulse.scale.setScalar(1 + (1 - state.player.pulse) * 5.5);

        this.enemies.count = 0;
        let enemyColorsChanged = false;
        for (let index = 0; index < state.enemies.count; index += 1) {
            if (!state.enemies.active[index]) continue;
            const instance = this.enemies.count++;
            const x = state.enemies.previousX[index] + (state.enemies.x[index] - state.enemies.previousX[index]) * blend;
            const z = state.enemies.previousZ[index] + (state.enemies.z[index] - state.enemies.previousZ[index]) * blend;
            const scale = state.enemies.radius[index] / 0.3;
            this.setInstance(this.enemies, instance, x, this.height(x, z) + state.enemies.radius[index], z, scale, timestampMs * 0.001 + state.enemies.ids[index]);
            const colorState = state.enemies.kinds[index]
                | state.enemies.elite[index] << 8
                | Number(state.enemies.hitFlash[index] > 0) << 9
                | state.enemies.boss[index] << 10;
            if (this.enemyColorState[instance] !== colorState) {
                this.enemyColorState[instance] = colorState;
                const base = ENEMY_COLORS[state.enemies.kinds[index]];
                this.color.copy(base);
                if (state.enemies.elite[index]) this.color.lerp(ELITE, 0.62);
                if (state.enemies.boss[index]) this.color.copy(BOSS);
                if (state.enemies.hitFlash[index] > 0) this.color.lerp(WHITE, 0.82);
                this.enemies.setColorAt(instance, this.color);
                enemyColorsChanged = true;
            }
        }
        this.enemies.instanceMatrix.needsUpdate = true;
        if (enemyColorsChanged && this.enemies.instanceColor) this.enemies.instanceColor.needsUpdate = true;

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

        this.loot.count = state.loot.count;
        let lootColorsChanged = false;
        for (let index = 0; index < state.loot.count; index += 1) {
            const x = state.loot.x[index];
            const z = state.loot.z[index];
            const bob = 0.24 + Math.sin(timestampMs * 0.003 + state.loot.itemIds[index]) * 0.08;
            this.setInstance(this.loot, index, x, this.height(x, z) + bob, z, 1, timestampMs * 0.0015);
            const rarity = state.loot.rarities[index];
            if (this.lootColorState[index] !== rarity) {
                this.lootColorState[index] = rarity;
                this.loot.setColorAt(index, RARITY_COLORS[rarity]);
                lootColorsChanged = true;
            }
        }
        this.loot.instanceMatrix.needsUpdate = true;
        if (lootColorsChanged && this.loot.instanceColor) this.loot.instanceColor.needsUpdate = true;

        this.chests.count = this.chestLids.count = this.chestLocks.count = state.chests.count;
        for (let index = 0; index < state.chests.count; index += 1) {
            const x = state.chests.x[index];
            const z = state.chests.z[index];
            const y = this.height(x, z);
            this.setInstance(this.chests, index, x, y + 0.2, z, 1, 0);
            this.setInstance(this.chestLids, index, x, y + 0.445, z, 1, 0);
            this.setInstance(this.chestLocks, index, x, y + 0.34, z + 0.26, 1, 0);
            this.color.copy(CHEST_COLORS[state.chests.tiers[index]]);
            if (state.chests.tiers[index] === 4) this.color.setHSL((timestampMs * 0.00015 + index * 0.13) % 1, 0.85, 0.65);
            this.chests.setColorAt(index, this.color);
            this.chestLids.setColorAt(index, this.color);
        }
        for (const mesh of [this.chests, this.chestLids, this.chestLocks]) mesh.instanceMatrix.needsUpdate = true;
        this.chests.instanceColor!.needsUpdate = true;
        this.chestLids.instanceColor!.needsUpdate = true;
    }

    public reset(): void {
        this.enemies.count = this.projectiles.count = this.experience.count = this.loot.count = 0;
        this.chests.count = this.chestLids.count = this.chestLocks.count = 0;
        this.heightCache.clear();
        this.enemyColorState.fill(0xffff);
        this.lootColorState.fill(0xff);
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
        this.host?.removeObject(this.root);
        this.host = undefined;
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of [
            this.enemyMaterial,
            this.projectileMaterial,
            this.experienceMaterial,
            this.lootMaterial,
            this.coatMaterial,
            this.armorMaterial,
            this.skinMaterial,
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
        const body = new Mesh(this.geometries[4], this.armorMaterial);
        body.position.y = 0.48;
        const head = new Mesh(this.geometries[5], this.skinMaterial);
        head.position.y = 0.85;
        const cloak = new Mesh(this.geometries[6], this.coatMaterial);
        cloak.position.set(0, 0.42, -0.12);
        cloak.rotation.x = Math.PI;
        const weapon = new Mesh(this.geometries[7], this.emberMaterial);
        weapon.position.set(0.28, 0.55, 0.14);
        weapon.rotation.x = -0.3;
        const aura = new Mesh(this.geometries[8], this.auraMaterial);
        aura.position.y = 0.035;
        aura.rotation.x = -Math.PI / 2;
        const pulse = new Mesh(this.geometries[8], this.auraMaterial);
        pulse.position.y = 0.06;
        pulse.rotation.x = -Math.PI / 2;
        this.shield.add(aura);
        this.pulse.add(pulse);
        const shadow = new Mesh(this.geometries[9], this.shadowMaterial);
        shadow.position.y = 0.02;
        shadow.rotation.x = -Math.PI / 2;
        this.playerBody.add(body, head, cloak, weapon);
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

import { BufferGeometryLoader, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, MeshDepthMaterial, MeshStandardMaterial, Object3D, Sphere, SRGBColorSpace, Vector3, Vector4,
    type BufferGeometry, type Texture } from "three";
import { installForestOcclusion, installForestWind, type GroundProjection } from "three-hex-map";
import { CHALLENGE_SCENERY } from "../core/ChallengeLayout";
import { AssetLoader } from "./AssetLoader";
import { ChallengeSurface } from "./ChallengeSurface";
import { Campfire } from "./Campfire";

/** Finite instance pools; wind deforms vertices without changing authoritative transforms. */
export class ChallengeScenery {
    public readonly root = new Group();
    private readonly meshes: InstancedMesh[] = [];
    private readonly depths: MeshDepthMaterial[] = [];
    private readonly windTime = { value: 0 };
    private readonly surface: ChallengeSurface;
    private readonly fire = new Campfire();
    private constructor(private readonly geometries: Record<string, BufferGeometry>, private readonly textures: Record<string, Texture>,
        private readonly materials: MeshStandardMaterial[], player: Object3D, projection: GroundProjection) {
        this.root.name = "challenge-scenery";
        this.surface = new ChallengeSurface(textures, projection); this.root.add(this.surface.root, this.fire.root);
        const focus = { value: new Vector4() };
        for (const material of materials.slice(2, 4)) installForestOcclusion(material, focus);
        let treeHeight = 0;
        for (const name of ["oak-branches", "oak-leaves"]) {
            geometries[name].computeBoundingBox(); treeHeight = Math.max(treeHeight, geometries[name].boundingBox!.max.y);
        }
        const transform = new Object3D();
        for (const [name, geometry] of Object.entries(geometries)) {
            const tree = name.startsWith("oak-"), props = CHALLENGE_SCENERY.props.filter(prop => prop.model === name);
            const material = materials[name === "firepit" ? 1 : name === "oak-branches" ? 2 : name === "oak-leaves" ? 3 : name === "timber" ? 4 : 0];
            const mesh = new InstancedMesh(geometry, material, tree ? CHALLENGE_SCENERY.trees.length : props.length);
            mesh.name = `challenge-${name}`; mesh.castShadow = mesh.receiveShadow = true;
            if (tree) {
                const padding = installForestWind(material, this.windTime, treeHeight);
                const depth = new MeshDepthMaterial(); installForestWind(depth, this.windTime, treeHeight);
                this.depths.push(depth); mesh.customDepthMaterial = depth;
                geometry.boundingBox!.expandByVector(new Vector3(padding, 0, padding));
                geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere = new Sphere());
            }
            if (tree) mesh.onBeforeRender = (_renderer, _scene, camera) => {
                // Player-local focus follows the current camera and render origin; shadows retain full coverage.
                focus.value.set(0, .9, 0, 1).applyMatrix4(player.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
                const world = player.matrixWorld.elements;
                focus.value.w = 2 * Math.hypot(world[0], world[1], world[2]);
            };
            if (tree) CHALLENGE_SCENERY.trees.forEach((entry, index) => {
                transform.position.set(entry.x, 0, entry.z); transform.rotation.set(0, entry.rotation, 0); transform.scale.setScalar(entry.scale);
                transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
            });
            else props.forEach((entry, index) => {
                transform.position.set(entry.x, entry.solid ? 0 : -.01, entry.z); transform.rotation.set(0, entry.rotation, 0);
                transform.scale.set(entry.radius, entry.height, entry.radius); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
            });
            mesh.computeBoundingSphere(); this.meshes.push(mesh); this.root.add(mesh);
        }
    }
    public static async load(signal: AbortSignal, player: Object3D, projection: GroundProjection): Promise<ChallengeScenery> {
        const loader = new AssetLoader(signal), base = `${import.meta.env.BASE_URL}environment/`, geometries: Record<string, BufferGeometry> = {};
        const textures: Record<string, Texture> = {}, materials: MeshStandardMaterial[] = [];
        try {
            for (const [file, prefix] of [["models", ""], ["oak", "oak-"]]) {
                const json = JSON.parse(new TextDecoder().decode(await loader.bytes(`${base}scenery/${file}.json`)));
                for (const [name, data] of Object.entries(json)) geometries[prefix + name] = new BufferGeometryLoader().parse(data as Parameters<BufferGeometryLoader["parse"]>[0]);
            }
            const timber = new CylinderGeometry(.13, .16, 1.96, 9, 3).rotateX(Math.PI / 2).translate(0, .16, 0).scale(1, 1 / .32, 1);
            const vertices = timber.getAttribute("position");
            for (let vertex = 0; vertex < vertices.count; vertex++) {
                const z = vertices.getZ(vertex);
                if (Math.abs(z) > .95) vertices.setZ(vertex, z * (.9 + .09 * Math.sin(vertices.getX(vertex) * 83 + vertices.getY(vertex) * 17) ** 2));
            }
            timber.computeVertexNormals();
            geometries.timber = timber;
            const files = ["scenery/rock-color.png", "scenery/rock-normal.png", "scenery/rock-orm.png",
                "scenery/firepit-color.png", "scenery/firepit-normal.png", "scenery/firepit-orm.png",
                "bark001-Color.jpg", "bark001-NormalGL.jpg", "bark001-orm.png", "oak-leaves.png",
                ...["soil", "grass"].flatMap(name => ["color", "normal", "orm"].map(channel => `scenery/${name}-${channel}.png`))];
            await loader.parallel(files, 3, async file => {
                const texture = await loader.texture(base + file); textures[file] = texture; texture.anisotropy = 4;
                if (/color|Color|leaves/.test(file)) texture.colorSpace = SRGBColorSpace;
            });
            for (const prefix of ["rock", "firepit"]) materials.push(new MeshStandardMaterial({
                map: textures[`scenery/${prefix}-color.png`], normalMap: textures[`scenery/${prefix}-normal.png`],
                roughnessMap: textures[`scenery/${prefix}-orm.png`], aoMap: textures[`scenery/${prefix}-orm.png`], roughness: 1, metalness: 0
            }));
            materials.push(new MeshStandardMaterial({ map: textures["bark001-Color.jpg"], normalMap: textures["bark001-NormalGL.jpg"],
                roughnessMap: textures["bark001-orm.png"], color: new Color(0xb4aca0), roughness: 1 }));
            materials.push(new MeshStandardMaterial({ map: textures["oak-leaves.png"], color: new Color(0xdee4c3),
                alphaTest: .42, side: DoubleSide, roughness: .9 }));
            materials.push(new MeshStandardMaterial({ map: textures["bark001-Color.jpg"], normalMap: textures["bark001-NormalGL.jpg"],
                roughnessMap: textures["bark001-orm.png"], color: 0x534c43, roughness: 1 }));
            return new ChallengeScenery(geometries, textures, materials, player, projection);
        } catch (error) {
            Object.values(geometries).forEach(geometry => geometry.dispose());
            Object.values(textures).forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); throw error;
        } finally { loader.dispose(); }
    }
    public update(timestampMs: number): void {
        this.windTime.value = (timestampMs / 1000) % (20 * Math.PI); this.surface.update(timestampMs); this.fire.update(timestampMs);
    }
    public dispose(): void {
        this.root.removeFromParent(); this.meshes.forEach(mesh => mesh.dispose());
        this.surface.dispose(); this.fire.dispose();
        Object.values(this.geometries).forEach(geometry => geometry.dispose());
        this.materials.forEach(material => material.dispose()); Object.values(this.textures).forEach(texture => texture.dispose());
        this.depths.forEach(material => material.dispose());
    }
}

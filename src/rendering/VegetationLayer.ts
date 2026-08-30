import {
    BufferAttribute,
    BufferGeometry,
    ConeGeometry,
    DoubleSide,
    DynamicDrawUsage,
    GLSL3,
    Group,
    InstancedMesh,
    Matrix4,
    Quaternion,
    ShaderMaterial,
    Uniform,
    Vector3
} from "three";

import type { WorldChunkLod } from "./WorldChunkLod";
import {
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_VEGETATION_COORDINATE_SCALE
} from "../world/semantic/SurfaceCompileProfile";
import {
    assertCompiledSurfaceChunk,
    type CompiledSurfaceChunk
} from "../world/semantic/SurfaceCompiler";
import {
    CompiledVegetationSpecies,
    type CompiledVegetationSeeds
} from "../world/semantic/SurfacePresentationCompiler";
import { surfaceToWorld } from "../world/semantic/SurfaceLattice";
import type { RenderChunkKey } from "../world/semantic/SurfaceDependency";
import type { GroundChunkMount } from "./GroundLayer";
import {
    LightingStateController,
    type LightingUniformBinding
} from "./LightingState";
import { SurfaceTexturePool } from "./SurfaceTexturePool";

export interface VegetationLayerOptions {
    readonly surfaceTexturePool: SurfaceTexturePool;
    readonly lighting: LightingStateController;
    readonly hexSize?: number;
    readonly heightScale?: number;
}

export interface VegetationChunkMount {
    readonly key: RenderChunkKey;
    readonly group: Group;
    readonly lod: WorldChunkLod;
    readonly candidateCount: number;
    readonly visibleInstanceCount: number;
}

export interface VegetationLayerStats {
    readonly state: "ready" | "lost" | "disposed";
    readonly mountedChunks: number;
    readonly instancedMeshes: number;
    readonly candidateCount: number;
    readonly visibleInstanceCount: number;
    readonly grassInstances: number;
    readonly treeInstances: number;
    readonly geometryBytes: number;
}

interface SpeciesInstances {
    readonly species: CompiledVegetationSpecies;
    readonly mesh: InstancedMesh;
    readonly seedIndices: readonly number[];
}

interface MutableVegetationChunk {
    readonly key: Readonly<RenderChunkKey>;
    readonly keyString: string;
    readonly group: Group;
    readonly seeds: CompiledVegetationSeeds;
    readonly species: readonly SpeciesInstances[];
    lod: WorldChunkLod;
}

interface VegetationMaterial {
    readonly material: ShaderMaterial;
    readonly lighting: LightingUniformBinding;
}

const VEGETATION_COLORS = Object.freeze({
    [CompiledVegetationSpecies.Grass]: Object.freeze([0.18, 0.42, 0.13] as const),
    [CompiledVegetationSpecies.Palm]: Object.freeze([0.24, 0.48, 0.16] as const),
    [CompiledVegetationSpecies.Pinia]: Object.freeze([0.11, 0.31, 0.16] as const),
    [CompiledVegetationSpecies.Oak]: Object.freeze([0.18, 0.38, 0.12] as const)
});

const VEGETATION_VERTEX_SHADER = /* glsl */`
uniform float uTime;
uniform bool uGrass;

out vec3 vWorldNormal;
out float vHeight;

void main() {
    vec3 localPosition = position;
    if (uGrass) {
        localPosition.x += sin(uTime * 1.7 + position.y * 4.0) * position.y * 0.035;
    }
    vec4 instancePosition = instanceMatrix * vec4(localPosition, 1.0);
    vec4 worldPosition = modelMatrix * instancePosition;
    vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vHeight = clamp(position.y, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const VEGETATION_FRAGMENT_SHADER = /* glsl */`
uniform vec3 uAlbedo;
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;

in vec3 vWorldNormal;
in float vHeight;
out vec4 vegetationOutputColor;
#define gl_FragColor vegetationOutputColor

void main() {
    vec3 normal = normalize(vWorldNormal);
    float sunAmount = max(dot(normal, normalize(uSunDirection)), 0.0);
    float skyAmount = normal.y * 0.5 + 0.5;
    vec3 irradiance = uSunRadiance * sunAmount
        + uSkyDiffuseIrradiance * skyAmount
        + uGroundDiffuseIrradiance * (1.0 - skyAmount);
    vec3 albedo = uAlbedo * mix(0.82, 1.08, vHeight);
    gl_FragColor = vec4(albedo * irradiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function keyString(key: RenderChunkKey): string {
    if (!key || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("VegetationLayer render chunk key is invalid");
    }
    return `${key.chunkX},${key.chunkY}`;
}

function assertLod(lod: WorldChunkLod): void {
    if (lod !== 0 && lod !== 1 && lod !== 2) {
        throw new RangeError("vegetation chunk LOD must be 0, 1 or 2");
    }
}

function createGrassGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.name = "surface-vegetation-grass";
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([
        -0.5, 0, 0, 0.5, 0, 0, 0.34, 1, 0, -0.34, 1, 0
    ]), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1
    ]), 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function createSpeciesGeometry(species: CompiledVegetationSpecies): BufferGeometry {
    if (species === CompiledVegetationSpecies.Grass) return createGrassGeometry();
    const geometry = species === CompiledVegetationSpecies.Palm
        ? new ConeGeometry(0.48, 1.8, 7, 1)
        : species === CompiledVegetationSpecies.Pinia
            ? new ConeGeometry(0.58, 1.55, 7, 2)
            : new ConeGeometry(0.68, 1.35, 8, 2);
    geometry.translate(0, species === CompiledVegetationSpecies.Palm ? 0.9
        : species === CompiledVegetationSpecies.Pinia ? 0.775 : 0.675, 0);
    geometry.name = `surface-vegetation-species-${species}`;
    return geometry;
}

function geometryByteLength(geometry: BufferGeometry): number {
    let total = geometry.getIndex()?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) total += attribute.array.byteLength;
    return total;
}

function retainedAtLod(
    species: CompiledVegetationSpecies,
    randomKey: number,
    lod: WorldChunkLod
): boolean {
    if (lod === 0) return true;
    if (species === CompiledVegetationSpecies.Grass) return lod === 1 && (randomKey & 1) === 0;
    return lod === 1 || (randomKey & 1) === 0;
}

function visibleInstanceCount(chunk: MutableVegetationChunk): number {
    return chunk.species.reduce((sum, value) => sum + value.mesh.count, 0);
}

function freezeMount(chunk: MutableVegetationChunk): VegetationChunkMount {
    return Object.freeze({
        key: chunk.key,
        group: chunk.group,
        lod: chunk.lod,
        candidateCount: chunk.seeds.tileIndex.length,
        visibleInstanceCount: visibleInstanceCount(chunk)
    });
}

export class VegetationLayer {
    public readonly root = new Group();
    private readonly surfaceTexturePool: SurfaceTexturePool;
    private readonly lighting: LightingStateController;
    private readonly hexSize: number;
    private readonly heightScale: number;
    private readonly chunks = new Map<string, MutableVegetationChunk>();
    private readonly geometries = new Map<CompiledVegetationSpecies, BufferGeometry>();
    private readonly materials = new Map<CompiledVegetationSpecies, VegetationMaterial>();
    private readonly position = new Vector3();
    private readonly rotation = new Quaternion();
    private readonly scale = new Vector3();
    private readonly matrix = new Matrix4();
    private readonly up = new Vector3(0, 1, 0);
    private floatingOriginX = 0;
    private floatingOriginZ = 0;
    private time = 0;
    private stateValue: "ready" | "lost" | "disposed" = "ready";

    constructor(options: VegetationLayerOptions) {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "surfaceTexturePool", "lighting", "hexSize", "heightScale"
            ].includes(name))
            || !(options.surfaceTexturePool instanceof SurfaceTexturePool)
            || !(options.lighting instanceof LightingStateController)
            || options.surfaceTexturePool.state !== "ready"
            || options.lighting.stats.state !== "ready") {
            throw new TypeError("VegetationLayer options are invalid or not ready");
        }
        this.hexSize = options.hexSize ?? 1;
        this.heightScale = options.heightScale ?? 1;
        if (!Number.isFinite(this.hexSize) || this.hexSize <= 0
            || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
            throw new RangeError("VegetationLayer scales must be finite and positive");
        }
        this.surfaceTexturePool = options.surfaceTexturePool;
        this.lighting = options.lighting;
        this.root.name = "surface-vegetation-layer-v2";
    }

    public mount(chunk: CompiledSurfaceChunk, ground: GroundChunkMount): VegetationChunkMount {
        this.assertReady();
        assertCompiledSurfaceChunk(chunk);
        assertLod(ground.lod);
        if (chunk.key.chunkX !== ground.key.chunkX || chunk.key.chunkY !== ground.key.chunkY
            || !this.surfaceTexturePool.isCurrent(ground.slot)) {
            throw new TypeError("VegetationLayer requires the current matching ground mount");
        }
        const serialized = keyString(chunk.key);
        const group = new Group();
        group.name = `surface-vegetation-${serialized}`;
        const bySpecies = new Map<CompiledVegetationSpecies, number[]>();
        for (let index = 0; index < chunk.vegetationSeeds.species.length; index += 1) {
            const species = chunk.vegetationSeeds.species[index] as CompiledVegetationSpecies;
            const indices = bySpecies.get(species) ?? [];
            indices.push(index);
            bySpecies.set(species, indices);
        }
        const speciesInstances: SpeciesInstances[] = [];
        for (const species of [
            CompiledVegetationSpecies.Grass,
            CompiledVegetationSpecies.Palm,
            CompiledVegetationSpecies.Pinia,
            CompiledVegetationSpecies.Oak
        ]) {
            const indices = bySpecies.get(species);
            if (!indices?.length) continue;
            const mesh = new InstancedMesh(
                this.geometryForSpecies(species),
                this.materialForSpecies(species).material,
                indices.length
            );
            mesh.name = `surface-vegetation-species-${species}-${serialized}`;
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.renderOrder = 2;
            group.add(mesh);
            speciesInstances.push(Object.freeze({
                species,
                mesh,
                seedIndices: Object.freeze(indices)
            }));
        }
        const mounted: MutableVegetationChunk = {
            key: Object.freeze({ ...chunk.key }),
            keyString: serialized,
            group,
            seeds: chunk.vegetationSeeds,
            species: Object.freeze(speciesInstances),
            lod: ground.lod
        };
        this.updateInstances(mounted);
        this.positionChunk(mounted);
        const previous = this.chunks.get(serialized);
        if (previous) this.removeChunk(previous);
        this.chunks.set(serialized, mounted);
        this.root.add(group);
        return freezeMount(mounted);
    }

    public setLod(key: RenderChunkKey, lod: WorldChunkLod): boolean {
        this.assertReady();
        assertLod(lod);
        const chunk = this.chunks.get(keyString(key));
        if (!chunk || chunk.lod === lod) return false;
        chunk.lod = lod;
        this.updateInstances(chunk);
        return true;
    }

    public setTime(seconds: number): void {
        this.assertReady();
        if (!Number.isFinite(seconds) || seconds < 0) {
            throw new RangeError("vegetation time must be finite and non-negative");
        }
        this.time = seconds;
        for (const value of this.materials.values()) value.material.uniforms.uTime.value = seconds;
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        this.assertNotDisposed();
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError("VegetationLayer floating origin must be finite");
        }
        this.floatingOriginX = worldX;
        this.floatingOriginZ = worldZ;
        for (const chunk of this.chunks.values()) this.positionChunk(chunk);
    }

    public unmount(key: RenderChunkKey): boolean {
        this.assertNotDisposed();
        const serialized = keyString(key);
        const chunk = this.chunks.get(serialized);
        if (!chunk) return false;
        this.chunks.delete(serialized);
        this.removeChunk(chunk);
        return true;
    }

    public handleContextLost(): void {
        this.assertNotDisposed();
        this.stateValue = "lost";
    }

    public handleContextRestored(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "lost") {
            throw new TypeError("VegetationLayer context can only restore from lost");
        }
        for (const material of this.materials.values()) material.material.needsUpdate = true;
        for (const chunk of this.chunks.values()) {
            for (const species of chunk.species) species.mesh.instanceMatrix.needsUpdate = true;
        }
        this.stateValue = "ready";
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        for (const chunk of this.chunks.values()) this.removeChunk(chunk);
        this.chunks.clear();
        for (const value of this.materials.values()) {
            value.lighting.release();
            value.material.dispose();
        }
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.materials.clear();
        this.geometries.clear();
        this.root.removeFromParent();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<VegetationLayerStats> {
        let candidateCount = 0;
        let visible = 0;
        let grass = 0;
        let trees = 0;
        let meshes = 0;
        for (const chunk of this.chunks.values()) {
            candidateCount += chunk.seeds.tileIndex.length;
            for (const species of chunk.species) {
                meshes += 1;
                visible += species.mesh.count;
                if (species.species === CompiledVegetationSpecies.Grass) grass += species.mesh.count;
                else trees += species.mesh.count;
            }
        }
        let bytes = 0;
        for (const geometry of this.geometries.values()) bytes += geometryByteLength(geometry);
        return Object.freeze({
            state: this.stateValue,
            mountedChunks: this.chunks.size,
            instancedMeshes: meshes,
            candidateCount,
            visibleInstanceCount: visible,
            grassInstances: grass,
            treeInstances: trees,
            geometryBytes: bytes
        });
    }

    private geometryForSpecies(species: CompiledVegetationSpecies): BufferGeometry {
        let geometry = this.geometries.get(species);
        if (!geometry) {
            geometry = createSpeciesGeometry(species);
            this.geometries.set(species, geometry);
        }
        return geometry;
    }

    private materialForSpecies(species: CompiledVegetationSpecies): VegetationMaterial {
        let value = this.materials.get(species);
        if (value) return value;
        const lighting = this.lighting.bindUniforms();
        const material = new ShaderMaterial({
            name: `surface-vegetation-material-${species}`,
            glslVersion: GLSL3,
            vertexShader: VEGETATION_VERTEX_SHADER,
            fragmentShader: VEGETATION_FRAGMENT_SHADER,
            uniforms: {
                uTime: new Uniform(this.time),
                uGrass: new Uniform(species === CompiledVegetationSpecies.Grass),
                uAlbedo: new Uniform(new Vector3(...VEGETATION_COLORS[species])),
                uSunDirection: lighting.sunDirection,
                uSunRadiance: lighting.sunRadiance,
                uSkyDiffuseIrradiance: lighting.skyDiffuseIrradiance,
                uGroundDiffuseIrradiance: lighting.groundDiffuseIrradiance
            },
            side: DoubleSide,
            depthWrite: true,
            depthTest: true,
            transparent: false,
            toneMapped: true
        });
        value = Object.freeze({ material, lighting });
        this.materials.set(species, value);
        return value;
    }

    private updateInstances(chunk: MutableVegetationChunk): void {
        for (const value of chunk.species) {
            let outputIndex = 0;
            for (const seedIndex of value.seedIndices) {
                if (!retainedAtLod(value.species, chunk.seeds.randomKey[seedIndex], chunk.lod)) continue;
                const localU = chunk.seeds.surfaceCoordinates[seedIndex * 2]
                    / SURFACE_VEGETATION_COORDINATE_SCALE;
                const localV = chunk.seeds.surfaceCoordinates[seedIndex * 2 + 1]
                    / SURFACE_VEGETATION_COORDINATE_SCALE;
                const world = surfaceToWorld(localU, localV, this.hexSize);
                this.position.set(
                    world.x,
                    chunk.seeds.groundHeight[seedIndex] / 65_535 * this.heightScale,
                    world.z
                );
                this.rotation.setFromAxisAngle(
                    this.up,
                    chunk.seeds.rotation[seedIndex] / 65_535 * Math.PI * 2
                );
                const randomScale = chunk.seeds.scale[seedIndex] / 255;
                const baseScale = value.species === CompiledVegetationSpecies.Grass
                    ? this.hexSize * 0.34 : this.hexSize * 0.62;
                this.scale.setScalar(baseScale * randomScale);
                this.matrix.compose(this.position, this.rotation, this.scale);
                value.mesh.setMatrixAt(outputIndex, this.matrix);
                outputIndex += 1;
            }
            value.mesh.count = outputIndex;
            value.mesh.instanceMatrix.needsUpdate = true;
            value.mesh.computeBoundingBox();
            value.mesh.computeBoundingSphere();
        }
    }

    private positionChunk(chunk: MutableVegetationChunk): void {
        const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
            throw new RangeError("VegetationLayer render origin exceeds the safe integer domain");
        }
        chunk.group.position.set(
            1.5 * this.hexSize * surfaceX - this.floatingOriginX,
            0,
            Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
        );
        chunk.group.updateMatrix();
        chunk.group.updateMatrixWorld();
    }

    private removeChunk(chunk: MutableVegetationChunk): void {
        this.root.remove(chunk.group);
        for (const species of chunk.species) species.mesh.dispose();
        chunk.group.clear();
    }

    private assertReady(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") {
            throw new TypeError("VegetationLayer cannot mutate while context is lost");
        }
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") throw new TypeError("VegetationLayer is disposed");
    }
}

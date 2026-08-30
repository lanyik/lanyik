import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    GLSL3,
    Group,
    Mesh,
    ShaderMaterial,
    Sphere,
    Uniform,
    Vector2,
    Vector3,
    Vector4
} from "three";

import type { WorldChunkLod } from "./WorldChunkLod";
import {
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL
} from "../world/semantic/SurfaceCompileProfile";
import {
    assertCompiledSurfaceChunk,
    type CompiledSurfaceChunk
} from "../world/semantic/SurfaceCompiler";
import type { CompiledWaterMesh } from "../world/semantic/SurfacePresentationCompiler";
import { surfaceToWorld } from "../world/semantic/SurfaceLattice";
import type { RenderChunkKey } from "../world/semantic/SurfaceDependency";
import type { GroundChunkMount } from "./GroundLayer";
import {
    LightingStateController,
    type LightingUniformBinding
} from "./LightingState";
import { SurfaceGroundGeometryPool } from "./SurfaceGroundGeometry";
import {
    SurfaceTexturePool,
    type SurfaceTextureBinding,
    type SurfaceTextureSlotHandle
} from "./SurfaceTexturePool";

export interface WaterLayerOptions {
    readonly surfaceTexturePool: SurfaceTexturePool;
    readonly lighting: LightingStateController;
    readonly geometryPool: SurfaceGroundGeometryPool;
    readonly hexSize?: number;
    readonly heightScale?: number;
}

export interface WaterChunkMount {
    readonly key: RenderChunkKey;
    readonly kind: CompiledSurfaceChunk["waterGeometry"]["kind"];
    readonly mesh: Mesh | null;
    readonly slot: SurfaceTextureSlotHandle;
    readonly lod: WorldChunkLod;
}

export interface WaterLayerStats {
    readonly state: "ready" | "lost" | "disposed";
    readonly mountedChunks: number;
    readonly visibleMeshes: number;
    readonly fullPatches: number;
    readonly coverageMeshes: number;
    readonly sweepMeshes: number;
    readonly uniqueGeometryBytes: number;
    readonly materialPages: number;
}

interface MutableWaterChunk {
    readonly key: Readonly<RenderChunkKey>;
    readonly keyString: string;
    readonly slot: SurfaceTextureSlotHandle;
    readonly kind: CompiledSurfaceChunk["waterGeometry"]["kind"];
    readonly mesh: Mesh | null;
    readonly ownsGeometry: boolean;
    lod: WorldChunkLod;
}

interface WaterMaterialPage {
    readonly material: ShaderMaterial;
    readonly lighting: LightingUniformBinding;
}

const WATER_VERTEX_SHADER = /* glsl */`
in vec2 surfaceUv;

uniform sampler2DArray uSurfaceValues;
uniform sampler2DArray uSurfaceFlow;
uniform sampler2DArray uSurfaceWater;
uniform float uLayer;
uniform float uHeightScale;
uniform float uTime;
uniform vec2 uChunkSurfacePhase;

out vec2 vSurfaceUv;
out vec2 vFlow;
out float vDepth;
out float vShoreDistance;
flat out float vWaterKind;
flat out float vWaterProfile;
out vec3 vWaterWorldPosition;

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;
const float TWO_PI = 6.283185307179586;

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleBilinear(sampler2DArray source, vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(source, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(source, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(source, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(source, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

void main() {
    vec4 values = sampleBilinear(uSurfaceValues, surfaceUv);
    vec2 flow = sampleBilinear(uSurfaceFlow, surfaceUv).rg;
    ivec2 categoricalCoordinate = ivec2(clamp(
        floor(surfaceFieldCoordinate(surfaceUv) + vec2(0.5)),
        vec2(0.0),
        vec2(SURFACE_FIELD_MAX_TEXEL)
    ));
    vec3 waterClass = texelFetch(
        uSurfaceWater,
        ivec3(categoricalCoordinate, int(uLayer)),
        0
    ).rgb * 255.0;
    float waterKind = waterClass.g;
    float waterProfile = waterClass.b;
    vec2 globalSurface = uChunkSurfacePhase + surfaceUv;
    float profilePhase = waterProfile / 255.0;
    float oceanWave = sin(globalSurface.x * TWO_PI / 64.0 + uTime * 1.1)
        * cos(globalSurface.y * TWO_PI / 96.0 - uTime * 0.83) * 0.012;
    float lakeWave = sin((globalSurface.x + globalSurface.y) * TWO_PI / 48.0
        + uTime * 0.65) * 0.004;
    float riverX = sin(globalSurface.x * TWO_PI / 32.0 - uTime * sign(flow.x) * 1.8);
    float riverY = sin(globalSurface.y * TWO_PI / 32.0 - uTime * sign(flow.y) * 1.8);
    float flowWeight = max(abs(flow.x) + abs(flow.y), 0.0001);
    float riverWave = (riverX * abs(flow.x) + riverY * abs(flow.y)) / flowWeight * 0.003;
    float wave = waterKind > 2.5 ? oceanWave : waterKind > 1.5 ? lakeWave : riverWave;
    wave *= mix(0.85, 1.15, profilePhase);
    wave *= smoothstep(0.0, 0.12, values.b) * smoothstep(0.02, 0.35, -values.a);
    vSurfaceUv = surfaceUv;
    vFlow = flow;
    vDepth = values.b;
    vShoreDistance = values.a;
    vWaterKind = waterKind;
    vWaterProfile = waterProfile;
    vec3 displaced = vec3(position.x, values.g * uHeightScale + wave * uHeightScale, position.z);
    vWaterWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const WATER_FRAGMENT_SHADER = /* glsl */`
uniform vec4 uValidBounds;
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;
uniform float uTime;

in vec2 vSurfaceUv;
in vec2 vFlow;
in float vDepth;
in float vShoreDistance;
flat in float vWaterKind;
flat in float vWaterProfile;
in vec3 vWaterWorldPosition;
out vec4 waterOutputColor;
#define gl_FragColor waterOutputColor

void main() {
    vec2 minimum = uValidBounds.xy - vec2(0.5);
    vec2 maximum = uValidBounds.zw - vec2(0.5);
    if (vSurfaceUv.x < minimum.x || vSurfaceUv.y < minimum.y
        || vSurfaceUv.x >= maximum.x || vSurfaceUv.y >= maximum.y) discard;
    float depthAmount = smoothstep(0.015, 0.34, vDepth);
    vec3 shallow = vWaterKind > 2.5 ? vec3(0.08, 0.38, 0.46)
        : vWaterKind > 1.5 ? vec3(0.10, 0.42, 0.38) : vec3(0.13, 0.43, 0.46);
    vec3 deep = vWaterKind > 2.5 ? vec3(0.012, 0.075, 0.16)
        : vWaterKind > 1.5 ? vec3(0.018, 0.12, 0.14) : vec3(0.025, 0.15, 0.17);
    vec3 flowNormal = normalize(vec3(-vFlow.y * 0.06, 1.0, vFlow.x * 0.06));
    vec3 viewDirection = normalize(cameraPosition - vWaterWorldPosition);
    float fresnel = pow(1.0 - max(dot(flowNormal, viewDirection), 0.0), 5.0);
    float sunAmount = pow(max(dot(flowNormal, normalize(uSunDirection)), 0.0), 48.0);
    float foam = (1.0 - smoothstep(0.03, 0.22, -vShoreDistance))
        * (0.72 + 0.28 * sin(uTime * 2.0 + vSurfaceUv.x * 5.0 + vSurfaceUv.y * 3.0));
    vec3 environment = uSkyDiffuseIrradiance * (0.24 + fresnel * 0.76)
        + uGroundDiffuseIrradiance * 0.08;
    float profileTint = vWaterProfile / 255.0;
    vec3 bodyColor = mix(shallow, deep, depthAmount)
        * mix(vec3(0.94, 1.0, 1.04), vec3(1.04, 0.98, 0.92), profileTint);
    vec3 linearColor = bodyColor * environment
        + uSunRadiance * sunAmount * 0.34
        + vec3(0.72, 0.86, 0.88) * foam * 0.42;
    gl_FragColor = vec4(linearColor, 0.86);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function keyString(key: RenderChunkKey): string {
    if (!key || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("WaterLayer render chunk key is invalid");
    }
    return `${key.chunkX},${key.chunkY}`;
}

function assertLod(lod: WorldChunkLod): void {
    if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("water chunk LOD must be 0, 1 or 2");
}

function createCompiledWaterGeometry(
    source: CompiledWaterMesh,
    hexSize: number,
    heightScale: number
): BufferGeometry {
    const vertexCount = source.surfaceUv.length / 2;
    const positions = new Float32Array(vertexCount * 3);
    for (let index = 0; index < vertexCount; index += 1) {
        const coordinate = surfaceToWorld(
            source.surfaceUv[index * 2],
            source.surfaceUv[index * 2 + 1],
            hexSize
        );
        positions[index * 3] = coordinate.x;
        positions[index * 3 + 2] = coordinate.z;
    }
    const geometry = new BufferGeometry();
    geometry.name = "surface-water-compiled";
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("surfaceUv", new BufferAttribute(source.surfaceUv, 2));
    geometry.setIndex(new BufferAttribute(source.indices, 1));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new Box3();
    geometry.boundingBox = new Box3(
        new Vector3(bounds.min.x, -heightScale * 0.02, bounds.min.z),
        new Vector3(bounds.max.x, heightScale * 1.02, bounds.max.z)
    );
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere = new Sphere());
    geometry.userData.surfaceWaterByteLength = positions.byteLength
        + source.surfaceUv.byteLength + source.indices.byteLength;
    return geometry;
}

function freezeMount(chunk: MutableWaterChunk): WaterChunkMount {
    return Object.freeze({
        key: chunk.key,
        kind: chunk.kind,
        mesh: chunk.mesh,
        slot: chunk.slot,
        lod: chunk.lod
    });
}

export class WaterLayer {
    public readonly root = new Group();
    private readonly surfaceTexturePool: SurfaceTexturePool;
    private readonly lighting: LightingStateController;
    private readonly geometryPool: SurfaceGroundGeometryPool;
    private readonly hexSize: number;
    private readonly heightScale: number;
    private readonly chunks = new Map<string, MutableWaterChunk>();
    private readonly materials = new Map<number, WaterMaterialPage>();
    private floatingOriginX = 0;
    private floatingOriginZ = 0;
    private time = 0;
    private stateValue: "ready" | "lost" | "disposed" = "ready";

    constructor(options: WaterLayerOptions) {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "surfaceTexturePool", "lighting", "geometryPool", "hexSize", "heightScale"
            ].includes(name))
            || !(options.surfaceTexturePool instanceof SurfaceTexturePool)
            || !(options.lighting instanceof LightingStateController)
            || !(options.geometryPool instanceof SurfaceGroundGeometryPool)
            || options.surfaceTexturePool.state !== "ready"
            || options.lighting.stats.state !== "ready"
            || options.geometryPool.stats.state !== "ready") {
            throw new TypeError("WaterLayer options are invalid or not ready");
        }
        this.hexSize = options.hexSize ?? 1;
        this.heightScale = options.heightScale ?? 1;
        if (!Number.isFinite(this.hexSize) || this.hexSize <= 0
            || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
            throw new RangeError("WaterLayer scales must be finite and positive");
        }
        this.surfaceTexturePool = options.surfaceTexturePool;
        this.lighting = options.lighting;
        this.geometryPool = options.geometryPool;
        this.root.name = "surface-water-layer-v2";
    }

    public mount(chunk: CompiledSurfaceChunk, ground: GroundChunkMount): WaterChunkMount {
        this.assertReady();
        assertCompiledSurfaceChunk(chunk);
        assertLod(ground.lod);
        if (chunk.key.chunkX !== ground.key.chunkX || chunk.key.chunkY !== ground.key.chunkY
            || !this.surfaceTexturePool.isCurrent(ground.slot)) {
            throw new TypeError("WaterLayer requires the current matching ground mount");
        }
        const serialized = keyString(chunk.key);
        const binding = this.surfaceTexturePool.getBinding(ground.slot);
        let geometry: BufferGeometry | undefined;
        let ownsGeometry = false;
        if (chunk.waterGeometry.kind === "full") geometry = this.geometryPool.get(ground.lod);
        else if (chunk.waterGeometry.kind === "coverage" || chunk.waterGeometry.kind === "sweep") {
            geometry = createCompiledWaterGeometry(chunk.waterGeometry.mesh, this.hexSize, this.heightScale);
            ownsGeometry = true;
        }
        const materialPage = geometry ? this.materialForBinding(binding) : undefined;
        const mesh = geometry && materialPage ? new Mesh(geometry, materialPage.material) : null;
        const mounted: MutableWaterChunk = {
            key: Object.freeze({ ...chunk.key }),
            keyString: serialized,
            slot: ground.slot,
            kind: chunk.waterGeometry.kind,
            mesh,
            ownsGeometry,
            lod: ground.lod
        };
        if (mesh && materialPage) {
            mesh.name = `surface-water-${chunk.waterGeometry.kind}-${serialized}`;
            mesh.renderOrder = 1;
            mesh.onBeforeRender = () => this.prepareDraw(mounted, chunk, materialPage.material);
            this.positionChunk(mounted);
        }
        const previous = this.chunks.get(serialized);
        if (previous) this.removeChunk(previous);
        this.chunks.set(serialized, mounted);
        if (mesh) this.root.add(mesh);
        return freezeMount(mounted);
    }

    public setLod(key: RenderChunkKey, lod: WorldChunkLod): boolean {
        this.assertReady();
        assertLod(lod);
        const chunk = this.chunks.get(keyString(key));
        if (!chunk || chunk.lod === lod) return false;
        chunk.lod = lod;
        if (chunk.kind === "full" && chunk.mesh) chunk.mesh.geometry = this.geometryPool.get(lod);
        return true;
    }

    public setTime(seconds: number): void {
        this.assertReady();
        if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("water time must be finite and non-negative");
        this.time = seconds;
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        this.assertNotDisposed();
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError("WaterLayer floating origin must be finite");
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
        if (this.stateValue !== "lost") throw new TypeError("WaterLayer context can only restore from lost");
        for (const page of this.materials.values()) page.material.needsUpdate = true;
        this.stateValue = "ready";
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        for (const chunk of this.chunks.values()) this.removeChunk(chunk);
        this.chunks.clear();
        for (const page of this.materials.values()) {
            page.lighting.release();
            page.material.dispose();
        }
        this.materials.clear();
        this.root.removeFromParent();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<WaterLayerStats> {
        let visibleMeshes = 0;
        let fullPatches = 0;
        let coverageMeshes = 0;
        let sweepMeshes = 0;
        let uniqueGeometryBytes = 0;
        for (const chunk of this.chunks.values()) {
            if (chunk.mesh) visibleMeshes += 1;
            if (chunk.kind === "full") fullPatches += 1;
            if (chunk.kind === "coverage") coverageMeshes += 1;
            if (chunk.kind === "sweep") sweepMeshes += 1;
            if (chunk.ownsGeometry && chunk.mesh) {
                uniqueGeometryBytes += Number(chunk.mesh.geometry.userData.surfaceWaterByteLength ?? 0);
            }
        }
        return Object.freeze({
            state: this.stateValue,
            mountedChunks: this.chunks.size,
            visibleMeshes,
            fullPatches,
            coverageMeshes,
            sweepMeshes,
            uniqueGeometryBytes,
            materialPages: this.materials.size
        });
    }

    private materialForBinding(binding: SurfaceTextureBinding): WaterMaterialPage {
        let page = this.materials.get(binding.slot.pageIndex);
        if (page) return page;
        const lighting = this.lighting.bindUniforms();
        const material = new ShaderMaterial({
            name: `surface-water-page-${binding.slot.pageIndex}`,
            glslVersion: GLSL3,
            vertexShader: WATER_VERTEX_SHADER,
            fragmentShader: WATER_FRAGMENT_SHADER,
            uniforms: {
                uSurfaceValues: new Uniform(binding.valuesTexture),
                uSurfaceFlow: new Uniform(binding.flowTexture),
                uSurfaceWater: new Uniform(binding.waterTexture),
                uLayer: new Uniform(0),
                uHeightScale: new Uniform(this.heightScale),
                uTime: new Uniform(0),
                uChunkSurfacePhase: new Uniform(new Vector2()),
                uValidBounds: new Uniform(new Vector4(0, 0, 16, 16)),
                uSunDirection: lighting.sunDirection,
                uSunRadiance: lighting.sunRadiance,
                uSkyDiffuseIrradiance: lighting.skyDiffuseIrradiance,
                uGroundDiffuseIrradiance: lighting.groundDiffuseIrradiance
            },
            side: DoubleSide,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            toneMapped: true
        });
        page = Object.freeze({ material, lighting });
        this.materials.set(binding.slot.pageIndex, page);
        return page;
    }

    private prepareDraw(
        mounted: MutableWaterChunk,
        chunk: CompiledSurfaceChunk,
        material: ShaderMaterial
    ): void {
        if (!this.surfaceTexturePool.isCurrent(mounted.slot) || !mounted.mesh) {
            if (mounted.mesh) mounted.mesh.visible = false;
            return;
        }
        mounted.mesh.visible = true;
        material.uniforms.uLayer.value = mounted.slot.layerIndex;
        material.uniforms.uTime.value = this.time;
        const phasePeriod = 192;
        const originX = mounted.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const originY = mounted.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        (material.uniforms.uChunkSurfacePhase.value as Vector2).set(
            (originX % phasePeriod + phasePeriod) % phasePeriod,
            (originY % phasePeriod + phasePeriod) % phasePeriod
        );
        const bounds = chunk.bounds.validTiles;
        (material.uniforms.uValidBounds.value as Vector4).set(
            bounds.minX,
            bounds.minY,
            bounds.maxXExclusive,
            bounds.maxYExclusive
        );
    }

    private positionChunk(chunk: MutableWaterChunk): void {
        if (!chunk.mesh) return;
        const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
            throw new RangeError("WaterLayer render origin exceeds the safe integer domain");
        }
        chunk.mesh.position.set(
            1.5 * this.hexSize * surfaceX - this.floatingOriginX,
            0,
            Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
        );
        chunk.mesh.updateMatrix();
        chunk.mesh.updateMatrixWorld();
    }

    private removeChunk(chunk: MutableWaterChunk): void {
        if (!chunk.mesh) return;
        this.root.remove(chunk.mesh);
        chunk.mesh.onBeforeRender = () => undefined;
        if (chunk.ownsGeometry) chunk.mesh.geometry.dispose();
    }

    private assertReady(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") throw new TypeError("WaterLayer cannot mutate while context is lost");
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") throw new TypeError("WaterLayer is disposed");
    }
}

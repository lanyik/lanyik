import {
    Color,
    DoubleSide,
    Group,
    GLSL3,
    Mesh,
    ShaderMaterial,
    Texture,
    Uniform,
    Vector2,
    Vector4,
    type ColorRepresentation
} from "three";

import type { WorldChunkLod } from "../helpers/chunks";
import type { ResidentSurfaceLease } from "../world/semantic/SurfaceCompilationService";
import {
    SURFACE_RENDER_CHUNK_SIZE,
    SURFACE_SAMPLES_PER_TILE_INTERVAL
} from "../world/semantic/SurfaceCompileProfile";
import { assertCompiledSurfaceChunk } from "../world/semantic/SurfaceCompiler";
import type { RenderChunkKey } from "../world/semantic/SurfaceDependency";
import {
    assertSurfaceRequestToken,
    surfaceDependencyKeysEqual
} from "../world/semantic/SurfaceDependency";
import {
    LightingStateController,
    type LightingUniformBinding
} from "./LightingState";
import {
    SurfaceFogTexturePool,
    SURFACE_FOG_LAYER_BYTES
} from "./SurfaceFogTexturePool";
import {
    getSurfaceGroundGeometryInfo,
    SurfaceGroundGeometryPool
} from "./SurfaceGroundGeometry";
import {
    SurfaceTexturePool,
    type SurfaceTextureBinding,
    type SurfaceTextureSlotHandle
} from "./SurfaceTexturePool";

export const SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE = Object.freeze([
    0x587548,
    0xb39764,
    0x9caeb5,
    0x77746f
] as const);

export interface GroundLayerOptions {
    readonly surfaceTexturePool: SurfaceTexturePool;
    readonly fogTexturePool?: SurfaceFogTexturePool;
    readonly lighting: LightingStateController;
    readonly geometryPool?: SurfaceGroundGeometryPool;
    readonly hexSize?: number;
    readonly heightScale?: number;
    readonly materialPalette?: readonly [
        ColorRepresentation,
        ColorRepresentation,
        ColorRepresentation,
        ColorRepresentation
    ];
}

export interface GroundChunkMount {
    readonly key: RenderChunkKey;
    readonly mesh: Mesh;
    readonly slot: SurfaceTextureSlotHandle;
    readonly lod: WorldChunkLod;
    readonly effectiveRevision: number;
}

export interface GroundLayerStats {
    readonly state: "ready" | "lost" | "disposed";
    readonly mountedChunks: number;
    readonly lod0Chunks: number;
    readonly lod1Chunks: number;
    readonly lod2Chunks: number;
    readonly foggedChunks: number;
    readonly materialPages: number;
    readonly geometryBytes: number;
    readonly geometryVertices: number;
    readonly geometryTriangles: number;
}

interface MutableGroundChunk {
    readonly key: Readonly<RenderChunkKey>;
    readonly keyString: string;
    readonly mesh: Mesh;
    readonly slot: SurfaceTextureSlotHandle;
    lease: ResidentSurfaceLease;
    lod: WorldChunkLod;
    hasFog: boolean;
}

interface GroundMaterialPage {
    readonly material: ShaderMaterial;
    readonly lighting: LightingUniformBinding;
}

const GROUND_VERTEX_SHADER = /* glsl */`
in vec2 surfaceUv;

uniform sampler2DArray uSurfaceValues;
uniform float uLayer;
uniform float uHeightScale;

out vec2 vSurfaceUv;
out vec3 vWorldNormal;

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;
const float SQRT_THREE = 1.7320508075688772;

float surfaceStagger(float u) {
    float column = floor(u);
    float amount = u - column;
    float parity = mod(mod(column, 2.0) + 2.0, 2.0);
    float first = parity < 0.5 ? 0.5 : 0.0;
    float second = 0.5 - first;
    return mix(first, second, amount);
}

vec2 surfaceWorld(vec2 localSurface) {
    return vec2(
        1.5 * localSurface.x,
        SQRT_THREE * (localSurface.y + surfaceStagger(localSurface.x))
    );
}

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleSurfaceValues(vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(uSurfaceValues, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(uSurfaceValues, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(uSurfaceValues, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(uSurfaceValues, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

void main() {
    float groundHeight = sampleSurfaceValues(surfaceUv).r * uHeightScale;
    float delta = 1.0 / SURFACE_SAMPLES_PER_TILE;
    vec2 lower = max(surfaceUv - vec2(delta), vec2(-0.5));
    vec2 upper = min(surfaceUv + vec2(delta), vec2(15.5));
    float leftHeight = sampleSurfaceValues(vec2(lower.x, surfaceUv.y)).r * uHeightScale;
    float rightHeight = sampleSurfaceValues(vec2(upper.x, surfaceUv.y)).r * uHeightScale;
    float topHeight = sampleSurfaceValues(vec2(surfaceUv.x, lower.y)).r * uHeightScale;
    float bottomHeight = sampleSurfaceValues(vec2(surfaceUv.x, upper.y)).r * uHeightScale;
    vec2 leftWorld = surfaceWorld(vec2(lower.x, surfaceUv.y));
    vec2 rightWorld = surfaceWorld(vec2(upper.x, surfaceUv.y));
    vec2 topWorld = surfaceWorld(vec2(surfaceUv.x, lower.y));
    vec2 bottomWorld = surfaceWorld(vec2(surfaceUv.x, upper.y));
    vec3 tangentU = vec3(rightWorld.x - leftWorld.x, rightHeight - leftHeight, rightWorld.y - leftWorld.y);
    vec3 tangentV = vec3(bottomWorld.x - topWorld.x, bottomHeight - topHeight, bottomWorld.y - topWorld.y);
    vWorldNormal = normalize(mat3(modelMatrix) * normalize(cross(tangentV, tangentU)));
    vSurfaceUv = surfaceUv;
    vec3 displaced = vec3(position.x, groundHeight, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const GROUND_FRAGMENT_SHADER = /* glsl */`
uniform sampler2DArray uSurfaceMaterial;
uniform sampler2DArray uFogTexture;
uniform float uLayer;
uniform bool uFogEnabled;
uniform vec4 uValidBounds;
uniform vec3 uMaterialPalette[4];
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;

in vec2 vSurfaceUv;
in vec3 vWorldNormal;
out vec4 groundOutputColor;
#define gl_FragColor groundOutputColor

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleSurfaceMaterial(vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(uSurfaceMaterial, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(uSurfaceMaterial, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(uSurfaceMaterial, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(uSurfaceMaterial, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

void main() {
    vec2 minimum = uValidBounds.xy - vec2(0.5);
    vec2 maximum = uValidBounds.zw - vec2(0.5);
    if (vSurfaceUv.x < minimum.x || vSurfaceUv.y < minimum.y
        || vSurfaceUv.x >= maximum.x || vSurfaceUv.y >= maximum.y) discard;

    vec4 weights = sampleSurfaceMaterial(vSurfaceUv);
    float weightSum = max(dot(weights, vec4(1.0)), 0.0001);
    vec3 albedo = (uMaterialPalette[0] * weights.r
        + uMaterialPalette[1] * weights.g
        + uMaterialPalette[2] * weights.b
        + uMaterialPalette[3] * weights.a) / weightSum;
    vec3 normal = normalize(vWorldNormal);
    float sunAmount = max(dot(normal, normalize(uSunDirection)), 0.0);
    float skyAmount = normal.y * 0.5 + 0.5;
    vec3 irradiance = uSunRadiance * sunAmount
        + uSkyDiffuseIrradiance * skyAmount
        + uGroundDiffuseIrradiance * (1.0 - skyAmount);
    vec3 linearColor = albedo * irradiance;
    if (uFogEnabled) {
        ivec2 fogCoordinate = ivec2(clamp(floor(vSurfaceUv + vec2(0.5)), vec2(0.0), vec2(15.0)));
        float visibility = texelFetch(uFogTexture, ivec3(fogCoordinate, int(uLayer)), 0).r;
        linearColor = mix(vec3(0.018, 0.022, 0.027), linearColor, visibility);
    }
    gl_FragColor = vec4(linearColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

function keyString(key: RenderChunkKey): string {
    assertRenderKey(key);
    return `${key.chunkX},${key.chunkY}`;
}

function assertRenderKey(key: RenderChunkKey): void {
    if (!key || typeof key !== "object"
        || Object.getOwnPropertyNames(key).some(name => name !== "chunkX" && name !== "chunkY")
        || !Number.isSafeInteger(key.chunkX) || !Number.isSafeInteger(key.chunkY)) {
        throw new TypeError("GroundLayer render chunk key is invalid");
    }
}

function assertLod(lod: WorldChunkLod): void {
    if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("ground chunk LOD must be 0, 1 or 2");
}

function assertLease(lease: ResidentSurfaceLease): void {
    if (!lease || typeof lease !== "object" || typeof lease.isCurrent !== "function"
        || typeof lease.release !== "function" || lease.released || !lease.isCurrent()) {
        throw new TypeError("GroundLayer requires a current resident surface lease");
    }
    assertCompiledSurfaceChunk(lease.chunk);
    assertSurfaceRequestToken(lease.requestToken);
    if (lease.effectiveRevision !== lease.chunk.effectiveRevision
        || !surfaceDependencyKeysEqual(lease.dependencyKey, lease.chunk.dependencyKey)) {
        throw new TypeError("GroundLayer lease identity does not match its compiled chunk");
    }
}

function freezeMount(chunk: MutableGroundChunk): GroundChunkMount {
    return Object.freeze({
        key: chunk.key,
        mesh: chunk.mesh,
        slot: chunk.slot,
        lod: chunk.lod,
        effectiveRevision: chunk.lease.effectiveRevision
    });
}

export class GroundLayer {
    public readonly root = new Group();
    private readonly surfaceTexturePool: SurfaceTexturePool;
    private readonly fogTexturePool: SurfaceFogTexturePool | undefined;
    private readonly lighting: LightingStateController;
    private readonly geometryPool: SurfaceGroundGeometryPool;
    private readonly ownsGeometryPool: boolean;
    private readonly heightScale: number;
    private readonly hexSize: number;
    private readonly palette: readonly Color[];
    private readonly chunks = new Map<string, MutableGroundChunk>();
    private readonly materials = new Map<number, GroundMaterialPage>();
    private floatingOriginX = 0;
    private floatingOriginZ = 0;
    private stateValue: "ready" | "lost" | "disposed" = "ready";

    constructor(options: GroundLayerOptions) {
        if (!options || typeof options !== "object"
            || Object.getOwnPropertyNames(options).some(name => ![
                "surfaceTexturePool", "fogTexturePool", "lighting", "geometryPool",
                "hexSize", "heightScale", "materialPalette"
            ].includes(name))
            || !(options.surfaceTexturePool instanceof SurfaceTexturePool)
            || options.fogTexturePool !== undefined && !(options.fogTexturePool instanceof SurfaceFogTexturePool)
            || options.geometryPool !== undefined && !(options.geometryPool instanceof SurfaceGroundGeometryPool)
            || !(options.lighting instanceof LightingStateController)) {
            throw new TypeError("GroundLayer options are invalid");
        }
        if (options.surfaceTexturePool.state !== "ready"
            || options.fogTexturePool?.state === "disposed"
            || options.fogTexturePool?.state === "lost"
            || options.lighting.stats.state !== "ready") {
            throw new TypeError("GroundLayer dependencies must be ready");
        }
        if (options.fogTexturePool && !options.fogTexturePool.isCompanionOf(options.surfaceTexturePool)) {
            throw new TypeError("GroundLayer fog pool must accompany its surface texture pool");
        }
        if (options.geometryPool?.stats.state === "disposed") {
            throw new TypeError("GroundLayer geometry pool must be ready");
        }
        this.hexSize = options.hexSize ?? 1;
        this.heightScale = options.heightScale ?? 1;
        if (!Number.isFinite(this.hexSize) || this.hexSize <= 0
            || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
            throw new RangeError("GroundLayer scales must be finite and positive");
        }
        const palette = options.materialPalette ?? SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE;
        if (!Array.isArray(palette) || palette.length !== 4) {
            throw new TypeError("GroundLayer material palette must contain exactly four colors");
        }
        this.palette = Object.freeze(palette.map(value => new Color(value)));
        this.surfaceTexturePool = options.surfaceTexturePool;
        this.fogTexturePool = options.fogTexturePool;
        this.lighting = options.lighting;
        this.geometryPool = options.geometryPool
            ?? new SurfaceGroundGeometryPool(this.hexSize, this.heightScale);
        this.ownsGeometryPool = options.geometryPool === undefined;
        this.root.name = "surface-ground-layer-v2";
        this.root.matrixAutoUpdate = true;
    }

    public get state(): "ready" | "lost" | "disposed" { return this.stateValue; }

    public mount(lease: ResidentSurfaceLease, lod: WorldChunkLod): GroundChunkMount {
        this.assertReady();
        assertLease(lease);
        assertLod(lod);
        const key = lease.chunk.key;
        const serialized = keyString(key);
        const existing = this.chunks.get(serialized);
        if (existing) {
            if (existing.lease === lease) throw new TypeError("surface lease is already mounted");
            if (existing.lease.released) {
                throw new TypeError("GroundLayer mounted lease was released outside its owner");
            }
            if (!this.surfaceTexturePool.upload(existing.slot, lease.chunk)) {
                throw new RangeError("GroundLayer texture slot became stale during replacement");
            }
            const previous = existing.lease;
            existing.lease = lease;
            if (existing.lod !== lod) {
                existing.lod = lod;
                existing.mesh.geometry = this.geometryPool.get(lod);
            }
            previous.release();
            return freezeMount(existing);
        }

        const slot = this.surfaceTexturePool.allocate(key);
        try {
            if (!this.surfaceTexturePool.upload(slot, lease.chunk)) {
                throw new RangeError("GroundLayer texture slot became stale during initial upload");
            }
            const binding = this.surfaceTexturePool.getBinding(slot);
            const material = this.materialForBinding(binding);
            const mesh = new Mesh(this.geometryPool.get(lod), material.material);
            mesh.name = `surface-ground-${serialized}`;
            mesh.matrixAutoUpdate = true;
            const chunk: MutableGroundChunk = {
                key: Object.freeze({ ...key }),
                keyString: serialized,
                mesh,
                slot,
                lease,
                lod,
                hasFog: false
            };
            mesh.onBeforeRender = () => this.prepareDraw(chunk, material.material);
            this.positionChunk(chunk);
            this.chunks.set(serialized, chunk);
            this.root.add(mesh);
            return freezeMount(chunk);
        } catch (reason) {
            this.surfaceTexturePool.release(slot);
            throw reason;
        }
    }

    public setLod(key: RenderChunkKey, lod: WorldChunkLod): boolean {
        this.assertReady();
        assertLod(lod);
        const chunk = this.chunks.get(keyString(key));
        if (!chunk) return false;
        if (chunk.lod === lod) return false;
        chunk.lod = lod;
        chunk.mesh.geometry = this.geometryPool.get(lod);
        return true;
    }

    public uploadFog(key: RenderChunkKey, fog: Uint8Array): boolean {
        this.assertReady();
        if (!this.fogTexturePool) throw new TypeError("GroundLayer has no dynamic fog texture pool");
        if (!(fog instanceof Uint8Array) || fog.length !== SURFACE_FOG_LAYER_BYTES) {
            throw new TypeError("GroundLayer fog update must contain one 16x16 R8 layer");
        }
        const chunk = this.chunks.get(keyString(key));
        if (!chunk) return false;
        if (!this.fogTexturePool.upload(chunk.slot, fog)) return false;
        chunk.hasFog = true;
        const fogBinding = this.fogTexturePool.getBinding(chunk.slot);
        const material = this.materials.get(chunk.slot.pageIndex);
        if (!material) throw new TypeError("GroundLayer material page is missing");
        material.material.uniforms.uFogTexture.value = fogBinding.texture;
        return true;
    }

    public setFloatingOrigin(worldX: number, worldZ: number): void {
        this.assertNotDisposed();
        if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
            throw new RangeError("GroundLayer floating origin must be finite");
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
        this.root.remove(chunk.mesh);
        chunk.mesh.onBeforeRender = () => undefined;
        if (chunk.hasFog) this.fogTexturePool?.release(chunk.slot);
        this.surfaceTexturePool.release(chunk.slot);
        chunk.lease.release();
        return true;
    }

    public handleContextLost(): void {
        this.assertNotDisposed();
        if (this.stateValue === "lost") return;
        this.fogTexturePool?.handleContextLost();
        this.surfaceTexturePool.handleContextLost();
        this.stateValue = "lost";
    }

    public handleContextRestored(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "lost") {
            throw new TypeError("GroundLayer context can only restore from the lost state");
        }
        this.surfaceTexturePool.handleContextRestored();
        this.fogTexturePool?.handleContextRestored();
        for (const page of this.materials.values()) page.material.needsUpdate = true;
        this.stateValue = "ready";
    }

    public dispose(): void {
        if (this.stateValue === "disposed") return;
        for (const key of [...this.chunks.values()].map(chunk => chunk.key)) this.unmount(key);
        for (const page of this.materials.values()) {
            page.lighting.release();
            page.material.dispose();
        }
        this.materials.clear();
        if (this.ownsGeometryPool) this.geometryPool.dispose();
        this.root.removeFromParent();
        this.stateValue = "disposed";
    }

    public get stats(): Readonly<GroundLayerStats> {
        const lodCounts = [0, 0, 0];
        let foggedChunks = 0;
        for (const chunk of this.chunks.values()) {
            lodCounts[chunk.lod] += 1;
            if (chunk.hasFog) foggedChunks += 1;
        }
        const geometry = this.geometryPool.stats;
        return Object.freeze({
            state: this.stateValue,
            mountedChunks: this.chunks.size,
            lod0Chunks: lodCounts[0],
            lod1Chunks: lodCounts[1],
            lod2Chunks: lodCounts[2],
            foggedChunks,
            materialPages: this.materials.size,
            geometryBytes: geometry.byteLength,
            geometryVertices: geometry.vertexCount,
            geometryTriangles: geometry.triangleCount
        });
    }

    private materialForBinding(binding: SurfaceTextureBinding): GroundMaterialPage {
        let page = this.materials.get(binding.slot.pageIndex);
        if (page) return page;
        const lighting = this.lighting.bindUniforms();
        const material = new ShaderMaterial({
            name: `surface-ground-page-${binding.slot.pageIndex}`,
            glslVersion: GLSL3,
            vertexShader: GROUND_VERTEX_SHADER,
            fragmentShader: GROUND_FRAGMENT_SHADER,
            uniforms: {
                uSurfaceValues: new Uniform(binding.valuesTexture),
                uSurfaceMaterial: new Uniform(binding.materialTexture),
                uFogTexture: new Uniform<Texture | null>(null),
                uLayer: new Uniform(0),
                uHeightScale: new Uniform(this.heightScale),
                uFogEnabled: new Uniform(false),
                uValidBounds: new Uniform(new Vector4(0, 0, 16, 16)),
                uMaterialPalette: new Uniform(this.palette),
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
        page = Object.freeze({ material, lighting });
        this.materials.set(binding.slot.pageIndex, page);
        return page;
    }

    private prepareDraw(chunk: MutableGroundChunk, material: ShaderMaterial): void {
        if (!this.surfaceTexturePool.isCurrent(chunk.slot)
            || chunk.lease.released) {
            chunk.mesh.visible = false;
            return;
        }
        chunk.mesh.visible = true;
        material.uniforms.uLayer.value = chunk.slot.layerIndex;
        material.uniforms.uFogEnabled.value = chunk.hasFog;
        const bounds = chunk.lease.chunk.bounds.validTiles;
        (material.uniforms.uValidBounds.value as Vector4).set(
            bounds.minX,
            bounds.minY,
            bounds.maxXExclusive,
            bounds.maxYExclusive
        );
    }

    private positionChunk(chunk: MutableGroundChunk): void {
        const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
        const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
        if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
            throw new RangeError("GroundLayer render origin exceeds the safe integer domain");
        }
        chunk.mesh.position.set(
            1.5 * this.hexSize * surfaceX - this.floatingOriginX,
            0,
            Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
        );
        chunk.mesh.updateMatrix();
        chunk.mesh.updateMatrixWorld();
        const info = getSurfaceGroundGeometryInfo(chunk.mesh.geometry);
        if (info.lod !== chunk.lod) throw new TypeError("GroundLayer mounted the wrong shared LOD geometry");
    }

    private assertReady(): void {
        this.assertNotDisposed();
        if (this.stateValue !== "ready") throw new TypeError("GroundLayer cannot mutate while context is lost");
    }

    private assertNotDisposed(): void {
        if (this.stateValue === "disposed") throw new TypeError("GroundLayer is disposed");
    }
}

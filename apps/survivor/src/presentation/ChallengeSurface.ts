import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, RepeatWrapping, ShaderChunk,
    type Texture } from "three";
import type { GroundProjection } from "three-hex-map";
import { CHALLENGE_ARENA } from "../core/BossChallenge";
import { challengeBank, challengePathDistance } from "../core/ChallengeLayout";
import { WORLD_VIEW } from "../core/WorldView";

const WATER_Y = -.3;
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
// Fine erosion stays seaward of the authority curve, entirely inside the blocked bank margin.
const bankDetail = (z: number) => -.08 - .055 * Math.sin(z * 2.6) - .025 * Math.sin(z * 5);

/** Finite authored surface. All reachable ground remains at the simulation's Y=0. */
export class ChallengeSurface {
    public readonly root = new Group();
    private readonly time = { value: 0 };
    private readonly geometries: BufferGeometry[] = [];
    private readonly materials: MeshStandardMaterial[] = [];
    constructor(textures: Record<string, Texture>, projection: GroundProjection) {
        const get = (name: string) => textures[`scenery/${name}.png`];
        for (const name of ["soil", "grass"]) for (const channel of ["color", "normal", "orm"]) {
            const texture = get(`${name}-${channel}`); texture.wrapS = texture.wrapT = RepeatWrapping;
        }
        const ground = new MeshStandardMaterial({ map: get("soil-color"), normalMap: get("soil-normal"),
            roughnessMap: get("soil-orm"), aoMap: get("soil-orm"), roughness: 1 });
        // Exposed uniforms let the existing resource collector account for every sampler.
        const uniforms = { grassColor: { value: get("grass-color") }, grassNormal: { value: get("grass-normal") },
            grassOrm: { value: get("grass-orm") }, groundMap: { value: projection.target.texture }, groundBounds: { value: projection.bounds } };
        Object.assign(ground, { uniforms });
        ground.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = `attribute vec2 surfaceWeights; varying vec2 vSurfaceWeights; varying vec2 vGroundXZ;\n${shader.vertexShader}`
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurfaceWeights = surfaceWeights; vGroundXZ = position.xz;");
            shader.fragmentShader = `uniform sampler2D grassColor, grassNormal, grassOrm, groundMap;
                uniform vec4 groundBounds; varying vec2 vSurfaceWeights; varying vec2 vGroundXZ;\n${shader.fragmentShader}`;
            for (const [chunk, map, uv, grass] of [["map_fragment", "map", "vMapUv", "grassColor"],
                ["normal_fragment_maps", "normalMap", "vNormalMapUv", "grassNormal"],
                ["roughnessmap_fragment", "roughnessMap", "vRoughnessMapUv", "grassOrm"],
                ["aomap_fragment", "aoMap", "vAoMapUv", "grassOrm"]] as const) {
                shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, ShaderChunk[chunk]
                    .replaceAll(`texture2D( ${map}, ${uv} )`, `mix(texture2D(${map}, ${uv}), texture2D(${grass}, ${uv}), vSurfaceWeights.x)`));
            }
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, .48, vSurfaceWeights.y);")
                .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .42, vSurfaceWeights.y);")
                .replace("#include <opaque_fragment>", `
                    vec2 groundUv = (vGroundXZ * ${WORLD_VIEW.unitScale.toFixed(1)} - groundBounds.xy) / groundBounds.zw;
                    if (all(greaterThanEqual(groundUv, vec2(0.0))) && all(lessThanEqual(groundUv, vec2(1.0)))) {
                        vec4 decal = texture2D(groundMap, vec2(groundUv.x, 1.0 - groundUv.y));
                        outgoingLight = outgoingLight * (1.0 - decal.a) + decal.rgb;
                    }
                    #include <opaque_fragment>`);
        };
        ground.customProgramCacheKey = () => "challenge-ground-v1";
        const water = new MeshStandardMaterial({ color: 0xffffff, roughness: .24, metalness: 0 });
        water.onBeforeCompile = shader => {
            shader.uniforms.bankTime = this.time;
            shader.vertexShader = `varying vec2 vWaterXZ; varying float vWaterDepth; attribute vec2 surfaceWeights;\n${shader.vertexShader}`
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterXZ = position.xz; vWaterDepth = surfaceWeights.y;");
            shader.fragmentShader = `uniform float bankTime; varying vec2 vWaterXZ; varying float vWaterDepth;\n${shader.fragmentShader}`
                .replace("#include <color_fragment>", `#include <color_fragment>
                    float wave = sin(vWaterXZ.x * 4.0 + vWaterXZ.y * 2.0 + bankTime * 2.0);
                    diffuseColor.rgb *= mix(vec3(.065, .105, .095), vec3(.018, .042, .049), smoothstep(0.0, 5.0, vWaterDepth));
                    diffuseColor.rgb += .015 * wave * wave * (1.0 - smoothstep(.0, .4, vWaterDepth));`)
                .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
                    normal = normalize(normal + mat3(viewMatrix) * vec3(.07 * wave, 0.0, .035 * sin(vWaterXZ.y * 6.0 - bankTime * 3.0)));`);
        };
        water.customProgramCacheKey = () => "challenge-water-v1";
        this.materials.push(ground, water);
        for (const isWater of [false, true]) {
            const geometry = this.geometry(isWater), mesh = new Mesh(geometry, isWater ? water : ground);
            mesh.name = isWater ? "challenge-water" : "challenge-ground";
            mesh.receiveShadow = true; mesh.castShadow = !isWater;
            this.geometries.push(geometry); this.root.add(mesh);
        }
    }
    private geometry(water: boolean): BufferGeometry {
        const positions: number[] = [], uv: number[] = [], weights: number[] = [], indices: number[] = [];
        const columns = water ? 20 : 116, rows = 288;
        const shore = [-2, -1, -.5, 0, .2, .4, .6, .8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5];
        for (let row = 0; row <= rows; row++) {
            const z = -4 + row * .25, bank = challengeBank(z) + bankDetail(z);
            for (let column = 0; column <= columns; column++) {
                const d = water ? -24 * (1 - column / columns) : column < shore.length ? shore[column]
                    : 5 + (62 - bank - 5) * (column - shore.length + 1) / (columns - shore.length + 1);
                const x = bank + d, y = water ? WATER_Y : d < 0 ? WATER_Y + d * .12 : -.3 * (1 - Math.min(1, d / 1.2)) ** 2;
                positions.push(x, y, z); uv.push(x / 5, -z / 5);
                if (water) weights.push(0, -d);
                else {
                    const path = challengePathDistance(x, z), arena = Math.hypot(x - CHALLENGE_ARENA.x, z - CHALLENGE_ARENA.z);
                    const camp = Math.hypot(x - 31, z - 51);
                    const grass = smooth(1.1, 2.5, path) * smooth(5, 7, arena) * smooth(2, 4.5, d) * smooth(2.5, 4, camp);
                    weights.push(grass * (.7 + .15 * Math.sin(x * .47 + Math.sin(z * .29))), 1 - smooth(0, 1.8, d));
                }
                if (row < rows && column < columns) {
                    const a = row * (columns + 1) + column, b = a + columns + 1;
                    indices.push(a, b, a + 1, a + 1, b, b + 1);
                }
            }
        }
        const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2)); geometry.setAttribute("surfaceWeights", new Float32BufferAttribute(weights, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
    }
    public update(timestampMs: number): void { this.time.value = timestampMs / 1000 % (20 * Math.PI); }
    public dispose(): void { this.root.removeFromParent(); this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose()); }
}

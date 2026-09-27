import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PointLight } from "three";
import { CHALLENGE_SCENERY } from "../core/ChallengeLayout";
import { WORLD_VIEW } from "../core/WorldView";

/** Six flame ribbons and one bounded, unshadowed light; no particles or frame allocations. */
export class Campfire {
    public readonly root = new Group();
    private readonly time = { value: 0 };
    private readonly geometry = new BufferGeometry();
    private readonly material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false,
        side: DoubleSide, blending: AdditiveBlending });
    private readonly light = new PointLight(0xff852c, 9000, WORLD_VIEW.unitScale * 5, 2);
    constructor() {
        const pit = CHALLENGE_SCENERY.props.find(prop => prop.model === "firepit")!;
        this.root.position.set(pit.x, .12, pit.z); this.root.name = "campfire";
        const positions: number[] = [], uv: number[] = [], phases: number[] = [], indices: number[] = [];
        for (let ribbon = 0; ribbon < 6; ribbon++) {
            const angle = ribbon * 2.4, height = .65 + .3 * Math.sin(ribbon * 2.1) ** 2;
            for (let row = 0; row <= 6; row++) for (const side of [-1, 1]) {
                const y = row / 6, width = .22 * side;
                positions.push(Math.cos(angle) * width + Math.sin(angle) * .19, y * height, Math.sin(angle) * width + Math.cos(angle) * .19);
                uv.push((side + 1) / 2, y); phases.push(ribbon * 1.7);
                if (row < 6 && side === -1) { const a = ribbon * 14 + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
            }
        }
        this.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        this.geometry.setAttribute("phase", new Float32BufferAttribute(phases, 1)); this.geometry.setIndex(indices);
        this.geometry.computeBoundingSphere(); this.geometry.boundingSphere!.radius += .15;
        this.material.onBeforeCompile = shader => {
            shader.uniforms.fireTime = this.time;
            shader.vertexShader = `uniform float fireTime; attribute float phase; varying vec2 vFireUv; varying float vFirePhase;\n${shader.vertexShader}`
                .replace("#include <begin_vertex>", `#include <begin_vertex>
                    vFireUv = uv; vFirePhase = phase;
                    transformed.x += .1 * uv.y * uv.y * sin(fireTime * 4.0 + phase + uv.y * 3.0);
                    transformed.y *= .85 + .15 * sin(fireTime * 3.0 + phase);`);
            shader.fragmentShader = `uniform float fireTime; varying vec2 vFireUv; varying float vFirePhase;\n${shader.fragmentShader}`
                .replace("#include <color_fragment>", `#include <color_fragment>
                    float x = abs(vFireUv.x - .5) * 2.0;
                    float edge = (1.0 - vFireUv.y) * (.8 + .16 * sin(vFireUv.y * 19.0 - fireTime * 7.0 + vFirePhase));
                    float flame = (1.0 - smoothstep(.55, 1.0, x / max(edge, .0001))) * (1.0 - smoothstep(.7, 1.0, vFireUv.y));
                    diffuseColor.rgb = mix(vec3(2.8, 1.0, .15), vec3(1.4, .12, .015), vFireUv.y);
                    diffuseColor.a = flame * .48;`);
        };
        this.material.customProgramCacheKey = () => "campfire-v1";
        const flame = new Mesh(this.geometry, this.material); flame.name = "campfire-flames";
        this.light.position.y = .8; this.root.add(flame, this.light);
    }
    public update(timestampMs: number): void {
        const t = timestampMs / 1000 % (20 * Math.PI); this.time.value = t;
        this.light.intensity = 9000 * (1 + .07 * Math.sin(t * 7) + .04 * Math.sin(t * 13));
    }
    public dispose(): void { this.root.removeFromParent(); this.geometry.dispose(); this.material.dispose(); this.light.dispose(); }
}

import { Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector2 } from "three";
import { HOMESTEAD } from "../core/Homestead";

const noise = `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;
const vertex = `varying vec2 ground;
    #include <fog_pars_vertex>
    void main() { ground = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }`;
/** Decorative sea and coastal haze outside the playable 64×64 map; unrelated to exploration. */
export class HomesteadSea {
    public readonly root = new Group();
    private readonly geometry = new PlaneGeometry(600, 600).rotateX(-Math.PI / 2);
    private readonly sea = new ShaderMaterial({ side: DoubleSide, fog: true,
        uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, deep: { value: new Color("#416e83") }, shallow: { value: new Color("#689aaa") } }]),
        vertexShader: vertex,
        fragmentShader: `uniform float time; uniform vec3 deep, shallow; varying vec2 ground; ${noise}
            #include <fog_pars_fragment>
            void main() { float waves = noise(ground * .14 + vec2(time * .025, time * .018));
                float foam = pow(.5 + .5 * sin(ground.x * 1.8 + ground.y * .8 + waves * 6. + time * .8), 16.);
                gl_FragColor = vec4(mix(deep, shallow, waves * .55) + foam * .025, 1.);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #include <fog_fragment>
            }`
    });
    private readonly haze = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: true,
        uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, halfSize: { value: new Vector2(HOMESTEAD.width * .75, HOMESTEAD.height * Math.sqrt(3) / 2) },
            tint: { value: new Color("#abc4cd") } }]),
        vertexShader: vertex,
        fragmentShader: `uniform float time; uniform vec2 halfSize; uniform vec3 tint; varying vec2 ground; ${noise}
            #include <fog_pars_fragment>
            void main() { vec2 edge = abs(ground) - halfSize; float coast = max(edge.x, edge.y);
                float billow = noise(ground * .12 + vec2(time * .022, -time * .018)) * .7 + noise(ground * .31 - time * .009) * .3;
                float alpha = smoothstep(-2., 14., coast) * (.25 + billow * .65);
                gl_FragColor = vec4(tint * (.9 + billow * .15), alpha);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #include <fog_fragment>
            }`
    });
    constructor() {
        this.root.name = "homestead-surrounding-sea";
        const sea = new Mesh(this.geometry, this.sea); sea.position.y = -.06;
        this.root.add(sea);
        for (const height of [.7, 2.2]) { const sheet = new Mesh(this.geometry, this.haze); sheet.position.y = height; sheet.renderOrder = 4; this.root.add(sheet); }
        this.root.position.set((HOMESTEAD.width - 1) * .75, 0, HOMESTEAD.height * Math.sqrt(3) / 2);
    }
    public update(seconds: number): void { this.sea.uniforms.time.value = this.haze.uniforms.time.value = seconds; }
    public dispose(): void { this.geometry.dispose(); this.sea.dispose(); this.haze.dispose(); }
}

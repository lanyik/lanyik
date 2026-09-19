import { Color, CylinderGeometry, DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial } from "three";
import { CHALLENGE_ARENA, CHALLENGES, type ChallengeId } from "../core/BossChallenge";

/** Two fixed meshes enclose the arena; no per-particle objects or exploration queries. */
export class ChallengeMist {
    public readonly root = new Group();
    private readonly floor = new RingGeometry(CHALLENGE_ARENA.radius - 2, 80, 96, 3).rotateX(-Math.PI / 2);
    private readonly wall = new CylinderGeometry(CHALLENGE_ARENA.radius + 2, CHALLENGE_ARENA.radius - 1, 16, 96, 1, true).translate(0, 8, 0);
    private readonly material = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: { time: { value: 0 }, tint: { value: new Color() } },
        vertexShader: `varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec3 p; uniform float time; uniform vec3 tint;
            float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
            float noise(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
            void main(){if(p.y>.1 && gl_FrontFacing) discard;
                float n=noise(p.xz*.22+vec2(time*.025,p.y*.23));
                float edge=smoothstep(22.,24.,length(p.xz));
                float height=1.-smoothstep(8.,16.,p.y);
                gl_FragColor=vec4(mix(vec3(.13,.19,.24),tint,n*.35),edge*height*(.88+n*.12));
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`
    });
    constructor() {
        this.root.name = "challenge-fixed-fog";
        this.root.add(new Mesh(this.floor, this.material), new Mesh(this.wall, this.material));
        this.root.renderOrder = 5; this.root.visible = false;
    }
    public update(id: ChallengeId, playerX: number, playerZ: number, time: number): void {
        this.root.position.set(CHALLENGE_ARENA.x - playerX, .08, CHALLENGE_ARENA.z - playerZ);
        this.material.uniforms.time.value = time; this.material.uniforms.tint.value.set(CHALLENGES[id].color);
    }
    public dispose(): void { this.floor.dispose(); this.wall.dispose(); this.material.dispose(); }
}

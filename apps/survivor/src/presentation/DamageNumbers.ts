import { BufferAttribute, CanvasTexture, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry,
    LinearFilter, Mesh, ShaderMaterial, Vector2 } from "three";
import { COMBAT_TEXT_CAPACITY, COMBAT_TEXT_SECONDS, CombatTextKind, type CombatTextBuffer } from "../core/CombatText";
import { GAME_CONFIG } from "../core/GameConfig";
import { actorVisibility } from "./ActorVisibility";

const CHARACTERS = "0123456789.-+kMe!闪避格挡护盾反";
const MAX_GLYPHS = 10, CAPACITY = COMBAT_TEXT_CAPACITY * MAX_GLYPHS;
const COLORS = ["#f2e4cc", "#ffd36a", "#ff6667", "#ff94bf", "#8cd9ee", "#bcc5cd", "#8cd9ee", "#c9a3ef"].map(value => new Color(value));
export function damageLabel(kind: CombatTextKind, value: number): string {
    if (kind === CombatTextKind.Shield) return "护盾";
    if (kind === CombatTextKind.Dodge) return "闪避";
    if (kind === CombatTextKind.Block) return "格挡";
    const number = value >= 1e9 ? value.toExponential(1).replace("e+", "e") : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
        : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : value >= 1 ? String(Math.round(value)) : value.toFixed(1);
    return (kind === CombatTextKind.Reflection ? "反" : kind === CombatTextKind.PlayerDamage || kind === CombatTextKind.PlayerCritical ? "-" : "")
        + number + (kind === CombatTextKind.EnemyCritical || kind === CombatTextKind.PlayerCritical ? "!" : "");
}

/** One atlas, one instanced draw; no DOM labels, per-hit textures, meshes or animation timers. */
export class DamageNumbers {
    public readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private readonly texture: CanvasTexture;
    private readonly anchor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(DynamicDrawUsage);
    private readonly glyph = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(DynamicDrawUsage);
    private readonly layout = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(DynamicDrawUsage);
    private readonly tint = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(DynamicDrawUsage);
    private readonly ids = new Float64Array(COMBAT_TEXT_CAPACITY);
    private readonly values = new Float64Array(COMBAT_TEXT_CAPACITY);
    private readonly labels = new Array<string>(COMBAT_TEXT_CAPACITY);
    private readonly viewport = new Vector2();
    public get buffers(): readonly ArrayBufferView[] { return [this.ids, this.values]; }
    constructor(canvas: HTMLCanvasElement) {
        canvas.width = 1024; canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Damage number atlas requires a 2D canvas");
        context.font = '700 44px Arial, "Microsoft YaHei", sans-serif'; context.textAlign = "center"; context.textBaseline = "middle";
        context.lineJoin = "round"; context.lineWidth = 5; context.strokeStyle = "#14171d"; context.fillStyle = "#ffffff";
        for (let i = 0; i < CHARACTERS.length; i++) {
            const x = i % 16 * 64 + 32, y = Math.floor(i / 16) * 64 + 32;
            context.strokeText(CHARACTERS[i], x, y); context.fillText(CHARACTERS[i], x, y);
        }
        this.texture = new CanvasTexture(canvas); this.texture.generateMipmaps = false;
        this.texture.minFilter = this.texture.magFilter = LinearFilter;
        const geometry = new InstancedBufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array([-.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0]), 3));
        geometry.setIndex([0,1,2, 2,3,0]); geometry.instanceCount = 0;
        geometry.setAttribute("anchor", this.anchor); geometry.setAttribute("glyph", this.glyph);
        geometry.setAttribute("glyphLayout", this.layout); geometry.setAttribute("tint", this.tint);
        const material = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
            uniforms: { atlas: { value: this.texture }, viewport: { value: this.viewport }, pixelRatio: { value: 1 } },
            vertexShader: `attribute vec3 anchor; attribute float glyph; attribute vec4 glyphLayout; attribute vec3 tint;
                uniform vec2 viewport; uniform float pixelRatio; varying vec2 vUv; varying vec4 vColor;
                void main() {
                    vec4 p = projectionMatrix * modelViewMatrix * vec4(anchor, 1.);
                    p.xy += (position.xy * glyphLayout.z + glyphLayout.xy) * pixelRatio * 2. / viewport * p.w;
                    if (p.w <= 0.) p = vec4(2.,2.,2.,1.);
                    gl_Position = p;
                    vUv = (vec2(mod(glyph,16.), 1.-floor(glyph/16.)) + position.xy + .5) / vec2(16.,2.);
                    vColor = vec4(tint, glyphLayout.w);
                }`,
            fragmentShader: `uniform sampler2D atlas; varying vec2 vUv; varying vec4 vColor;
                void main() { vec4 ink = texture2D(atlas, vUv); gl_FragColor = vec4(ink.rgb * vColor.rgb, ink.a * vColor.a);
                    #include <colorspace_fragment>
                }`
        });
        this.mesh = new Mesh(geometry, material); this.mesh.name = "batched-damage-numbers";
        this.mesh.frustumCulled = false; this.mesh.renderOrder = 20;
        this.mesh.onBeforeRender = renderer => { renderer.getDrawingBufferSize(this.viewport); material.uniforms.pixelRatio.value = renderer.getPixelRatio(); };
    }
    public update(facts: CombatTextBuffer, seconds: number, height: (x: number, z: number) => number, originX: number, originZ: number): void {
        let count = 0;
        for (let i = 0; i < facts.count; i++) {
            const age = seconds - facts.started[i] / GAME_CONFIG.timing.simulationHz;
            if (age < 0 || age >= COMBAT_TEXT_SECONDS) continue;
            const x = facts.x[i] - originX, z = facts.z[i] - originZ, visibility = actorVisibility(Math.hypot(x, z));
            if (!visibility) continue;
            if (this.ids[i] !== facts.id[i] || this.values[i] !== facts.value[i]) {
                this.ids[i] = facts.id[i]; this.values[i] = facts.value[i]; this.labels[i] = damageLabel(facts.kind[i], facts.value[i]);
            }
            const label = this.labels[i], critical = facts.kind[i] === CombatTextKind.EnemyCritical || facts.kind[i] === CombatTextKind.PlayerCritical;
            const size = (critical ? 40 : 32) * (1 + .18 * Math.max(0, 1 - age / .12));
            const alpha = visibility * Math.min(1, (COMBAT_TEXT_SECONDS - age) / .3);
            const y = height(facts.x[i], facts.z[i]) + 1.6 + age * 1.1;
            const shift = ((facts.id[i] * .61803398875) % 1 - .5) * 35 * age, color = COLORS[facts.kind[i]];
            if (label.length > MAX_GLYPHS) throw new Error("Damage label exceeds glyph budget");
            for (let j = 0; j < label.length; j++) {
                this.anchor.setXYZ(count, x, y, z); this.glyph.setX(count, CHARACTERS.indexOf(label[j]));
                this.layout.setXYZW(count, (j - (label.length - 1) / 2) * size * .58 + shift, 0, size, alpha);
                this.tint.setXYZ(count, color.r, color.g, color.b); count++;
            }
        }
        this.mesh.geometry.instanceCount = count; this.mesh.visible = count > 0;
        for (const attribute of [this.anchor, this.glyph, this.layout, this.tint]) {
            attribute.clearUpdateRanges(); if (count) { attribute.addUpdateRange(0, count * attribute.itemSize); attribute.needsUpdate = true; }
        }
    }
    public reset(): void { this.ids.fill(0); this.mesh.geometry.instanceCount = 0; this.mesh.visible = false; }
    public dispose(): void { this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

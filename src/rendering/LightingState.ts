import {
    ACESFilmicToneMapping,
    Color,
    SRGBColorSpace,
    Texture,
    Uniform,
    Vector3,
    WebGLRenderer
} from "three";

export interface LightingVector3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface LinearRgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

export interface LightingEnvironmentHandle {
    readonly identity: string;
    readonly texture: Texture | null;
}

export interface LightingState {
    readonly uniformRevision: number;
    readonly sunDirection: LightingVector3;
    readonly sunRadiance: LinearRgb;
    readonly skyDiffuseIrradiance: LinearRgb;
    readonly groundDiffuseIrradiance: LinearRgb;
    readonly specularEnvironment: LightingEnvironmentHandle;
    readonly environmentRevision: number;
    readonly exposure: number;
}

export interface LightingUniformBinding {
    readonly sunDirection: Uniform<Vector3>;
    readonly sunRadiance: Uniform<Color>;
    readonly skyDiffuseIrradiance: Uniform<Color>;
    readonly groundDiffuseIrradiance: Uniform<Color>;
    readonly released: boolean;
    release(): boolean;
}

export interface LightingRendererBinding {
    readonly renderer: WebGLRenderer;
    readonly released: boolean;
    release(): boolean;
}

export interface LightingStateControllerStats {
    readonly state: "ready" | "disposed";
    readonly uniformRevision: number;
    readonly environmentRevision: number;
    readonly uniformBindings: number;
    readonly rendererBindings: number;
}

interface MutableLightingUniformBinding {
    publicBinding: LightingUniformBinding;
    released: boolean;
}

interface MutableLightingRendererBinding {
    publicBinding: LightingRendererBinding;
    released: boolean;
}

const LIGHTING_STATE_FIELDS = new Set([
    "uniformRevision",
    "sunDirection",
    "sunRadiance",
    "skyDiffuseIrradiance",
    "groundDiffuseIrradiance",
    "specularEnvironment",
    "environmentRevision",
    "exposure"
]);

function assertExactFields(value: object, allowed: ReadonlySet<string>, name: string): void {
    if (Object.getOwnPropertyNames(value).some(field => !allowed.has(field))) {
        throw new TypeError(`${name} contains unknown fields`);
    }
}

function cloneVector(value: LightingVector3, name: string, normalize = false): LightingVector3 {
    if (!value || typeof value !== "object") throw new TypeError(`${name} is invalid`);
    assertExactFields(value, new Set(["x", "y", "z"]), name);
    if (![value.x, value.y, value.z].every(Number.isFinite)) throw new RangeError(`${name} must be finite`);
    const length = Math.hypot(value.x, value.y, value.z);
    if (normalize && !(length > 0)) throw new RangeError(`${name} must be non-zero`);
    const scale = normalize ? 1 / length : 1;
    return Object.freeze({ x: value.x * scale, y: value.y * scale, z: value.z * scale });
}

function cloneLinearRgb(value: LinearRgb, name: string): LinearRgb {
    if (!value || typeof value !== "object") throw new TypeError(`${name} is invalid`);
    assertExactFields(value, new Set(["r", "g", "b"]), name);
    if (![value.r, value.g, value.b].every(channel => Number.isFinite(channel) && channel >= 0)) {
        throw new RangeError(`${name} channels must be finite and non-negative`);
    }
    return Object.freeze({ r: value.r, g: value.g, b: value.b });
}

function cloneEnvironment(value: LightingEnvironmentHandle): LightingEnvironmentHandle {
    if (!value || typeof value !== "object") throw new TypeError("lighting environment handle is invalid");
    assertExactFields(value, new Set(["identity", "texture"]), "lighting environment handle");
    if (typeof value.identity !== "string" || value.identity.length === 0
        || value.texture !== null && !(value.texture instanceof Texture)) {
        throw new TypeError("lighting environment handle is invalid");
    }
    return Object.freeze({ identity: value.identity, texture: value.texture });
}

export function createLightingState(value: LightingState): LightingState {
    if (!value || typeof value !== "object") throw new TypeError("lighting state is invalid");
    assertExactFields(value, LIGHTING_STATE_FIELDS, "lighting state");
    if (!Number.isSafeInteger(value.uniformRevision) || value.uniformRevision < 0
        || !Number.isSafeInteger(value.environmentRevision) || value.environmentRevision < 0) {
        throw new RangeError("lighting revisions must be non-negative safe integers");
    }
    if (!Number.isFinite(value.exposure) || value.exposure <= 0) {
        throw new RangeError("lighting exposure must be finite and positive");
    }
    return Object.freeze({
        uniformRevision: value.uniformRevision,
        sunDirection: cloneVector(value.sunDirection, "lighting sunDirection", true),
        sunRadiance: cloneLinearRgb(value.sunRadiance, "lighting sunRadiance"),
        skyDiffuseIrradiance: cloneLinearRgb(
            value.skyDiffuseIrradiance,
            "lighting skyDiffuseIrradiance"
        ),
        groundDiffuseIrradiance: cloneLinearRgb(
            value.groundDiffuseIrradiance,
            "lighting groundDiffuseIrradiance"
        ),
        specularEnvironment: cloneEnvironment(value.specularEnvironment),
        environmentRevision: value.environmentRevision,
        exposure: value.exposure
    });
}

export const DEFAULT_LIGHTING_STATE = createLightingState({
    uniformRevision: 0,
    sunDirection: { x: 0.45, y: 0.8, z: 0.4 },
    sunRadiance: { r: 1.9, g: 1.75, b: 1.5 },
    skyDiffuseIrradiance: { r: 0.32, g: 0.42, b: 0.55 },
    groundDiffuseIrradiance: { r: 0.08, g: 0.07, b: 0.055 },
    specularEnvironment: { identity: "analytic-sky-v1", texture: null },
    environmentRevision: 0,
    exposure: 0.65
});

function copyColor(target: Color, source: LinearRgb): void {
    target.setRGB(source.r, source.g, source.b);
}

export class LightingStateController {
    private current: LightingState;
    private readonly uniformBindings = new Set<MutableLightingUniformBinding>();
    private readonly rendererBindings = new Set<MutableLightingRendererBinding>();
    private disposed = false;

    constructor(initial: LightingState = DEFAULT_LIGHTING_STATE) {
        this.current = createLightingState(initial);
    }

    public get state(): LightingState { return this.current; }

    public publish(nextValue: LightingState, expectedUniformRevision: number): LightingState {
        this.assertReady();
        if (!Number.isSafeInteger(expectedUniformRevision) || expectedUniformRevision < 0) {
            throw new RangeError("expected lighting revision must be a non-negative safe integer");
        }
        if (this.current.uniformRevision !== expectedUniformRevision) {
            throw new RangeError("lighting state compare-and-swap revision conflict");
        }
        const next = createLightingState(nextValue);
        if (next.uniformRevision !== expectedUniformRevision + 1) {
            throw new RangeError("lighting uniformRevision must increase by exactly one");
        }
        if (next.environmentRevision < this.current.environmentRevision) {
            throw new RangeError("lighting environmentRevision cannot decrease");
        }
        if (next.environmentRevision === this.current.environmentRevision
            && (next.specularEnvironment.identity !== this.current.specularEnvironment.identity
                || next.specularEnvironment.texture !== this.current.specularEnvironment.texture)) {
            throw new TypeError("lighting environment changes require a new environmentRevision");
        }
        this.current = next;
        for (const binding of this.uniformBindings) this.updateUniformBinding(binding.publicBinding, next);
        for (const binding of this.rendererBindings) this.updateRenderer(binding.publicBinding.renderer, next);
        return next;
    }

    public bindUniforms(): LightingUniformBinding {
        this.assertReady();
        const sunDirection = new Uniform(new Vector3());
        const sunRadiance = new Uniform(new Color());
        const skyDiffuseIrradiance = new Uniform(new Color());
        const groundDiffuseIrradiance = new Uniform(new Color());
        const mutable = {} as MutableLightingUniformBinding;
        const publicBinding: LightingUniformBinding = {
            sunDirection,
            sunRadiance,
            skyDiffuseIrradiance,
            groundDiffuseIrradiance,
            get released() { return mutable.released; },
            release: () => {
                if (mutable.released) return false;
                mutable.released = true;
                this.uniformBindings.delete(mutable);
                return true;
            }
        };
        mutable.publicBinding = Object.freeze(publicBinding);
        mutable.released = false;
        this.updateUniformBinding(mutable.publicBinding, this.current);
        this.uniformBindings.add(mutable);
        return mutable.publicBinding;
    }

    public bindRenderer(renderer: WebGLRenderer): LightingRendererBinding {
        this.assertReady();
        if (!renderer || typeof renderer !== "object") throw new TypeError("lighting renderer is invalid");
        const mutable = {} as MutableLightingRendererBinding;
        const publicBinding: LightingRendererBinding = {
            renderer,
            get released() { return mutable.released; },
            release: () => {
                if (mutable.released) return false;
                mutable.released = true;
                this.rendererBindings.delete(mutable);
                return true;
            }
        };
        mutable.publicBinding = Object.freeze(publicBinding);
        mutable.released = false;
        this.updateRenderer(renderer, this.current);
        this.rendererBindings.add(mutable);
        return mutable.publicBinding;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const binding of this.uniformBindings) binding.released = true;
        for (const binding of this.rendererBindings) binding.released = true;
        this.uniformBindings.clear();
        this.rendererBindings.clear();
    }

    public get stats(): Readonly<LightingStateControllerStats> {
        return Object.freeze({
            state: this.disposed ? "disposed" : "ready",
            uniformRevision: this.current.uniformRevision,
            environmentRevision: this.current.environmentRevision,
            uniformBindings: this.uniformBindings.size,
            rendererBindings: this.rendererBindings.size
        });
    }

    private updateUniformBinding(binding: LightingUniformBinding, state: LightingState): void {
        binding.sunDirection.value.set(
            state.sunDirection.x,
            state.sunDirection.y,
            state.sunDirection.z
        );
        copyColor(binding.sunRadiance.value, state.sunRadiance);
        copyColor(binding.skyDiffuseIrradiance.value, state.skyDiffuseIrradiance);
        copyColor(binding.groundDiffuseIrradiance.value, state.groundDiffuseIrradiance);
    }

    private updateRenderer(renderer: WebGLRenderer, state: LightingState): void {
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = state.exposure;
        renderer.outputColorSpace = SRGBColorSpace;
    }

    private assertReady(): void {
        if (this.disposed) throw new TypeError("lighting state controller is disposed");
    }
}

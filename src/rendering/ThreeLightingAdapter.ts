import {
    Color,
    DirectionalLight,
    HemisphereLight,
    Object3D,
    Scene,
    Texture,
    Vector3
} from "three";

import {
    LightingState,
    assertLightingState,
    createLightingState,
    lightingStatesEqual
} from "./LightingState";

export interface LightingUniformSet {
    readonly sunDirection: { value: Vector3 };
    readonly sunRadiance: { value: Color };
    readonly skyDiffuseIrradiance: { value: Color };
    readonly groundDiffuseIrradiance: { value: Color };
    readonly specularEnvironment: { value: Texture };
    readonly exposure: { value: number };
}

export interface ThreeLightingRendererTarget {
    toneMappingExposure: number;
}

function copyStateToUniforms(
    state: Readonly<LightingState>,
    uniforms: LightingUniformSet
): void {
    uniforms.sunDirection.value.set(
        state.sunDirection.x,
        state.sunDirection.y,
        state.sunDirection.z
    );
    uniforms.sunRadiance.value.setRGB(
        state.sunRadiance.r,
        state.sunRadiance.g,
        state.sunRadiance.b
    );
    uniforms.skyDiffuseIrradiance.value.setRGB(
        state.skyDiffuseIrradiance.r,
        state.skyDiffuseIrradiance.g,
        state.skyDiffuseIrradiance.b
    );
    uniforms.groundDiffuseIrradiance.value.setRGB(
        state.groundDiffuseIrradiance.r,
        state.groundDiffuseIrradiance.g,
        state.groundDiffuseIrradiance.b
    );
    uniforms.specularEnvironment.value = state.specularEnvironment.texture;
    uniforms.exposure.value = state.exposure;
}

function createUniformSet(state: Readonly<LightingState>): LightingUniformSet {
    const uniforms: LightingUniformSet = Object.freeze({
        sunDirection: { value: new Vector3() },
        sunRadiance: { value: new Color() },
        skyDiffuseIrradiance: { value: new Color() },
        groundDiffuseIrradiance: { value: new Color() },
        specularEnvironment: { value: state.specularEnvironment.texture },
        exposure: { value: state.exposure }
    });
    copyStateToUniforms(state, uniforms);
    return uniforms;
}

export class ThreeLightingAdapter {
    public readonly sunLight = new DirectionalLight(0xffffff, 1);
    public readonly diffuseLight = new HemisphereLight(0xffffff, 0x000000, 1);
    private readonly sunTarget = new Object3D();
    private readonly uniforms = new Set<LightingUniformSet>();
    private currentState: LightingState | undefined;
    private disposed = false;

    constructor(
        private readonly renderer: ThreeLightingRendererTarget,
        private readonly scene: Scene
    ) {
        this.sunLight.name = "surface-sun-light";
        this.diffuseLight.name = "surface-diffuse-light";
        this.sunTarget.name = "surface-sun-target";
        this.sunLight.target = this.sunTarget;
        this.scene.add(this.sunLight, this.diffuseLight, this.sunTarget);
    }

    public get state(): Readonly<LightingState> | undefined { return this.currentState; }

    public apply(state: Readonly<LightingState>): boolean {
        if (this.disposed) throw new Error("three lighting adapter is disposed");
        assertLightingState(state);
        const snapshot = createLightingState(state);
        const current = this.currentState;
        if (current) {
            if (snapshot.uniformRevision < current.uniformRevision
                || snapshot.environmentRevision < current.environmentRevision) {
                throw new Error("three lighting adapter rejected a stale lighting revision");
            }
            if (snapshot.uniformRevision === current.uniformRevision
                && snapshot.environmentRevision === current.environmentRevision) {
                if (!lightingStatesEqual(snapshot, current)) {
                    throw new Error("equal lighting revisions cannot describe different state");
                }
                return false;
            }
        }
        this.sunLight.position.set(
            snapshot.sunDirection.x,
            snapshot.sunDirection.y,
            snapshot.sunDirection.z
        );
        this.sunLight.color.setRGB(
            snapshot.sunRadiance.r,
            snapshot.sunRadiance.g,
            snapshot.sunRadiance.b
        );
        this.diffuseLight.color.setRGB(
            snapshot.skyDiffuseIrradiance.r,
            snapshot.skyDiffuseIrradiance.g,
            snapshot.skyDiffuseIrradiance.b
        );
        this.diffuseLight.groundColor.setRGB(
            snapshot.groundDiffuseIrradiance.r,
            snapshot.groundDiffuseIrradiance.g,
            snapshot.groundDiffuseIrradiance.b
        );
        this.scene.environment = snapshot.specularEnvironment.texture;
        this.renderer.toneMappingExposure = snapshot.exposure;
        for (const uniforms of this.uniforms) copyStateToUniforms(snapshot, uniforms);
        this.currentState = snapshot;
        return true;
    }

    public createUniforms(): LightingUniformSet {
        if (this.disposed) throw new Error("three lighting adapter is disposed");
        if (!this.currentState) {
            throw new Error("three lighting adapter requires state before creating shader uniforms");
        }
        const uniforms = createUniformSet(this.currentState);
        this.uniforms.add(uniforms);
        return uniforms;
    }

    public releaseUniforms(uniforms: LightingUniformSet): void {
        if (!this.uniforms.delete(uniforms)) {
            throw new Error("lighting uniform set is not owned by this adapter");
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.uniforms.clear();
        this.scene.remove(this.sunLight, this.diffuseLight, this.sunTarget);
        if (this.currentState
            && this.scene.environment === this.currentState.specularEnvironment.texture) {
            this.scene.environment = null;
        }
        this.currentState = undefined;
    }
}

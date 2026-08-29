import { CubeUVReflectionMapping, Texture } from "three";

export interface ReadonlyLinearRgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

export interface ReadonlyDirection3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface EnvironmentHandle {
    /** Revision of the prepared PMREM resource, not the source image revision. */
    readonly revision: number;
    readonly texture: Texture;
}

export interface LightingState {
    readonly uniformRevision: number;
    /** Unit vector from a shaded point toward the sun, in world coordinates. */
    readonly sunDirection: ReadonlyDirection3;
    readonly sunRadiance: ReadonlyLinearRgb;
    readonly skyDiffuseIrradiance: ReadonlyLinearRgb;
    readonly groundDiffuseIrradiance: ReadonlyLinearRgb;
    readonly specularEnvironment: EnvironmentHandle;
    readonly environmentRevision: number;
    readonly exposure: number;
}

export interface LightingStateInput extends Omit<LightingState,
    "sunDirection" | "sunRadiance" | "skyDiffuseIrradiance"
    | "groundDiffuseIrradiance" | "specularEnvironment"> {
    readonly sunDirection: ReadonlyDirection3;
    readonly sunRadiance: ReadonlyLinearRgb;
    readonly skyDiffuseIrradiance: ReadonlyLinearRgb;
    readonly groundDiffuseIrradiance: ReadonlyLinearRgb;
    readonly specularEnvironment: EnvironmentHandle;
}

function assertRevision(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
    }
}

function assertLinearRgb(name: string, color: ReadonlyLinearRgb): void {
    if (!color || typeof color !== "object"
        || !Number.isFinite(color.r) || color.r < 0
        || !Number.isFinite(color.g) || color.g < 0
        || !Number.isFinite(color.b) || color.b < 0) {
        throw new RangeError(`${name} must contain non-negative finite linear RGB values`);
    }
}

function assertUnitDirection(direction: ReadonlyDirection3): void {
    if (!direction || typeof direction !== "object"
        || !Number.isFinite(direction.x)
        || !Number.isFinite(direction.y)
        || !Number.isFinite(direction.z)) {
        throw new RangeError("lighting sun direction must be finite");
    }
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (Math.abs(length - 1) > 1e-12) {
        throw new RangeError("lighting sun direction must be normalized");
    }
}

export function assertEnvironmentHandle(handle: Readonly<EnvironmentHandle>): void {
    if (!handle || typeof handle !== "object") {
        throw new TypeError("lighting environment handle is required");
    }
    assertRevision("lighting environment handle revision", handle.revision);
    if (!(handle.texture instanceof Texture) || handle.texture.isTexture !== true
        || handle.texture.mapping !== CubeUVReflectionMapping) {
        throw new TypeError("lighting environment handle must contain a prepared PMREM texture");
    }
}

export function createEnvironmentHandle(
    revision: number,
    texture: Texture
): EnvironmentHandle {
    const handle = Object.freeze({ revision, texture });
    assertEnvironmentHandle(handle);
    return handle;
}

export function assertLightingState(state: Readonly<LightingState>): void {
    if (!state || typeof state !== "object") throw new TypeError("lighting state is required");
    assertRevision("lighting uniform revision", state.uniformRevision);
    assertRevision("lighting environment revision", state.environmentRevision);
    assertUnitDirection(state.sunDirection);
    assertLinearRgb("lighting sun radiance", state.sunRadiance);
    assertLinearRgb("lighting sky diffuse irradiance", state.skyDiffuseIrradiance);
    assertLinearRgb("lighting ground diffuse irradiance", state.groundDiffuseIrradiance);
    assertEnvironmentHandle(state.specularEnvironment);
    if (state.specularEnvironment.revision !== state.environmentRevision) {
        throw new Error("lighting environment handle and state revisions must match");
    }
    if (!Number.isFinite(state.exposure) || state.exposure <= 0) {
        throw new RangeError("lighting exposure must be positive and finite");
    }
}

function frozenColor(color: ReadonlyLinearRgb): ReadonlyLinearRgb {
    return Object.freeze({ r: color.r, g: color.g, b: color.b });
}

export function createLightingState(input: Readonly<LightingStateInput>): LightingState {
    if (!input || typeof input !== "object") throw new TypeError("lighting state input is required");
    const directionLength = Math.hypot(
        input.sunDirection.x,
        input.sunDirection.y,
        input.sunDirection.z
    );
    if (!Number.isFinite(directionLength) || directionLength <= 0) {
        throw new RangeError("lighting sun direction must be finite and non-zero");
    }
    const state: LightingState = Object.freeze({
        uniformRevision: input.uniformRevision,
        sunDirection: Object.freeze({
            x: input.sunDirection.x / directionLength,
            y: input.sunDirection.y / directionLength,
            z: input.sunDirection.z / directionLength
        }),
        sunRadiance: frozenColor(input.sunRadiance),
        skyDiffuseIrradiance: frozenColor(input.skyDiffuseIrradiance),
        groundDiffuseIrradiance: frozenColor(input.groundDiffuseIrradiance),
        specularEnvironment: input.specularEnvironment,
        environmentRevision: input.environmentRevision,
        exposure: input.exposure
    });
    assertLightingState(state);
    return state;
}

export function lightingStatesEqual(
    first: Readonly<LightingState>,
    second: Readonly<LightingState>
): boolean {
    return first.uniformRevision === second.uniformRevision
        && first.environmentRevision === second.environmentRevision
        && first.sunDirection.x === second.sunDirection.x
        && first.sunDirection.y === second.sunDirection.y
        && first.sunDirection.z === second.sunDirection.z
        && first.sunRadiance.r === second.sunRadiance.r
        && first.sunRadiance.g === second.sunRadiance.g
        && first.sunRadiance.b === second.sunRadiance.b
        && first.skyDiffuseIrradiance.r === second.skyDiffuseIrradiance.r
        && first.skyDiffuseIrradiance.g === second.skyDiffuseIrradiance.g
        && first.skyDiffuseIrradiance.b === second.skyDiffuseIrradiance.b
        && first.groundDiffuseIrradiance.r === second.groundDiffuseIrradiance.r
        && first.groundDiffuseIrradiance.g === second.groundDiffuseIrradiance.g
        && first.groundDiffuseIrradiance.b === second.groundDiffuseIrradiance.b
        && first.specularEnvironment.texture === second.specularEnvironment.texture
        && first.exposure === second.exposure;
}

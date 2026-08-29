import {
    CubeTexture,
    CubeUVReflectionMapping,
    PMREMGenerator,
    Scene,
    Texture,
    WebGLRenderTarget,
    WebGLRenderer
} from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

import {
    EnvironmentHandle,
    ReadonlyDirection3,
    createEnvironmentHandle
} from "./LightingState";

export interface AnalyticSkyEnvironmentSource {
    readonly kind: "analytic-sky";
    readonly turbidity: number;
    readonly rayleigh: number;
    readonly mieCoefficient: number;
    readonly mieDirectionalG: number;
    readonly sunDirection: ReadonlyDirection3;
}

export interface EquirectangularEnvironmentSource {
    readonly kind: "equirectangular";
    readonly texture: Texture;
}

export interface CubeEnvironmentSource {
    readonly kind: "cube";
    readonly texture: CubeTexture;
}

export type LightingEnvironmentSource = AnalyticSkyEnvironmentSource
    | EquirectangularEnvironmentSource
    | CubeEnvironmentSource;

export interface CompiledLightingEnvironment {
    readonly texture: Texture;
    dispose(): void;
}

export interface LightingEnvironmentCompiler {
    compile(source: Readonly<LightingEnvironmentSource>): CompiledLightingEnvironment;
    dispose(): void;
}

export type LightingEnvironmentTaskScheduler = (task: () => void) => void;
export type LightingEnvironmentActivator = (handle: EnvironmentHandle) => void;

export interface LightingEnvironmentManagerStats {
    readonly currentRevision: number | undefined;
    readonly pendingRevision: number | undefined;
    readonly builds: number;
    readonly swaps: number;
    readonly superseded: number;
    readonly failures: number;
}

interface ResidentEnvironment {
    readonly handle: EnvironmentHandle;
    readonly compiled: CompiledLightingEnvironment;
}

interface PendingEnvironment {
    readonly generation: number;
    readonly revision: number;
    settled: boolean;
    reject(reason: unknown): void;
}

function assertRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new RangeError("lighting environment revision must be a non-negative safe integer");
    }
}

function assertSource(source: Readonly<LightingEnvironmentSource>): void {
    if (!source || typeof source !== "object") {
        throw new TypeError("lighting environment source is required");
    }
    if (source.kind === "analytic-sky") {
        const directionLength = Math.hypot(
            source.sunDirection.x,
            source.sunDirection.y,
            source.sunDirection.z
        );
        if (!Number.isFinite(source.turbidity) || source.turbidity < 0 || source.turbidity > 20
            || !Number.isFinite(source.rayleigh) || source.rayleigh < 0 || source.rayleigh > 4
            || !Number.isFinite(source.mieCoefficient)
                || source.mieCoefficient < 0 || source.mieCoefficient > 0.1
            || !Number.isFinite(source.mieDirectionalG)
                || source.mieDirectionalG < 0 || source.mieDirectionalG >= 1
            || !Number.isFinite(directionLength) || directionLength <= 0) {
            throw new RangeError("analytic lighting environment parameters are invalid");
        }
        return;
    }
    if (source.kind === "equirectangular") {
        if (!(source.texture instanceof Texture) || source.texture.isTexture !== true) {
            throw new TypeError("equirectangular lighting environment requires a texture");
        }
        return;
    }
    if (source.kind === "cube") {
        if (!(source.texture instanceof CubeTexture) || source.texture.isCubeTexture !== true) {
            throw new TypeError("cube lighting environment requires a cube texture");
        }
        return;
    }
    throw new TypeError("lighting environment source kind is unsupported");
}

function snapshotSource(
    source: Readonly<LightingEnvironmentSource>
): Readonly<LightingEnvironmentSource> {
    assertSource(source);
    if (source.kind === "analytic-sky") {
        return Object.freeze({
            kind: source.kind,
            turbidity: source.turbidity,
            rayleigh: source.rayleigh,
            mieCoefficient: source.mieCoefficient,
            mieDirectionalG: source.mieDirectionalG,
            sunDirection: Object.freeze({
                x: source.sunDirection.x,
                y: source.sunDirection.y,
                z: source.sunDirection.z
            })
        });
    }
    if (source.kind === "equirectangular") {
        return Object.freeze({ kind: source.kind, texture: source.texture });
    }
    return Object.freeze({ kind: source.kind, texture: source.texture });
}

function assertCompiledEnvironment(compiled: Readonly<CompiledLightingEnvironment>): void {
    if (!compiled || typeof compiled !== "object"
        || !(compiled.texture instanceof Texture)
        || compiled.texture.mapping !== CubeUVReflectionMapping
        || typeof compiled.dispose !== "function") {
        throw new TypeError("lighting environment compiler did not return a prepared PMREM resource");
    }
}

export class ThreePmremEnvironmentCompiler implements LightingEnvironmentCompiler {
    private readonly generator: PMREMGenerator;
    private disposed = false;

    constructor(renderer: WebGLRenderer) {
        this.generator = new PMREMGenerator(renderer);
    }

    public compile(source: Readonly<LightingEnvironmentSource>): CompiledLightingEnvironment {
        if (this.disposed) throw new Error("PMREM environment compiler is disposed");
        assertSource(source);
        let target: WebGLRenderTarget;
        if (source.kind === "equirectangular") {
            target = this.generator.fromEquirectangular(source.texture);
        } else if (source.kind === "cube") {
            target = this.generator.fromCubemap(source.texture);
        } else {
            const scene = new Scene();
            const sky = new Sky();
            sky.scale.setScalar(50);
            const uniforms = sky.material.uniforms;
            uniforms.turbidity.value = source.turbidity;
            uniforms.rayleigh.value = source.rayleigh;
            uniforms.mieCoefficient.value = source.mieCoefficient;
            uniforms.mieDirectionalG.value = source.mieDirectionalG;
            const length = Math.hypot(
                source.sunDirection.x,
                source.sunDirection.y,
                source.sunDirection.z
            );
            uniforms.sunPosition.value.set(
                source.sunDirection.x / length,
                source.sunDirection.y / length,
                source.sunDirection.z / length
            );
            scene.add(sky);
            try {
                target = this.generator.fromScene(scene, 0, 0.1, 100);
            } finally {
                sky.geometry.dispose();
                sky.material.dispose();
                scene.remove(sky);
            }
        }
        target.texture.mapping = CubeUVReflectionMapping;
        let released = false;
        const compiled: CompiledLightingEnvironment = Object.freeze({
            texture: target.texture,
            dispose(): void {
                if (released) return;
                released = true;
                target.dispose();
            }
        });
        assertCompiledEnvironment(compiled);
        return compiled;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.generator.dispose();
    }
}

export class LightingEnvironmentSupersededError extends Error {
    public readonly name = "LightingEnvironmentSupersededError";

    constructor(revision: number) {
        super(`lighting environment revision ${revision} was superseded before compilation`);
    }
}

export class LightingEnvironmentManager {
    private resident: ResidentEnvironment | undefined;
    private pending: PendingEnvironment | undefined;
    private generation = 0;
    private buildCount = 0;
    private swapCount = 0;
    private supersededCount = 0;
    private failureCount = 0;
    private activating = false;
    private disposed = false;

    constructor(
        private readonly compiler: LightingEnvironmentCompiler,
        private readonly schedule: LightingEnvironmentTaskScheduler
    ) {
        if (!compiler || typeof compiler.compile !== "function" || typeof compiler.dispose !== "function") {
            throw new TypeError("lighting environment compiler is invalid");
        }
        if (typeof schedule !== "function") {
            throw new TypeError("lighting environment task scheduler is required");
        }
    }

    public get current(): EnvironmentHandle | undefined { return this.resident?.handle; }
    public get stats(): Readonly<LightingEnvironmentManagerStats> {
        return {
            currentRevision: this.resident?.handle.revision,
            pendingRevision: this.pending?.revision,
            builds: this.buildCount,
            swaps: this.swapCount,
            superseded: this.supersededCount,
            failures: this.failureCount
        };
    }

    public rebuild(
        source: Readonly<LightingEnvironmentSource>,
        revision: number,
        activate: LightingEnvironmentActivator
    ): Promise<EnvironmentHandle> {
        if (this.disposed) return Promise.reject(new Error("lighting environment manager is disposed"));
        if (this.activating) {
            return Promise.reject(new Error("lighting environment rebuild cannot be requested during activation"));
        }
        try {
            assertRevision(revision);
        } catch (reason) {
            return Promise.reject(reason);
        }
        let sourceSnapshot: Readonly<LightingEnvironmentSource>;
        try {
            sourceSnapshot = snapshotSource(source);
        } catch (reason) {
            return Promise.reject(reason);
        }
        if (typeof activate !== "function") {
            return Promise.reject(new TypeError("lighting environment activator is required"));
        }
        const residentRevision = this.resident?.handle.revision;
        if (residentRevision !== undefined && revision <= residentRevision) {
            return Promise.reject(new Error("lighting environment revisions must increase strictly"));
        }
        if (this.pending && revision <= this.pending.revision) {
            return Promise.reject(new Error("lighting environment revisions must increase strictly"));
        }
        const generation = ++this.generation;
        const previousPending = this.pending;
        if (previousPending && !previousPending.settled) {
            previousPending.settled = true;
            this.supersededCount += 1;
            previousPending.reject(new LightingEnvironmentSupersededError(previousPending.revision));
        }
        return new Promise<EnvironmentHandle>((resolve, reject) => {
            const pending: PendingEnvironment = {
                generation,
                revision,
                settled: false,
                reject
            };
            this.pending = pending;
            const run = (): void => {
                if (pending.settled) return;
                if (this.disposed || this.pending !== pending || this.generation !== generation) {
                    pending.settled = true;
                    this.supersededCount += 1;
                    reject(new LightingEnvironmentSupersededError(revision));
                    return;
                }
                let compiled: CompiledLightingEnvironment | undefined;
                try {
                    compiled = this.compiler.compile(sourceSnapshot);
                    this.buildCount += 1;
                    assertCompiledEnvironment(compiled);
                } catch (reason) {
                    if (typeof compiled?.dispose === "function") {
                        compiled.dispose();
                    }
                    pending.settled = true;
                    this.pending = undefined;
                    this.failureCount += 1;
                    reject(reason);
                    return;
                }
                if (!compiled) {
                    pending.settled = true;
                    this.pending = undefined;
                    this.failureCount += 1;
                    reject(new Error("lighting environment compiler returned no resource"));
                    return;
                }
                let handle: EnvironmentHandle;
                try {
                    handle = createEnvironmentHandle(revision, compiled.texture);
                    this.activating = true;
                    const result = activate(handle) as unknown;
                    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
                        throw new TypeError("lighting environment activator must be synchronous");
                    }
                } catch (reason) {
                    compiled.dispose();
                    pending.settled = true;
                    this.pending = undefined;
                    this.failureCount += 1;
                    reject(reason);
                    return;
                } finally {
                    this.activating = false;
                }
                const previous = this.resident;
                this.resident = Object.freeze({ handle, compiled });
                this.pending = undefined;
                pending.settled = true;
                this.swapCount += 1;
                previous?.compiled.dispose();
                resolve(handle);
            };
            try {
                this.schedule(run);
            } catch (reason) {
                pending.settled = true;
                this.pending = undefined;
                this.failureCount += 1;
                reject(reason);
            }
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.generation += 1;
        if (this.pending && !this.pending.settled) {
            this.pending.settled = true;
            this.pending.reject(new Error("lighting environment manager was disposed"));
        }
        this.pending = undefined;
        this.resident?.compiled.dispose();
        this.resident = undefined;
        this.compiler.dispose();
    }
}

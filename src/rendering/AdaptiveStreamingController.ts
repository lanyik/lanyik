import { WorldChunkLod, WorldChunkLodDistances } from "../helpers/chunks";

export interface AdaptiveStreamingControllerOptions {
    enabled?: boolean;
    targetFrameMs?: number;
    baseFrameBudgetMs: number;
    baseMaxTasksPerFrame: number;
    baseWorkerCount: number;
    minimumWorkerCount?: number;
    baseLodDistances: WorldChunkLodDistances;
    degradeFrames?: number;
    recoverFrames?: number;
    cooldownFrames?: number;
    emaAlpha?: number;
}

export interface AdaptiveStreamingProfile {
    qualityLevel: number;
    mainThreadLevel: number;
    gpuLevel: number;
    workerLevel: number;
    frameBudgetMs: number;
    maxTasksPerFrame: number;
    workerCount: number;
    resolutionScale: number;
    vegetationDensityScale: number;
    lodDistanceScale: number;
    lodBias: WorldChunkLod;
    vegetationLodBias: WorldChunkLod;
    lodDistances: WorldChunkLodDistances;
}

export interface AdaptiveStreamingSample {
    frameMs: number;
    cpuFrameMs?: number;
    gpuFrameMs?: number;
    gpuTimingSupported?: boolean;
    gpuTimingSaturated?: boolean;
    gpuSampleAgeMs?: number;
    frameTaskMs?: number;
    frameTaskBacklog?: number;
    oldestFrameTaskMs?: number;
    workerQueueDepth?: number;
    workerBusyRatio?: number;
    workerContentionMs?: number;
    chunkLoadLatencyMs?: number;
    chunkVisibleLatencyMs?: number;
    uploadBytes?: number;
    drawCalls?: number;
    longTaskMs?: number;
    cpuBudgetExceededBytes?: number;
    gpuBudgetExceededBytes?: number;
}

export interface AdaptiveStreamingStats extends AdaptiveStreamingProfile {
    enabled: boolean;
    targetFrameMs: number;
    averageFrameMs: number;
    overloadFrames: number;
    recoveryFrames: number;
    transitions: number;
    averageCpuFrameMs: number;
    averageGpuFrameMs: number;
    averageWorkerContentionMs: number;
    frameTaskBacklog: number;
    oldestFrameTaskMs: number;
    workerQueueDepth: number;
    workerBusyRatio: number;
    chunkLoadLatencyMs: number;
    chunkVisibleLatencyMs: number;
    uploadBytes: number;
    drawCalls: number;
    gpuTimingSupported: boolean;
    gpuTimingSaturated: boolean;
    gpuSampleAgeMs: number | undefined;
    cpuBudgetExceededBytes: number;
    gpuBudgetExceededBytes: number;
}

const QUALITY = [
    { mount: 1, tasks: 1, workers: 1, resolution: 1, vegetation: 1, lod: 1, lodBias: 0, vegetationBias: 0 },
    { mount: 0.75, tasks: 0.75, workers: 0.75, resolution: 0.85, vegetation: 0.85, lod: 0.9, lodBias: 0, vegetationBias: 0 },
    { mount: 0.5, tasks: 0.5, workers: 0.5, resolution: 0.65, vegetation: 0.55, lod: 0.75, lodBias: 0, vegetationBias: 1 },
    { mount: 0.3, tasks: 0.35, workers: 0.35, resolution: 0.25, vegetation: 0.25, lod: 0.55, lodBias: 1, vegetationBias: 1 }
] as const;

interface PressureState {
    level: number;
    average: number;
    overloadFrames: number;
    recoveryFrames: number;
    cooldown: number;
}

const pressureState = (): PressureState => ({
    level: 0,
    average: 0,
    overloadFrames: 0,
    recoveryFrames: 0,
    cooldown: 0
});

export class AdaptiveStreamingController {
    private readonly enabled: boolean;
    private readonly targetFrameMs: number;
    private readonly degradeFrames: number;
    private readonly recoverFrames: number;
    private readonly cooldownFrames: number;
    private readonly emaAlpha: number;
    private averageFrameMs = 0;
    private readonly mainThread = pressureState();
    private readonly gpu = pressureState();
    private readonly worker = pressureState();
    private transitions = 0;
    private profile: AdaptiveStreamingProfile;
    private latest: Omit<AdaptiveStreamingSample, "frameMs"> = {};

    constructor(private readonly options: AdaptiveStreamingControllerOptions) {
        this.enabled = options.enabled ?? true;
        this.targetFrameMs = options.targetFrameMs ?? 1000 / 60;
        this.degradeFrames = options.degradeFrames ?? 18;
        this.recoverFrames = options.recoverFrames ?? 180;
        this.cooldownFrames = options.cooldownFrames ?? 90;
        this.emaAlpha = options.emaAlpha ?? 0.08;
        this.validate();
        this.profile = this.createProfile();
    }

    //Returns a profile only when a quality transition occurs. Samples above
    //250ms are normally background-tab/rAF suspension and are ignored.
    public sample(value: number | AdaptiveStreamingSample): Readonly<AdaptiveStreamingProfile> | undefined {
        const legacy = typeof value === "number";
        const sample: AdaptiveStreamingSample = legacy ? { frameMs: value } : value;
        const observedFrameMs = sample?.frameMs;
        if (!this.enabled || !Number.isFinite(observedFrameMs) || observedFrameMs <= 0
            || (legacy && observedFrameMs > 250)) return undefined;
        // Structured samples come from visible render loops with workload
        // telemetry. Keep extreme frames actionable, but cap their influence
        // so a single stall cannot dominate the EMA for minutes.
        const frameMs = legacy ? observedFrameMs : Math.min(observedFrameMs, 250);
        this.averageFrameMs = this.averageFrameMs === 0
            ? frameMs
            : this.averageFrameMs + (frameMs - this.averageFrameMs) * this.emaAlpha;
        this.latest = { ...sample };
        delete (this.latest as Partial<AdaptiveStreamingSample>).frameMs;

        let changed = false;
        if (legacy) {
            changed = this.samplePressure(this.mainThread, frameMs, this.targetFrameMs) || changed;
            changed = this.samplePressure(this.gpu, frameMs, this.targetFrameMs) || changed;
            changed = this.samplePressure(this.worker, frameMs, this.targetFrameMs) || changed;
        } else {
            const mainMeasurement = this.maximumDefined(
                sample.cpuFrameMs,
                sample.frameTaskMs,
                sample.longTaskMs,
                sample.oldestFrameTaskMs !== undefined
                    ? sample.oldestFrameTaskMs / 2
                    : undefined,
                sample.frameTaskBacklog !== undefined
                    ? sample.frameTaskBacklog > this.options.baseMaxTasksPerFrame * 3 ? this.targetFrameMs * 2 : 0
                    : undefined,
                sample.cpuBudgetExceededBytes !== undefined
                    ? sample.cpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0
                    : undefined
            );
            if (mainMeasurement !== undefined) {
                changed = this.samplePressure(this.mainThread, mainMeasurement, this.targetFrameMs) || changed;
            }
            const observableWorkIsIdle = (sample.frameTaskBacklog ?? 0) === 0
                && (sample.oldestFrameTaskMs ?? 0) <= this.targetFrameMs
                && (sample.workerQueueDepth ?? 0) === 0
                && (sample.workerContentionMs ?? 0) <= this.targetFrameMs * 0.25
                && (mainMeasurement ?? 0) <= this.targetFrameMs * 1.12;
            const gpuTimerStalled = Boolean(
                sample.gpuTimingSupported
                && sample.gpuTimingSaturated
                && (sample.gpuSampleAgeMs === undefined
                    || sample.gpuSampleAgeMs > this.targetFrameMs * 2)
            );
            const inferredRenderMs = !sample.gpuTimingSupported && observableWorkIsIdle
                ? frameMs
                : gpuTimerStalled && observableWorkIsIdle
                    ? Math.max(frameMs, this.targetFrameMs * 2)
                    : undefined;
            const renderMeasurement = this.maximumDefined(
                sample.gpuFrameMs ?? inferredRenderMs,
                sample.gpuBudgetExceededBytes !== undefined
                    ? sample.gpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0
                    : undefined,
                sample.cpuBudgetExceededBytes !== undefined
                    ? sample.cpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0
                    : undefined
            );
            if (renderMeasurement !== undefined) {
                changed = this.samplePressure(this.gpu, renderMeasurement, this.targetFrameMs) || changed;
            }
            if (sample.workerContentionMs !== undefined) {
                changed = this.samplePressure(this.worker, sample.workerContentionMs, this.targetFrameMs * 0.25) || changed;
            }
        }
        if (!changed) return undefined;
        this.transitions += 1;
        this.profile = this.createProfile();
        return this.profile;
    }

    public get currentProfile(): Readonly<AdaptiveStreamingProfile> {
        return this.profile;
    }

    public get stats(): Readonly<AdaptiveStreamingStats> {
        return {
            ...this.profile,
            enabled: this.enabled,
            targetFrameMs: this.targetFrameMs,
            averageFrameMs: this.averageFrameMs,
            overloadFrames: Math.max(
                this.mainThread.overloadFrames,
                this.gpu.overloadFrames,
                this.worker.overloadFrames
            ),
            recoveryFrames: Math.max(
                this.mainThread.recoveryFrames,
                this.gpu.recoveryFrames,
                this.worker.recoveryFrames
            ),
            transitions: this.transitions,
            averageCpuFrameMs: this.mainThread.average,
            averageGpuFrameMs: this.gpu.average,
            averageWorkerContentionMs: this.worker.average,
            frameTaskBacklog: this.latest.frameTaskBacklog ?? 0,
            oldestFrameTaskMs: this.latest.oldestFrameTaskMs ?? 0,
            workerQueueDepth: this.latest.workerQueueDepth ?? 0,
            workerBusyRatio: this.latest.workerBusyRatio ?? 0,
            chunkLoadLatencyMs: this.latest.chunkLoadLatencyMs ?? 0,
            chunkVisibleLatencyMs: this.latest.chunkVisibleLatencyMs ?? 0,
            uploadBytes: this.latest.uploadBytes ?? 0,
            drawCalls: this.latest.drawCalls ?? 0,
            gpuTimingSupported: this.latest.gpuTimingSupported ?? false,
            gpuTimingSaturated: this.latest.gpuTimingSaturated ?? false,
            gpuSampleAgeMs: this.latest.gpuSampleAgeMs,
            cpuBudgetExceededBytes: this.latest.cpuBudgetExceededBytes ?? 0,
            gpuBudgetExceededBytes: this.latest.gpuBudgetExceededBytes ?? 0
        };
    }

    private createProfile(): AdaptiveStreamingProfile {
        const main = QUALITY[this.mainThread.level];
        const gpu = QUALITY[this.gpu.level];
        const worker = QUALITY[this.worker.level];
        const minimumWorkerCount = this.options.minimumWorkerCount ?? 1;
        const scaleDistance = (value: number): number => Math.max(0, value * gpu.lod);
        return {
            qualityLevel: Math.max(this.mainThread.level, this.gpu.level, this.worker.level),
            mainThreadLevel: this.mainThread.level,
            gpuLevel: this.gpu.level,
            workerLevel: this.worker.level,
            frameBudgetMs: Math.max(0.5, this.options.baseFrameBudgetMs * main.mount),
            maxTasksPerFrame: Math.max(1, Math.round(this.options.baseMaxTasksPerFrame * main.tasks)),
            workerCount: Math.max(minimumWorkerCount, Math.round(this.options.baseWorkerCount * worker.workers)),
            resolutionScale: gpu.resolution,
            vegetationDensityScale: gpu.vegetation,
            lodDistanceScale: gpu.lod,
            lodBias: gpu.lodBias,
            vegetationLodBias: gpu.vegetationBias,
            lodDistances: {
                near: scaleDistance(this.options.baseLodDistances.near),
                far: scaleDistance(this.options.baseLodDistances.far),
                vegetation: scaleDistance(this.options.baseLodDistances.vegetation),
                hysteresis: scaleDistance(this.options.baseLodDistances.hysteresis)
            }
        };
    }

    private samplePressure(state: PressureState, measurement: number, target: number): boolean {
        if (!Number.isFinite(measurement) || measurement < 0) return false;
        state.average = state.average === 0
            ? measurement
            : state.average + (measurement - state.average) * this.emaAlpha;
        if (state.cooldown > 0) state.cooldown -= 1;
        const overloaded = state.average > target * 1.12;
        const recoverable = state.average < target * 1.03;
        state.overloadFrames = overloaded ? state.overloadFrames + 1 : 0;
        state.recoveryFrames = recoverable ? state.recoveryFrames + 1 : 0;
        if (state.cooldown > 0) return false;
        if (state.overloadFrames >= this.degradeFrames && state.level < QUALITY.length - 1) {
            state.level += 1;
            state.overloadFrames = 0;
            state.recoveryFrames = 0;
            state.cooldown = this.cooldownFrames;
            return true;
        }
        if (state.recoveryFrames >= this.recoverFrames && state.level > 0) {
            state.level -= 1;
            state.overloadFrames = 0;
            state.recoveryFrames = 0;
            state.cooldown = this.cooldownFrames;
            return true;
        }
        return false;
    }

    private maximumDefined(...values: Array<number | undefined>): number | undefined {
        const defined = values.filter((value): value is number => value !== undefined);
        return defined.length > 0 ? Math.max(...defined) : undefined;
    }

    private validate(): void {
        const positive = (name: string, value: number): void => {
            if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
        };
        positive("targetFrameMs", this.targetFrameMs);
        positive("baseFrameBudgetMs", this.options.baseFrameBudgetMs);
        if (!Number.isInteger(this.options.baseMaxTasksPerFrame) || this.options.baseMaxTasksPerFrame <= 0) {
            throw new RangeError("baseMaxTasksPerFrame must be a positive integer");
        }
        if (!Number.isInteger(this.options.baseWorkerCount) || this.options.baseWorkerCount <= 0) {
            throw new RangeError("baseWorkerCount must be a positive integer");
        }
        const minimumWorkerCount = this.options.minimumWorkerCount ?? 1;
        if (!Number.isInteger(minimumWorkerCount) || minimumWorkerCount <= 0
            || minimumWorkerCount > this.options.baseWorkerCount) {
            throw new RangeError("minimumWorkerCount must be between 1 and baseWorkerCount");
        }
        for (const [name, value] of [
            ["degradeFrames", this.degradeFrames],
            ["recoverFrames", this.recoverFrames],
            ["cooldownFrames", this.cooldownFrames]
        ] as const) {
            if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
        }
        if (!Number.isFinite(this.emaAlpha) || this.emaAlpha <= 0 || this.emaAlpha > 1) {
            throw new RangeError("emaAlpha must be in (0, 1]");
        }
    }
}

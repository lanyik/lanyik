import type { PlayerRenderState } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { createCombatSound, type SoundKind } from "./CombatSounds";

const CUES = ["attack", "cast", "hurt", "impact", "pickup"] as const;
const PRIORITY: Record<SoundKind, number> = { impact: 0, attack: 1, pickup: 1, cast: 2, hurt: 3, death: 4, wind: -1 };
const INTERVAL: Record<typeof CUES[number], number> = { attack: .07, cast: .09, hurt: .16, impact: .08, pickup: .12 };
interface Voice { readonly source: AudioBufferSourceNode; readonly priority: number }
interface AudioSnapshot { readonly enabled: boolean; readonly volume: number; readonly status: "locked" | "ready" | "failed"; readonly error?: string }

/** Owns one lazily unlocked context, eight one-shots and one ambient voice per view. */
export class CombatAudio {
    private context: AudioContext | undefined;
    private gain: GainNode | undefined;
    private compressor: DynamicsCompressorNode | undefined;
    private readonly buffers = new Map<SoundKind, AudioBuffer>();
    private readonly voices: Voice[] = [];
    private ambient: AudioBufferSourceNode | undefined;
    private readonly seen = new Float64Array(CUES.length).fill(-1);
    private readonly lastPlayed = new Float64Array(CUES.length).fill(-Infinity);
    private readonly listeners = new Set<() => void>();
    private snapshot: AudioSnapshot = { enabled: true, volume: .35, status: "locked" };
    private active = false;
    private baseline = true;
    private dead = false;
    private closed = false;
    private unlocking: Promise<void> | undefined;
    private closePromise: Promise<void> | undefined;
    constructor(private readonly createContext = () => new AudioContext()) {}
    public getSnapshot = (): AudioSnapshot => this.snapshot;
    public subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    private publish(change: Partial<AudioSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...change };
        for (const listener of this.listeners) listener();
    }
    /** Call inside a user gesture. Rejections are visible and can be retried explicitly. */
    public unlock(): Promise<void> {
        if (this.closed || !this.snapshot.enabled) return Promise.resolve();
        if (this.context?.state === "running" && this.snapshot.status === "ready") return Promise.resolve();
        if (this.unlocking) return this.unlocking;
        try {
            if (!this.context) {
                const context = this.createContext(); this.context = context;
                this.gain = context.createGain(); this.gain.gain.value = this.snapshot.volume;
                this.compressor = context.createDynamicsCompressor();
                this.compressor.threshold.value = -12; this.compressor.ratio.value = 6;
                this.gain.connect(this.compressor); this.compressor.connect(context.destination);
                for (const kind of [...CUES, "death", "wind"] as const) this.buffers.set(kind, createCombatSound(context, kind));
            }
            this.unlocking = this.context.resume().then(() => {
                if (!this.closed) { this.baseline = true; this.publish({ status: "ready", error: undefined }); }
            }).catch(error => { if (!this.closed) this.publish({ status: "failed", error: String(error) }); }).finally(() => { this.unlocking = undefined; });
            return this.unlocking;
        } catch (error) { this.publish({ status: "failed", error: String(error) }); return Promise.resolve(); }
    }
    public setEnabled(enabled: boolean): void {
        this.publish({ enabled }); this.baseline = true;
        if (!enabled) this.stop(); else void this.unlock();
    }
    public setVolume(volume: number): void {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError("Audio volume must be between 0 and 1");
        this.publish({ volume });
        if (this.gain && this.context) this.gain.gain.setTargetAtTime(volume, this.context.currentTime, .015);
        if (volume === 0) { this.stop(); this.baseline = true; }
    }
    public setActive(active: boolean): void {
        if (active === this.active) return;
        this.active = active; this.baseline = true;
        if (!active) this.stop();
    }
    public reset(): void { this.stop(); this.seen.fill(-1); this.lastPlayed.fill(-Infinity); this.baseline = true; this.dead = false; }
    public update(player: PlayerRenderState): void {
        const context = this.context;
        const audible = !this.closed && this.active && this.snapshot.enabled && this.snapshot.volume > 0 && context?.state === "running";
        const previousDeath = this.dead; this.dead = player.gameOver;
        if (this.dead && !previousDeath) {
            this.stop();
            if (audible && !this.baseline) this.play("death");
        }
        for (let i = 0; i < CUES.length; i++) {
            const kind = CUES[i], tick = player.feedback[`${kind}Tick`], age = player.animationTime - tick / GAME_CONFIG.timing.simulationHz;
            if (tick === this.seen[i]) continue;
            this.seen[i] = tick;
            if (!audible || this.baseline || this.dead || tick < 0 || age < 0 || age > .25 || context.currentTime - this.lastPlayed[i] < INTERVAL[kind]) continue;
            if (this.play(kind)) this.lastPlayed[i] = context.currentTime;
        }
        this.baseline = false;
        if (audible && !this.dead && !this.ambient) {
            this.ambient = this.source("wind"); this.ambient.loop = true; this.ambient.start();
        }
    }
    private source(kind: SoundKind): AudioBufferSourceNode {
        const source = this.context!.createBufferSource();
        source.buffer = this.buffers.get(kind)!; source.connect(this.gain!); return source;
    }
    private play(kind: SoundKind): boolean {
        const priority = PRIORITY[kind];
        if (this.voices.length === 8) {
            let victim = 0;
            for (let i = 1; i < this.voices.length; i++) if (this.voices[i].priority < this.voices[victim].priority) victim = i;
            if (this.voices[victim].priority > priority) return false;
            this.release(this.voices[victim], true);
        }
        const voice = { source: this.source(kind), priority }; this.voices.push(voice);
        voice.source.onended = () => this.release(voice, false); voice.source.start(); return true;
    }
    private release(voice: Voice, stop: boolean): void {
        const index = this.voices.indexOf(voice); if (index < 0) return;
        this.voices.splice(index, 1); voice.source.onended = null;
        if (stop) voice.source.stop();
        voice.source.disconnect();
    }
    private stop(): void {
        while (this.voices.length) this.release(this.voices[this.voices.length - 1], true);
        if (this.ambient) { this.ambient.stop(); this.ambient.disconnect(); this.ambient = undefined; }
    }
    public dispose(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closed = true; this.stop(); this.listeners.clear(); this.buffers.clear();
        this.gain?.disconnect(); this.compressor?.disconnect();
        this.closePromise = this.context ? this.context.close() : Promise.resolve(); return this.closePromise;
    }
}

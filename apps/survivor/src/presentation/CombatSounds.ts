/** Project-authored synthesis; no recordings, external samples or gameplay RNG. */
export type SoundKind = "attack" | "cast" | "hurt" | "impact" | "pickup" | "death" | "wind";
const DURATIONS: Record<SoundKind, number> = { attack: .18, cast: .48, hurt: .24, impact: .13, pickup: .32, death: 1.2, wind: 2 };

export function createCombatSound(context: BaseAudioContext, kind: SoundKind): AudioBuffer {
    const rate = 22050, duration = DURATIONS[kind], buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
    const samples = buffer.getChannelData(0);
    let seed = 17, low = 0, phase = 0;
    for (let i = 0; i < samples.length; i++) {
        const t = i / rate, p = t / duration;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1;
        low += .035 * (noise - low);
        const frequency = kind === "pickup" ? (p < .35 ? 880 : 1320) : kind === "cast" ? 250 + 700 * p
            : kind === "attack" ? 700 - 480 * p : kind === "death" ? 130 - 90 * p : 110 - 65 * p;
        phase += Math.PI * 2 * frequency / rate;
        const tone = Math.sin(phase);
        const envelope = Math.min(1, t / .008) * (1 - p) ** 2;
        samples[i] = kind === "wind" ? low * .35 * Math.sin(Math.PI * p) ** 2
            : (kind === "pickup" ? tone * .24 : kind === "cast" ? tone * .19 + low * .3
                : kind === "attack" ? tone * .07 + noise * .2 : tone * .22 + noise * .12) * envelope;
    }
    return buffer;
}

import { expect, test, vi } from "vitest";
import { CombatAudio } from "../src/presentation/CombatAudio";
import { PlayerFeedback } from "../src/core/PlayerFeedback";
import { ticksForSeconds } from "../src/core/GameConfig";
import type { PlayerRenderState } from "../src/core/CombatState";

function fixture() {
    const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: null | (() => void); loop: boolean }[] = [];
    const context = { state: "running", currentTime: 0, destination: {},
        createGain: () => ({ gain: { value: 0, setTargetAtTime: vi.fn() }, connect() {}, disconnect() {} }),
        createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect() {}, disconnect() {} }),
        createBuffer: (_channels: number, length: number) => { const data = new Float32Array(length); return { getChannelData: () => data }; },
        createBufferSource: () => { const source = { connect() {}, disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, loop: false }; sources.push(source); return source; },
        resume: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const create = vi.fn(() => context as unknown as AudioContext), audio = new CombatAudio(create), feedback = new PlayerFeedback();
    const player = { feedback, animationTime: 0, gameOver: false } as PlayerRenderState;
    return { audio, context, sources, create, feedback, player, active: () => sources.filter(source => !source.stop.mock.calls.length && source.onended !== null) };
}

test("audio unlock is lazy; repeated render frames and coalesced hits cannot flood voices", async () => {
    const f = fixture(); f.audio.setActive(true); f.audio.update(f.player); expect(f.create).not.toHaveBeenCalled();
    await f.audio.unlock(); f.audio.update(f.player);
    expect(f.sources.filter(source => source.loop)).toHaveLength(1);
    f.feedback.attackTick = 0; f.audio.update(f.player); f.audio.update(f.player);
    expect(f.active()).toHaveLength(1);
    await f.audio.unlock(); expect(f.context.resume).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= 15; i++) {
        f.context.currentTime = i; f.feedback.attackTick = f.feedback.castTick = f.feedback.hurtTick = f.feedback.impactTick = f.feedback.pickupTick = ticksForSeconds(i);
        f.audio.update({ ...f.player, animationTime: i }); expect(f.active().length).toBeLessThanOrEqual(8);
    }
    expect(f.active()).toHaveLength(8);
    f.audio.update({ ...f.player, animationTime: 15, gameOver: true });
    expect(f.active()).toHaveLength(1);
    const count = f.sources.length; f.audio.update({ ...f.player, animationTime: 15, gameOver: true }); expect(f.sources).toHaveLength(count);
    await f.audio.dispose(); expect(f.context.close).toHaveBeenCalledTimes(1);
    for (const source of f.sources) expect(source.disconnect).toHaveBeenCalledTimes(1);
});

test("pause, mute, stale cues and world replacement drop old audio instead of replaying it", async () => {
    const f = fixture(); await f.audio.unlock(); f.audio.setActive(true); f.audio.update(f.player);
    f.feedback.hurtTick = 0; f.audio.update(f.player); expect(f.active()).toHaveLength(1);
    f.audio.setActive(false); expect(f.active()).toHaveLength(0);
    f.feedback.castTick = 1; f.audio.setActive(true); f.audio.update({ ...f.player, animationTime: .1 }); expect(f.active()).toHaveLength(0);
    f.feedback.pickupTick = 2; f.audio.update({ ...f.player, animationTime: 2 }); expect(f.active()).toHaveLength(0);
    f.audio.setEnabled(false); f.audio.update({ ...f.player, animationTime: 2 });
    f.feedback.attackTick = ticksForSeconds(2); f.audio.setEnabled(true); f.audio.update({ ...f.player, animationTime: 2 }); expect(f.active()).toHaveLength(0);
    f.audio.reset(); f.audio.update({ ...f.player, animationTime: 2 }); expect(f.active()).toHaveLength(0);
    f.audio.setVolume(0); expect(f.active()).toHaveLength(0);
    expect(() => f.audio.setVolume(NaN)).toThrow(RangeError);
    await f.audio.dispose(); await f.audio.dispose(); expect(f.context.close).toHaveBeenCalledTimes(1);
});

test("blocked unlock reports a retryable error; a late resume cannot revive a disposed owner", async () => {
    const f = fixture(); f.context.resume.mockRejectedValueOnce(new Error("blocked"));
    await f.audio.unlock(); expect(f.audio.getSnapshot().status).toBe("failed");
    let finish!: () => void; f.context.resume.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.audio.unlock(); expect(f.audio.unlock()).toBe(pending);
    await f.audio.dispose(); finish(); await pending;
    expect(f.sources).toHaveLength(0); expect(f.audio.getSnapshot().status).toBe("failed");
});

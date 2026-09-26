import { useSyncExternalStore } from "react";
import type { CombatAudio } from "./CombatAudio";

export function AudioControls({ audio }: { readonly audio: CombatAudio }) {
    const state = useSyncExternalStore(audio.subscribe, audio.getSnapshot);
    return <fieldset className="audio-controls"><legend>声音</legend>
        <label><input type="checkbox" checked={state.enabled} onChange={event => audio.setEnabled(event.target.checked)} />音效与环境声</label>
        <label>音量 <input aria-label="音量" type="range" min="0" max="100" value={Math.round(state.volume * 100)} onChange={event => audio.setVolume(Number(event.target.value) / 100)} /> {Math.round(state.volume * 100)}%</label>
        {state.enabled && state.status !== "ready" && <button onClick={() => void audio.unlock()}>{state.status === "failed" ? "重试声音" : "启用声音"}</button>}
        {state.error && <p role="alert">声音未能启动：{state.error}</p>}
    </fieldset>;
}

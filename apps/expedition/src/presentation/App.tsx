import { useState, useSyncExternalStore, type FormEvent } from "react";
import { GAME_SPEEDS } from "../core/GameClock";
import type { GameSession } from "../app/GameSession";
import type { WorldSelection } from "../app/WorldView";

const terrainNames: Record<WorldSelection["terrain"], string> = {
    sea: "海洋", coastal: "近岸水域", land: "平原", sand: "沙地",
    tundra: "苔原", snow: "积雪地带", mountain: "山地"
};
const modifierNames: Record<string, string> = {
    hill: "丘陵", wood: "森林", lake: "湖泊"
};

function formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map(value => String(value).padStart(2, "0")).join(":");
}

export function App({ session }: { session: GameSession }) {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const [seed, setSeed] = useState(state.seed);
    const ready = state.status === "ready";
    const loading = state.status === "idle" || state.status === "loading";
    const selected = state.selection;
    const start = (event: FormEvent) => {
        event.preventDefault();
        void session.start(seed);
    };

    return <main className="expedition" data-state={state.status}>
        <header className="mission-bar">
            <div className="mission-brand">
                <span className="mission-symbol" aria-hidden="true">✧</span>
                <div><p className="eyebrow">EXPEDITION / 远征计划</p><h1>远征群星</h1></div>
            </div>
            <div className="mission-phase"><span className="status-light" />地表勘察</div>
            <div className="time-controls">
                <div className="mission-time"><span>远征时间</span>
                    <output data-testid="game-time" data-tick={state.tick}>{formatTime(state.elapsedMs)}</output>
                </div>
                <button className="pause-button" disabled={!ready} onClick={() => session.dispatch({
                    type: "set-paused", paused: !state.paused
                })}>{state.paused ? "继续" : "暂停"}</button>
                <div className="speed-controls" aria-label="时间倍率">
                    {GAME_SPEEDS.map(speed => <button key={speed} disabled={!ready}
                        aria-pressed={state.speed === speed}
                        onClick={() => session.dispatch({ type: "set-speed", speed })}>{speed}×</button>)}
                </div>
            </div>
        </header>

        <aside className="survey-panel">
            <div className="panel-heading"><span className="eyebrow">PLANET SURVEY</span><span className="section-number">01</span></div>
            <h2>陌生世界的第一眼</h2>
            <p className="panel-description">勘察地表，寻找适合建立第一座基地的位置。</p>
            <form className="planet-form" onSubmit={start}>
                <label htmlFor="planet-seed">星球种子</label>
                <input id="planet-seed" value={seed} maxLength={128} required
                    onChange={event => setSeed(event.target.value)} disabled={loading} spellCheck={false} />
                <button type="submit" className="survey-button" disabled={loading || !seed.trim()}>
                    <span aria-hidden="true">↻</span> 重新勘察
                </button>
            </form>
            <section className="terrain-inspection" aria-labelledby="terrain-heading">
                <div className="inspection-heading"><h3 id="terrain-heading">地表信息</h3><span className="eyebrow">SCAN</span></div>
                {selected ? <dl data-testid="tile-inspection">
                    <div><dt>坐标</dt><dd>{selected.x}, {selected.y}</dd></div>
                    <div><dt>地形</dt><dd>{terrainNames[selected.terrain]}</dd></div>
                    <div><dt>地表特征</dt><dd>{selected.modifiers.length === 0 ? "无附加特征" :
                        selected.modifiers.map(modifier => modifierNames[modifier]).join(" · ")}</dd></div>
                </dl> : <p className="selection-hint"><span aria-hidden="true">⌖</span>点击一块地表，查看勘察信息。</p>}
            </section>
            <p className="session-status" role="status">
                {loading ? "正在展开星球地表…" : state.status === "failed" ? "本次勘察未能完成" :
                    state.paused ? "时间已暂停，可以继续查看地表。" : "勘察进行中"}
            </p>
        </aside>

        {state.status === "failed" && <div className="error-notice" role="alert">
            <strong>星球加载失败</strong><p>{state.error}</p><span>请重新发起勘察。</span>
        </div>}
        {loading && <div className="loading-notice" aria-hidden="true"><span className="loading-orbit" /><span>正在接近星球</span></div>}

        <footer className="map-guide" aria-label="地图操作说明">
            <span><kbd>左键</kbd>查看地表</span><span><kbd>W A S D</kbd>移动</span>
            <span><kbd>右键拖动</kbd>旋转</span><span><kbd>滚轮</kbd>缩放</span>
        </footer>
    </main>;
}

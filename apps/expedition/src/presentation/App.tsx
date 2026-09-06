import { useState, useSyncExternalStore, type FormEvent } from "react";
import { GAME_SPEEDS } from "../core/GameClock";
import type { GameSession } from "../app/GameSession";
import type { WorldSelection } from "../app/WorldView";
import { MINERALS, MINERAL_IDS } from "../content/minerals";
import { BUILDINGS, MINING_CYCLE_TICKS } from "../content/buildings";
import { BuildToolbar } from "./BuildToolbar";
import type { BuildingStatus } from "../core/construction/Industry";

const terrainNames: Record<WorldSelection["terrain"], string> = {
    sea: "海洋", coastal: "近岸水域", land: "平原", sand: "沙地",
    tundra: "苔原", snow: "积雪地带", mountain: "山地"
};
const modifierNames: Record<string, string> = {
    hill: "丘陵", wood: "森林", lake: "湖泊"
};
const buildingStatuses: Record<BuildingStatus, string> = {
    ready: "运行正常", mining: "采集中", "warehouse-full": "仓库已满", depleted: "矿点已枯竭", disconnected: "作业通路中断"
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
    const survey = state.survey;
    const mineral = selected?.mineral;
    const industry = state.industry;
    const landed = industry?.landed === true;
    const building = state.selectedBuilding;
    const start = (event: FormEvent) => {
        event.preventDefault();
        void session.start(seed);
    };

    return <main className="expedition" data-state={state.status} data-building-mode={!!state.build} data-landed={landed}>
        <header className="mission-bar">
            <div className="mission-brand">
                <span className="mission-symbol" aria-hidden="true">✧</span>
                <div><p className="eyebrow">EXPEDITION / 远征计划</p><h1>远征群星</h1></div>
            </div>
            <div className="mission-phase"><span className="status-light" />{landed ? "基地建设" : "登陆选址"}</div>
            <div className="time-controls">
                <div className="mission-time"><span>远征时间</span>
                    <output data-testid="game-time" data-tick={state.tick}>{formatTime(state.elapsedMs)}</output>
                </div>
                <button className="pause-button" disabled={!ready || !landed} onClick={() => session.dispatch({
                    type: "set-paused", paused: !state.paused
                })}>{state.paused ? "继续" : "暂停"}</button>
                <div className="speed-controls" aria-label="时间倍率">
                    {GAME_SPEEDS.map(speed => <button key={speed} disabled={!ready || !landed}
                        aria-pressed={state.speed === speed}
                        onClick={() => session.dispatch({ type: "set-speed", speed })}>{speed}×</button>)}
                </div>
            </div>
        </header>

        {ready && industry && <section className="inventory-bar" aria-label="基地仓库" data-testid="base-inventory">
            <div className="inventory-heading"><strong>基地仓库</strong><span data-testid="inventory-capacity">{industry.inventory.total.toLocaleString("zh-CN")} / {industry.inventory.capacity.toLocaleString("zh-CN")}</span></div>
            <div className="inventory-items">{MINERAL_IDS.map(mineral => <div key={mineral}>
                <span style={{ color: MINERALS[mineral].color }}>{MINERALS[mineral].name}</span>
                <output data-testid={`inventory-${mineral}`} data-amount={industry.inventory.amounts[mineral]}>{industry.inventory.amounts[mineral].toLocaleString("zh-CN")}</output>
            </div>)}</div>
        </section>}

        <aside className="survey-panel">
            <div className="panel-heading"><span className="eyebrow">PLANET SURVEY</span><span className="section-number">01</span></div>
            <h2>{landed ? "基地已经展开" : "选择你的登陆地点"}</h2>
            <p className="panel-description">{landed ? `已建成 ${industry!.buildings.length} 座建筑，采集产出直接进入基地仓库。` : "按 B 打开建造目录，在平地上展开指挥中心。选址期间时间暂停。"}</p>
            <details className="planet-settings" open={!landed || loading}>
            <summary>星球设置 <span>更换种子会重新开始</span></summary>
            <form className="planet-form" onSubmit={start}>
                <label htmlFor="planet-seed">星球种子</label>
                <input id="planet-seed" value={seed} maxLength={128} required
                    onChange={event => setSeed(event.target.value)} disabled={loading} spellCheck={false} />
                <button type="submit" className="survey-button" disabled={loading || !seed.trim()}>
                    <span aria-hidden="true">↻</span> 重新勘察
                </button>
            </form>
            </details>
            <section className="terrain-inspection" aria-labelledby="terrain-heading">
                <div className="inspection-heading"><h3 id="terrain-heading">地表信息</h3><span className="eyebrow">SCAN</span></div>
                {selected ? <dl data-testid="tile-inspection">
                    <div><dt>坐标</dt><dd>{selected.x}, {selected.y}</dd></div>
                    <div><dt>地形</dt><dd>{terrainNames[selected.terrain]}</dd></div>
                    <div><dt>地表特征</dt><dd>{selected.modifiers.length === 0 ? "无附加特征" :
                        selected.modifiers.map(modifier => modifierNames[modifier]).join(" · ")}</dd></div>
                </dl> : <p className="selection-hint"><span aria-hidden="true">⌖</span>点击一块地表，查看勘察信息。</p>}
                {selected && !building && <div className="mineral-inspection" data-testid="mineral-inspection" data-mineral={mineral?.mineral ?? "none"}>
                    {mineral ? <>
                        <strong style={{ color: MINERALS[mineral.mineral].color }}>{MINERALS[mineral.mineral].name}露头</strong>
                        <p>本格储量 <b>{(state.selectedRemaining ?? mineral.initialAmount).toLocaleString("zh-CN")}</b></p>
                        <span>{MINERALS[mineral.mineral].use}</span>
                    </> : <span>本格未发现可开采矿藏。</span>}
                </div>}
                {building && <section className="building-inspection" data-testid="building-inspection" data-building={building.kind}>
                    <div className="inspection-heading"><h3>{BUILDINGS[building.kind].name}</h3><span className="building-state" data-status={building.status}>{state.paused && building.status === "mining" ? "时间已暂停" : buildingStatuses[building.status]}</span></div>
                    {building.mineral ? <>
                        <p>{MINERALS[building.mineral.mineral].name} · 5 单位 / 秒</p>
                        <progress aria-label="采集进度" max={MINING_CYCLE_TICKS} value={building.progress} />
                        <p>剩余矿量 <b data-testid="mine-remaining">{building.remaining?.toLocaleString("zh-CN")}</b></p>
                    </> : <p>提供 {BUILDINGS[building.kind].storage.toLocaleString("zh-CN")} 单位共享仓容</p>}
                    {building.kind !== "command-center" && <button className="demolish-button" onClick={() => session.dispatch({ type: "demolish", id: building.id })}>拆除并回收材料</button>}
                </section>}
            </section>
            <p className="session-status" role="status">
                {loading ? "正在展开星球地表…" : state.status === "failed" ? "本次勘察未能完成" :
                    !landed ? "等待展开指挥中心 · 时间暂停" : state.paused ? "时间已暂停，可以继续建造。" : "基地运转中"}
            </p>
        </aside>

        {ready && survey && <aside className="resource-panel" aria-label="登陆区资源评估">
            <div className="panel-heading"><span className="eyebrow">LANDING SURVEY</span><span className="section-number">02</span></div>
            <h2>一片可以起步的土地</h2>
            <p className="panel-description">连片平地 {survey.buildingTiles} 格 · 可达林地 {survey.forestTiles} 格</p>
            <button className="landing-focus" onClick={() => session.dispatch({ type: "focus-survey", target: "landing" })}>
                返回推荐登陆区 <span>{survey.landing.x}, {survey.landing.y}</span>
            </button>
            <div className="inspection-heading"><h3>起步矿藏</h3><span className="eyebrow">18 步以内</span></div>
            <div className="resource-list">
                {survey.resources.map(resource => <button key={resource.mineral} className="resource-card"
                    data-testid="survey-resource" data-mineral={resource.mineral}
                    aria-label={`定位${MINERALS[resource.mineral].name}`}
                    onClick={() => session.dispatch({ type: "focus-survey", target: resource.mineral })}>
                    <span className="mineral-symbol" style={{ color: MINERALS[resource.mineral].color }}>{MINERALS[resource.mineral].symbol}</span>
                    <span className="resource-detail"><strong>{MINERALS[resource.mineral].name}<small>最近 {resource.distance} 步</small></strong>
                        <span>{resource.amount.toLocaleString("zh-CN")} 初始量 · {resource.tiles} 格露头</span></span>
                    <span className="locate-symbol" aria-hidden="true">⌖</span>
                </button>)}
            </div>
            <button className="expansion-focus" onClick={() => session.dispatch({ type: "focus-survey", target: "expansion" })}>
                <span>第二片{MINERALS[survey.expansion.node.mineral].name}区</span><span>{survey.expansion.distance} 步 →</span>
            </button>
            <p className="resource-hint">点击资源定位矿区，再点击地块查看储量。距离按可通行地表到作业位置计算。</p>
        </aside>}

        {state.status === "failed" && <div className="error-notice" role="alert">
            <strong>星球加载失败</strong><p>{state.error}</p><span>请重新发起勘察。</span>
        </div>}
        {loading && <div className="loading-notice" aria-hidden="true"><span className="loading-orbit" /><span>正在接近星球</span></div>}

        {ready && <button className="build-toggle" aria-pressed={!!state.build} onClick={() => session.dispatch({ type: "build-toggle" })}><kbd>B</kbd> 建造</button>}
        <BuildToolbar session={session} state={state} />
        {ready && state.notice && <p className="construction-notice" role="status">{state.notice}</p>}

        <footer className="map-guide" aria-label="地图操作说明">
            <span><kbd>左键</kbd>查看地表</span><span><kbd>W A S D</kbd>移动</span>
            <span><kbd>右键拖动</kbd>旋转</span><span><kbd>滚轮</kbd>缩放</span>
            <span><kbd>B</kbd>建造</span>
        </footer>
    </main>;
}

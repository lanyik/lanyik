import { BUILDINGS, BUILDING_CATEGORIES, BUILDING_IDS, type BuildingId } from "../content/buildings";
import { MINERALS, MINERAL_IDS } from "../content/minerals";
import type { GameSession, SessionSnapshot } from "../app/GameSession";

function BuildingIcon({ kind }: { kind: BuildingId }) {
    return <svg viewBox="0 0 64 52" fill="none" aria-hidden="true">
        {kind === "command-center" ? <><path d="M7 44V24h15V12h24v32M22 28H8m38-7h10v23H7" /><path d="M28 44V33h12v11M29 20h4m5 0h3M34 12V3m-6 0h12" /></>
            : kind === "miner" ? <><path d="M8 45V10h29v35M6 10h34M22 10v22m-7 0 7 12 7-12H15M44 45V24h14v21M3 46h58" /><path d="M46 31h10m-10 5h10" /></>
            : <><path d="M5 46V24h54v22H5m8-22V7h40v17M23 7v17M43 7v17M17 24v22m15-22v22m15-22v22" /><path d="M7 30h50M15 13h36" /></>}
    </svg>;
}

export function BuildToolbar({ session, state }: { session: GameSession; state: SessionSnapshot }) {
    const build = state.build;
    if (!build) return null;
    const definition = BUILDINGS[build.kind];
    return <section className="build-toolbar" aria-label="建筑目录" data-testid="build-toolbar">
        <div className="build-toolbar-heading"><div><span className="eyebrow">CONSTRUCTION</span><strong>建造目录</strong></div>
            <button aria-label="关闭建造模式" onClick={() => session.dispatch({ type: "build-cancel" })}>Esc <span>×</span></button></div>
        <div className="building-tabs" role="tablist" aria-label="建筑分类">
            {BUILDING_CATEGORIES.map((category, index) => <button key={category.id} id={`building-tab-${category.id}`} role="tab"
                aria-controls="building-catalog" aria-selected={definition.category === category.id}
                tabIndex={definition.category === category.id ? 0 : -1}
                onKeyDown={event => {
                    const next = event.key === "ArrowRight" ? (index + 1) % BUILDING_CATEGORIES.length
                        : event.key === "ArrowLeft" ? (index + BUILDING_CATEGORIES.length - 1) % BUILDING_CATEGORIES.length
                        : event.key === "Home" ? 0 : event.key === "End" ? BUILDING_CATEGORIES.length - 1 : undefined;
                    if (next === undefined) return;
                    event.preventDefault();
                    const category = BUILDING_CATEGORIES[next];
                    session.dispatch({ type: "build-select", kind: BUILDING_IDS.find(kind => BUILDINGS[kind].category === category.id)! });
                    document.getElementById(`building-tab-${category.id}`)?.focus();
                }}
                onClick={() => session.dispatch({ type: "build-select", kind: BUILDING_IDS.find(kind => BUILDINGS[kind].category === category.id)! })}>
                {category.name}</button>)}
        </div>
        <div id="building-catalog" className="building-catalog" role="tabpanel" aria-labelledby={`building-tab-${definition.category}`}>
            {BUILDING_IDS.filter(kind => BUILDINGS[kind].category === definition.category).map(kind => <button key={kind}
                className="building-card" data-building={kind} aria-label={`选择${BUILDINGS[kind].name}`} aria-pressed={build.kind === kind}
                onClick={() => session.dispatch({ type: "build-select", kind })}>
                <BuildingIcon kind={kind} /><span><strong>{BUILDINGS[kind].name}</strong><small>{BUILDINGS[kind].footprint.length} 格占地</small></span>
            </button>)}
            <div className="building-description"><p>{definition.description}</p>
                <div className="building-cost" aria-label="建造材料">
                    {build.kind === "command-center" ? <span>登陆舱免费展开 · 仅可建造一座</span> : MINERAL_IDS.filter(mineral => definition.cost[mineral] > 0)
                        .map(mineral => <span key={mineral} data-insufficient={(state.industry?.inventory.amounts[mineral] ?? 0) < definition.cost[mineral]}>
                            {MINERALS[mineral].name} <b>{definition.cost[mineral]}</b></span>)}
                </div>
                <div className="build-actions"><button aria-label="旋转建筑" onClick={() => session.dispatch({ type: "build-rotate" })}>
                    ↻ R 旋转 <span>{build.rotation * 60}°</span></button><span>左键放置 · 可连续建造</span></div>
            </div>
        </div>
        <p className="placement-status" data-testid="placement-status" data-valid={build.preview?.valid ?? false} role="status">
            <span>{build.preview ? build.preview.valid ? "◇" : "!" : "⌖"}</span>
            {build.preview?.message ?? "将指针移到地图上预览完整占地"}
        </p>
    </section>;
}

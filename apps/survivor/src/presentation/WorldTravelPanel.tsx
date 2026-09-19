import { useState } from "react";
import type { WorldLocation } from "../core/Homestead";
import { UiIcon } from "./UiIcon";

const DESTINATIONS = [
    { id: "homestead", name: "灯火营地", subtitle: "家园 · 海上避风港", detail: "64 × 64 的安全家园。回城恢复生命与法力，可整理装备、打造和练习技能。", action: "回到家园" },
    { id: "wilds", name: "荒野", subtitle: "未知之地 · 探索与战斗", detail: "返回上次离开的荒野位置。步行揭开迷雾，挑战地域领主，把收获带回家园。", action: "出战荒野" }
] as const;

export function WorldTravelPanel({ location, busy, close, travel }: { location: WorldLocation; busy: boolean; close(): void; travel(destination: WorldLocation): void }) {
    const [selected, setSelected] = useState<WorldLocation>(location);
    const [hovered, setHovered] = useState<WorldLocation>();
    const preview = DESTINATIONS.find(destination => destination.id === (hovered ?? selected))!;
    const destination = DESTINATIONS.find(destination => destination.id === selected)!;
    return <section className="world-travel window" role="dialog" aria-label="世界传送">
        <header className="window-heading"><div className="window-title"><UiIcon name="travel" /><div><span className="eyebrow">WAYFARER / 世界航图</span><h2>世界传送</h2></div></div>
            <button className="close-button" aria-label="关闭世界传送" disabled={busy} onClick={close}><UiIcon name="close" /><kbd>H</kbd></button></header>
        <p className="travel-intro">循灯火归来，向未知出发。悬停查看目的地，点击节点选择。</p>
        <div className="travel-chart">
            <svg className="travel-cartography" viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true">
                <defs><pattern id="sea-lines" width="48" height="32" patternUnits="userSpaceOnUse"><path d="M5 17q9-6 18 0t18 0" fill="none" stroke="#8cacb8" opacity=".12" /></pattern></defs>
                <rect width="800" height="340" fill="url(#sea-lines)" />
                <path className="chart-contour" d="M87 115 119 70 183 49 242 59 286 106 272 151 303 201 277 250 202 278 131 257 96 211 67 166Z" />
                <path className="chart-island" d="M108 122 141 85 182 74 230 85 261 119 249 154 274 200 251 229 200 248 150 229 126 200 97 161Z" />
                <path className="chart-contour" d="M472 91 528 45 596 59 634 34 711 70 758 136 731 181 756 249 707 297 635 280 591 305 529 271 478 235 492 181 458 136Z" />
                <path className="chart-island wild-island" d="M500 102 542 74 590 88 640 60 694 95 729 139 702 183 723 244 697 270 636 252 590 275 548 246 507 223 519 179 487 141Z" />
                <path className="chart-river" d="M618 72q-41 42-9 67t-20 64q-25 25-9 58" />
                <path className="chart-mountains" d="m524 129 20-29 20 29m76-18 19-31 20 31m-7 108 21-34 23 34m-151 26 13-22 15 22" />
                <path className="chart-route" d="M209 171C338 89 442 261 598 170" />
                <g className="chart-compass"><path d="m740 25 0 39m-16-19h32m-16-20 7 20-7-5-7 5Z" /><text x="739" y="18">N</text></g>
            </svg>
            {DESTINATIONS.map(point => <button key={point.id} className={`travel-node ${point.id}${selected === point.id ? " selected" : ""}`}
                aria-label={`目的地：${point.name}`} aria-pressed={selected === point.id} disabled={busy}
                onMouseEnter={() => setHovered(point.id)} onMouseLeave={() => setHovered(undefined)} onFocus={() => setHovered(point.id)} onBlur={() => setHovered(undefined)}
                onClick={() => setSelected(point.id)}>
                <span className="travel-node-emblem"><UiIcon name={point.id === "homestead" ? "home" : "mountains"} /></span>
                <strong>{point.name}</strong><small>{point.id === location ? "当前所在" : "已开放"}</small>
            </button>)}
        </div>
        <div className="travel-details" aria-live="polite"><span className="eyebrow">{preview.subtitle}</span><h3>{preview.name}</h3><p>{preview.detail}</p></div>
        <footer className="travel-actions"><span>已选择：{destination.name}</span><button disabled={busy || selected === location} onClick={() => travel(selected)}>
            <UiIcon name="travel" />{selected === location ? "当前所在" : destination.action}</button></footer>
    </section>;
}

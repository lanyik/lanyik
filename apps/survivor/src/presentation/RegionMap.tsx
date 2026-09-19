import { useEffect, useEffectEvent, useRef, useState } from "react";
import { REGION_RULES } from "../core/RegionalWorld";
import type { CombatSnapshot } from "../core/CombatState";
import type { AttachRegionMap, RegionMapBinding, MapDestination } from "../app/RegionMapBinding";
import { UiIcon } from "./UiIcon";
import type { ExplorationSnapshot } from "../core/Exploration";

export function RegionMap({ combat, exploration, expanded, onToggle, onExpandedChange, onNavigate, attach }: { readonly combat: CombatSnapshot;
    readonly exploration: ExplorationSnapshot;
    readonly expanded: boolean; readonly onToggle: () => void; readonly onExpandedChange: (expanded: boolean) => void;
    readonly onNavigate: (destination: MapDestination) => void; readonly attach: AttachRegionMap }) {
    const canvas = useRef<HTMLCanvasElement>(null), binding = useRef<RegionMapBinding | undefined>(undefined);
    const [destination, setDestination] = useState<MapDestination>();
    const changeExpanded = useEffectEvent(onExpandedChange), navigate = useEffectEvent(onNavigate);
    useEffect(() => {
        const map = attach(canvas.current!, { onExpandedChange: changeExpanded, onNavigate: navigate, onDestinationChange: setDestination }); binding.current = map;
        return () => { binding.current = undefined; map.dispose(); };
    }, [attach]);
    useEffect(() => { binding.current?.update(combat, exploration); }, [attach, combat, exploration]);
    useEffect(() => { binding.current?.setExpanded(expanded); }, [attach, expanded]);
    useEffect(() => {
        if (!expanded) return;
        const keyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
                || document.querySelector("dialog[open]")
                || event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
            if (event.code === "Space") {
                if (event.target instanceof HTMLElement && event.target.closest("button")) return;
                binding.current?.recenter();
            } else if (event.code === "KeyT" && !combat.gameOver) binding.current?.navigate();
            else return;
            event.preventDefault();
        };
        window.addEventListener("keydown", keyDown);
        return () => window.removeEventListener("keydown", keyDown);
    }, [expanded, combat.gameOver]);
    const region = combat.region;
    const atHome = combat.world.location === "homestead";
    return <section className={`region-map-panel panel${expanded ? " expanded" : ""}`} aria-label="地域地图" data-testid="region-status" data-difficulty={region.difficulty}>
        <header><div><span className="eyebrow">{atHome ? "HOME / 安全据点" : "THE WILDS / 地域"}</span><strong>{atHome ? "家园 · 灯火营地" : expanded ? "荒原 · 世界地图" : REGION_RULES[region.difficulty].name}</strong></div>
            <button aria-label={expanded ? "收起地图" : "展开地图"} aria-expanded={expanded} onClick={onToggle}><UiIcon name={expanded ? "close" : "map"} /><kbd>M</kbd></button></header>
        <div className="region-meta">{atHome ? <><span>安全区域</span><span>64 × 64</span></> : <><span>第 {region.ring} 环</span><span>等级带 <b>{region.bandMin}–{region.bandMax}</b></span></>}</div>
        <div className="region-map-surface">
            <canvas ref={canvas} className="region-map" tabIndex={0} role={expanded ? "application" : "img"}
                aria-label={expanded ? "世界地图，可滚轮缩放、右键拖动、点击选择目标" : "山川水域、地域难度与玩家朝向地图"}
                aria-describedby={expanded ? "map-controls-tip" : undefined} data-testid="terrain-minimap" data-heading={combat.player.heading} />
            <span className="map-north" aria-hidden="true">N<i /></span>
            <span className="map-caption" aria-hidden="true">{atHome ? "灯火营地" : "荒原 · 地貌"}</span>
        </div>
        <footer>{atHome ? <><span className="normal-dot">营地全域可见</span><b>安全</b></> : <><span className="normal-dot">常规</span><span className="hard-dot">困难</span><span className="horror-dot">恐怖</span><b>Lv.{region.level}</b></>}</footer>
        {expanded && <>
            <div className="map-destination" aria-live="polite">{destination
                ? <><span>目标 {destination.x.toFixed(1)} / {destination.z.toFixed(1)}</span><b>{atHome ? "家园" : destination.accessible ? `${REGION_RULES[destination.region.difficulty].name} · Lv.${destination.region.level}` : "未探索 · 禁止传送"}</b></>
                : <span>点击地图选择目标位置</span>}</div>
            <div className="map-actions"><button onClick={() => binding.current?.recenter()}>回到玩家<kbd>空格</kbd></button>
                <button disabled={!destination?.accessible || combat.gameOver} onClick={() => binding.current?.navigate()}>传送到目标<kbd>T</kbd></button></div>
            <p id="map-controls-tip" className="map-reading-tip">滚轮缩放 · 右键拖动 · 点击选点 · M / Esc 关闭<br />{atHome ? "家园全域可见 · 出战后返回上次荒野位置" : "步行揭开迷雾 · 低于自身等级的地域自动揭示 · 仅可传送至已解锁陆地"}</p>
        </>}
    </section>;
}

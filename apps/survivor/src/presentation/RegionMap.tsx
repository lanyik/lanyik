import { useEffect, useEffectEvent, useRef, useState } from "react";
import { REGION_RULES } from "../core/RegionalWorld";
import type { CombatSnapshot } from "../core/CombatState";
import type { AttachRegionMap, RegionMapBinding, MapDestination } from "../app/RegionMapBinding";
import { UiIcon } from "./UiIcon";

export function RegionMap({ combat, expanded, onToggle, onExpandedChange, onNavigate, attach }: { readonly combat: CombatSnapshot;
    readonly expanded: boolean; readonly onToggle: () => void; readonly onExpandedChange: (expanded: boolean) => void;
    readonly onNavigate: (destination: MapDestination) => void; readonly attach: AttachRegionMap }) {
    const canvas = useRef<HTMLCanvasElement>(null), binding = useRef<RegionMapBinding | undefined>(undefined);
    const [destination, setDestination] = useState<MapDestination>();
    const changeExpanded = useEffectEvent(onExpandedChange), navigate = useEffectEvent(onNavigate);
    useEffect(() => {
        const map = attach(canvas.current!, { onExpandedChange: changeExpanded, onNavigate: navigate, onDestinationChange: setDestination }); binding.current = map;
        return () => { binding.current = undefined; map.dispose(); };
    }, [attach]);
    useEffect(() => { binding.current?.update(combat); }, [attach, combat]);
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
    return <section className={`region-map-panel panel${expanded ? " expanded" : ""}`} aria-label="地域地图" data-testid="region-status" data-difficulty={region.difficulty}>
        <header><div><span className="eyebrow">THE WILDS / 地域</span><strong>{expanded ? "荒原 · 世界地图" : REGION_RULES[region.difficulty].name}</strong></div>
            <button aria-label={expanded ? "收起地图" : "展开地图"} aria-expanded={expanded} onClick={onToggle}><UiIcon name={expanded ? "close" : "map"} /><kbd>M</kbd></button></header>
        <div className="region-meta"><span>第 {region.ring} 环</span><span>等级带 <b>{region.bandMin}–{region.bandMax}</b></span></div>
        <div className="region-map-surface">
            <canvas ref={canvas} className="region-map" tabIndex={0} role={expanded ? "application" : "img"}
                aria-label={expanded ? "世界地图，可滚轮缩放、右键拖动、点击选择目标" : "山川水域、地域难度与玩家朝向地图"}
                aria-describedby={expanded ? "map-controls-tip" : undefined} data-testid="terrain-minimap" data-heading={combat.player.heading} />
            <span className="map-north" aria-hidden="true">N<i /></span>
            <span className="map-caption" aria-hidden="true">荒原 · 地貌</span>
        </div>
        <footer><span className="normal-dot">常规</span><span className="hard-dot">困难</span><span className="horror-dot">恐怖</span><b>Lv.{region.level}</b></footer>
        {expanded && <>
            <div className="map-destination" aria-live="polite">{destination
                ? <><span>目标 {destination.x.toFixed(1)} / {destination.z.toFixed(1)}</span><b>{REGION_RULES[destination.region.difficulty].name} · Lv.{destination.region.level}</b></>
                : <span>点击地图选择目标位置</span>}</div>
            <div className="map-actions"><button onClick={() => binding.current?.recenter()}>回到玩家<kbd>空格</kbd></button>
                <button disabled={!destination || combat.gameOver} onClick={() => binding.current?.navigate()}>传送到目标<kbd>T</kbd></button></div>
            <p id="map-controls-tip" className="map-reading-tip">滚轮缩放 · 右键拖动 · 点击选点 · M / Esc 关闭<br />箭头为玩家朝向 · ◆ 恐怖地域 · 传送需选择可站立的陆地</p>
        </>}
    </section>;
}

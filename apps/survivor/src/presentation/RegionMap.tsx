import { useEffect, useRef } from "react";
import { REGION_RULES } from "../core/RegionalWorld";
import type { CombatSnapshot } from "../core/CombatState";
import type { AttachRegionMap, RegionMapBinding } from "../app/RegionMapBinding";
import { UiIcon } from "./UiIcon";

export function RegionMap({ combat, expanded, onToggle, attach }: { readonly combat: CombatSnapshot;
    readonly expanded: boolean; readonly onToggle: () => void; readonly attach: AttachRegionMap }) {
    const canvas = useRef<HTMLCanvasElement>(null), binding = useRef<RegionMapBinding | undefined>(undefined);
    useEffect(() => {
        const map = attach(canvas.current!); binding.current = map;
        return () => { binding.current = undefined; map.dispose(); };
    }, [attach]);
    useEffect(() => { binding.current?.update(combat); }, [attach, combat]);
    useEffect(() => { binding.current?.setExpanded(expanded); }, [attach, expanded]);
    const region = combat.region;
    return <section className={`region-map-panel panel${expanded ? " expanded" : ""}`} aria-label="地域地图" data-testid="region-status" data-difficulty={region.difficulty}>
        <header><div><span className="eyebrow">THE WILDS / 地域</span><strong>{REGION_RULES[region.difficulty].name}</strong></div>
            <button aria-label={expanded ? "收起地图" : "展开地图"} aria-expanded={expanded} onClick={onToggle}><UiIcon name={expanded ? "close" : "map"} /><kbd>M</kbd></button></header>
        <div className="region-meta"><span>第 {region.ring} 环</span><span>等级带 <b>{region.bandMin}–{region.bandMax}</b></span></div>
        <div className="region-map-surface">
            <canvas ref={canvas} className="region-map" role="img" aria-label="山川水域、地域难度与玩家朝向地图" data-testid="terrain-minimap" data-heading={combat.player.heading} />
            <span className="map-north" aria-hidden="true">N<i /></span>
            <span className="map-caption" aria-hidden="true">荒原 · 地貌</span>
        </div>
        <footer><span className="normal-dot">常规</span><span className="hard-dot">困难</span><span className="horror-dot">恐怖</span><b>Lv.{region.level}</b></footer>
        {expanded && <p className="map-reading-tip">箭头表示玩家朝向 · 色晕表示邻近地域难度 · ◆ 恐怖地域</p>}
    </section>;
}

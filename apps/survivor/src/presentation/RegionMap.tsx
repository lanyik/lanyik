import { REGION_RADIUS, REGION_RULES } from "../core/RegionalWorld";
import type { CombatSnapshot } from "../core/CombatSimulation";

const HEX_POINTS = Array.from({ length: 6 }, (_, index) => `${Math.cos(index * Math.PI / 3) * 20},${Math.sin(index * Math.PI / 3) * 20}`).join(" ");
export function RegionMap({ combat, expanded, onToggle }: { readonly combat: CombatSnapshot; readonly expanded: boolean; readonly onToggle: () => void }) {
    const scale = 20 / REGION_RADIUS;
    const region = combat.region;
    return <section className={`region-map-panel panel${expanded ? " expanded" : ""}`} aria-label="地域地图" data-testid="region-status" data-difficulty={region.difficulty}>
        <header><div><strong>{REGION_RULES[region.difficulty].name}</strong><small>第 {region.ring} 环 · 等级带 {region.bandMin}–{region.bandMax}</small></div>
            <button aria-label={expanded ? "收起地图" : "展开地图"} onClick={onToggle}><kbd>M</kbd></button></header>
        <svg className="region-map" viewBox="-112 -96 224 192" role="img" aria-label="六边形地域地图">
            {combat.nearbyRegions.map(candidate => <g className={`region-cell region-${candidate.difficulty}${candidate.x === region.x && candidate.z === region.z ? " current" : ""}`}
                key={`${candidate.x},${candidate.z}`} transform={`translate(${(candidate.centerX - region.centerX) * scale},${(candidate.centerZ - region.centerZ) * scale})`}>
                <title>{REGION_RULES[candidate.difficulty].name} · 等级 {candidate.level} · 第 {candidate.ring} 环</title>
                <polygon points={HEX_POINTS} /><text textAnchor="middle" dominantBaseline="middle">{candidate.level}</text>
                {candidate.difficulty === "horror" && <text className="boss-map-mark" y="11" textAnchor="middle">◆</text>}
            </g>)}
            <g transform={`translate(${(combat.player.x - region.centerX) * scale},${(combat.player.z - region.centerZ) * scale})`}>
                <circle className="player-map-halo" r="5" /><circle className="player-map-dot" r="2.5" />
            </g>
        </svg>
        <footer><span className="normal-dot">常规</span><span className="hard-dot">困难</span><span className="horror-dot">恐怖</span><b>Lv.{region.level}</b></footer>
    </section>;
}

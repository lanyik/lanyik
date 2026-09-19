import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { REGION_RULES } from "../core/RegionalWorld";
import type { CombatSnapshot } from "../core/CombatState";
import type { AttachRegionMap, RegionMapBinding, MapDestination } from "../app/RegionMapBinding";
import { UiIcon } from "./UiIcon";
import type { ExplorationSnapshot } from "../core/Exploration";
import { CHALLENGES, isChallenge } from "../core/BossChallenge";
import { WindowHeader } from "./WindowChrome";

export function RegionMap({ combat, exploration, expanded, onToggle, onExpandedChange, onNavigate, attach, embedded = false, navigationDisabled = false, entryAction, children }: { readonly combat: CombatSnapshot;
    readonly entryAction?: { label: string; description: string; disabled: boolean; travel(): void };
    readonly children?: ReactNode;
    readonly embedded?: boolean;
    readonly navigationDisabled?: boolean;
    readonly exploration: ExplorationSnapshot;
    readonly expanded: boolean; readonly onToggle: () => void; readonly onExpandedChange: (expanded: boolean) => void;
    readonly onNavigate: (destination: MapDestination) => void; readonly attach: AttachRegionMap }) {
    const canvas = useRef<HTMLCanvasElement>(null), binding = useRef<RegionMapBinding | undefined>(undefined);
    const [destination, setDestination] = useState<MapDestination>();
    const [pointMode, setPointMode] = useState(!entryAction);
    const changeExpanded = useEffectEvent(onExpandedChange), navigate = useEffectEvent(onNavigate);
    useEffect(() => {
        const map = attach(canvas.current!, { onExpandedChange: changeExpanded, onNavigate: navigate, onDestinationChange: setDestination }, embedded ? { location: combat.world.location, combat } : undefined); binding.current = map;
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
                if (event.target instanceof HTMLElement && event.target.closest("button, summary")) return;
                binding.current?.recenter();
            } else if (event.code === "KeyT") confirm();
            else return;
            event.preventDefault();
        };
        window.addEventListener("keydown", keyDown);
        return () => window.removeEventListener("keydown", keyDown);
    }, [expanded, combat.gameOver, navigationDisabled]);
    const region = combat.region;
    const atHome = combat.world.location === "homestead";
    const challenge = isChallenge(combat.world.location) ? CHALLENGES[combat.world.location] : undefined;
    const cooling = combat.world.location === "wilds" && destination && destination.region.level > combat.player.level && combat.teleportRemaining > 0;
    const blocked = pointMode ? !destination?.accessible || combat.gameOver || navigationDisabled || !!cooling : entryAction?.disabled;
    const perform = () => { if (!blocked) { if (pointMode) binding.current?.navigate(); else entryAction?.travel(); } };
    const confirm = useEffectEvent(perform);
    const help = <><p>滚轮缩放 · 右键拖动 · 点击选点。空格回到玩家，T 传送。</p><p>{atHome ? "家园全域可见，出战后返回上次荒野位置。" : challenge ? "固定浓雾边界；清空后前往中心领取三星彩装。" : "已解锁同级及以下不限次；越级探索传送间隔 5 秒，暂停冻结冷却。"}</p></>;
    return <section className={`region-map-panel panel${expanded ? " expanded" : ""}${embedded ? " embedded-map" : ""}`} aria-label="地域地图" data-testid="region-status" data-difficulty={region.difficulty}>
        {expanded && !embedded ? <WindowHeader title="区域地图" icon="map" shortcut="M" close={onToggle} closeLabel="收起地图" help={help} /> : !embedded && <header><div><strong>{atHome ? "家园 · 灯火营地" : challenge ? challenge.name : REGION_RULES[region.difficulty].name}</strong></div>
            {!embedded && <button aria-label={expanded ? "收起地图" : "展开地图"} aria-expanded={expanded} onClick={onToggle}><UiIcon name={expanded ? "close" : "map"} /><kbd>M</kbd></button>}</header>
        }
        <div className="map-content">
        {expanded && <div className="map-toolbar"><strong>{atHome ? "灯火营地" : challenge ? challenge.name : "荒野"}</strong><button aria-label="回到玩家" title="回到玩家（空格）" onClick={() => binding.current?.recenter()}><UiIcon name="map" />定位</button></div>}
        <div className="region-meta">{atHome ? <><span>安全区域</span><span>64 × 64</span></> : challenge ? <><span>固定围场</span><span>挑战等级 <b>{region.level}</b></span></> : <><span>第 {region.ring} 环</span><span>等级带 <b>{region.bandMin}–{region.bandMax}</b></span></>}</div>
        <div className="region-map-surface" onClickCapture={() => { if (expanded) setPointMode(true); }}>
            <canvas ref={canvas} className="region-map" tabIndex={0} role={expanded ? "application" : "img"}
                aria-label={expanded ? "世界地图，可滚轮缩放、右键拖动、点击选择目标" : "山川水域、地域难度与玩家朝向地图"}
                data-testid="terrain-minimap" data-heading={combat.player.heading} />
            <span className="map-north" aria-hidden="true">N<i /></span>
            <span className="map-caption" aria-hidden="true">{atHome ? "灯火营地" : challenge ? "浓雾边界" : "荒原 · 地貌"}</span>
        </div>
        <div className="map-legend">{atHome ? <><span className="normal-dot">营地全域可见</span><b>安全</b></> : challenge ? <><span>击杀经验 ×3</span><b>剩余 {combat.challenges[combat.world.location as keyof typeof CHALLENGES]?.remaining ?? 61}</b></> : <><span className="normal-dot">常规</span><span className="hard-dot">困难</span><span className="horror-dot">恐怖</span><b>Lv.{region.level}</b></>}</div>
        {children}
        </div>
        {expanded && <>
            {entryAction && <div className="segmented-control travel-target-mode" aria-label="传送方式"><button aria-pressed={!pointMode} onClick={() => setPointMode(false)}>区域入口</button><button aria-pressed={pointMode} onClick={() => setPointMode(true)}>地图选点</button></div>}
            <footer className="map-action-footer action-footer"><div className="selection-summary map-destination" aria-live="polite">{!pointMode ? <span>{entryAction?.description}</span> : destination
                ? <><span>目标 {destination.x.toFixed(1)} / {destination.z.toFixed(1)}</span><b>{atHome ? "家园" : destination.accessible ? `${REGION_RULES[destination.region.difficulty].name} · Lv.${destination.region.level}` : "未探索 · 禁止传送"}</b></>
                : <span>点击地图选择目标位置</span>}</div>
                <button className="primary-action" disabled={!!blocked} onClick={perform}>{pointMode ? cooling ? `越级传送 ${combat.teleportRemaining.toFixed(1)}s` : "传送到目标" : entryAction?.label}<kbd aria-hidden="true">T</kbd></button></footer>
        </>}
    </section>;
}

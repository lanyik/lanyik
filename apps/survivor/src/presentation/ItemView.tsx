import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BONUS_IDS, BONUS_INFO, RARITY_NAMES, SLOT_NAMES, type BonusId } from "../core/Equipment";
import type { InventoryItem } from "../core/InventoryItem";

export function statValue(id: BonusId, value: number): string {
    const unit = BONUS_INFO[id].unit;
    if (unit === "percent") return `${Number((value * 100).toFixed(1))}%`;
    return `${Number(value.toFixed(2))}${unit === "permille" ? "‰" : unit === "seconds" ? "秒" : unit === "regen" ? "/0.5秒" : ""}`;
}
export function Hint({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    const id = useId();
    const [anchor, setAnchor] = useState<{ x: number; y: number }>();
    return <span className="hint-wrapper">
        <button className="hint" aria-label={`${label}说明`} aria-describedby={anchor ? id : undefined}
            onFocus={event => { const box = event.currentTarget.getBoundingClientRect(); setAnchor({ x: box.right, y: box.bottom }); }}
            onMouseEnter={event => { const box = event.currentTarget.getBoundingClientRect(); setAnchor({ x: box.right, y: box.bottom }); }}
            onBlur={() => setAnchor(undefined)} onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setAnchor(undefined); }}>!</button>
        {anchor && createPortal(<div role="tooltip" id={id} className="hint-popup" style={{
            left: Math.max(8, Math.min(anchor.x + 8, window.innerWidth - 300)), top: Math.max(8, Math.min(anchor.y + 8, window.innerHeight - 260))
        }}>{children}</div>, document.body)}
    </span>;
}

const ICON_PATHS = {
    weapon: "M10 35L32 8L38 6L37 13L17 39M10 29L23 39M8 38L13 43",
    head: "M11 35V22C11 5 37 5 37 22V35L29 40V26H19V40ZM13 22H35",
    chest: "M15 9L22 13H26L33 9L41 21L34 27V40H14V27L7 21Z",
    legs: "M14 8H34L36 40H26L24 22L22 40H12Z",
    boots: "M18 8H32L30 29L39 34V41H11V32L18 28Z",
    arms: "M12 12L25 7L38 16L33 36L23 41L11 31ZM14 18L34 25M13 25L32 31",
    hands: "M14 25V15H19V24V9H24V23V11H29V25V16H34V33L28 41H18L10 29Z",
    ring: "M14 20A13 13 0 1 0 34 20M16 12L24 6L32 12L24 22Z",
    necklace: "M10 10C9 31 39 31 38 10M24 27L16 35L24 43L32 35Z",
    bracelet: "M10 16C10 5 38 5 38 16V33C38 44 10 44 10 33ZM10 16C10 27 38 27 38 16",
    charm: "M17 8H31L36 17L32 25L36 38L24 43L12 38L16 25L12 17ZM24 16L19 23L24 30L29 23Z",
    orb: "M24 5L40 15V33L24 43L8 33V15ZM8 15L24 23L40 15M24 23V43M24 5V23",
    consumable: "M18 6H30V12H27V20L35 31V39L31 43H17L13 39V31L21 20V12H18ZM15 31H33"
} as const;
export function ItemIcon({ kind, className = "" }: { readonly kind: keyof typeof ICON_PATHS; readonly className?: string }) {
    return <svg className={`item-icon ${className}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[kind]} /></svg>;
}
export function ItemDetails({ item }: { readonly item: InventoryItem }) {
    return <div className={`item-details rarity-${item.rarity}`} data-testid="item-details">
        <header><strong>{item.name}</strong><span><b className="rarity-label">{RARITY_NAMES[item.rarity]}品质</b><span>等级 {item.itemLevel}</span></span></header>
        {item.kind === "equipment" && <>
            <div className="item-meta"><span>{SLOT_NAMES[item.slot]}</span><span className="gear-stars" aria-label={`${item.stars}星`}>{"★".repeat(item.stars)}</span><span>评分 {item.score}</span></div>
            <h4 className="item-section-title">基础属性</h4>
            <div className="item-properties" aria-label="基础属性">{BONUS_IDS.filter(id => item.baseBonuses[id] > 0).map(id => <div className="property-row" key={id}><span>{BONUS_INFO[id].name}</span><b>+{statValue(id, item.baseBonuses[id])}</b></div>)}</div>
            <h4 className="item-section-title">附加词条</h4>
            <ul className="affix-list" aria-label={`${item.affixes.length}条词条`}>{item.affixes.map(affix => <li key={affix.stat}>
                <span>{BONUS_INFO[affix.stat].name}<Hint label={BONUS_INFO[affix.stat].name}>{BONUS_INFO[affix.stat].detail}</Hint></span>
                <b>{affix.stat === "shieldRecovery" ? "−" : "+"}{statValue(affix.stat, affix.value)}</b>
            </li>)}</ul>
        </>}
        {item.kind === "orb" && <><div className="item-meta">寻宝宝珠 · 宝箱 / 领主专属</div>
            <h4 className="item-section-title">嵌入效果</h4><div className="item-properties">{item.ratings.quantity > 0 && <div className="property-row"><span>掉落数量</span><b>+{item.ratings.quantity}</b></div>}
                {item.ratings.quality > 0 && <div className="property-row"><span>品质寻宝</span><b>+{item.ratings.quality}</b></div>}{item.ratings.stars > 0 && <div className="property-row"><span>星级寻宝</span><b>+{item.ratings.stars}</b></div>}</div></>}
        {item.kind === "consumable" && <><h4 className="item-section-title">使用效果</h4><div className="property-row"><span>恢复{item.effect === "health" ? "生命" : "法力"}</span><b>+{item.restore}</b></div><p>药剂共用 4 秒冷却</p></>}
    </div>;
}

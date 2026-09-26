import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BONUS_IDS, BONUS_INFO, RARITY_NAMES, SLOT_NAMES, equipmentAccessLabel, type BonusId } from "../core/Equipment";
import { POTIONS, potionAmount, type Consumable, type InventoryItem } from "../core/InventoryItem";
import type { ItemType } from "../core/ItemDefinition";
import { GAME_CONFIG } from "../core/GameConfig";
import { CONSUMABLE_COOLDOWN } from "../core/GameConfig";
import { IconFrame } from "./IconFrame";
import { orbDust } from "../core/Orbs";
import { challengeBossName } from "../core/BossChallenge";

export const QUALITY_CSS = Object.entries(GAME_CONFIG.quality).map(([rarity, info]) => `.rarity-${rarity}{--rarity:${info.color}}`).join("");

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
    scroll: "M12 8H36V32L29 40H10V32H28V15H12M12 8C6 8 6 15 12 15M22 19L27 24L22 29L17 24ZM29 32V40",
    affix: "M13 7H35V35L29 41H10V34H28V14H13ZM13 7C7 7 7 15 13 15M17 20H24M17 26H24M19 7V14M29 35V41",
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
    fortune: "M24 5L40 15V33L24 43L8 33V15ZM24 13L31 24L24 35L17 24Z",
    bounty: "M24 5L40 15V33L24 43L8 33V15ZM31 24A7 7 0 1 1 17 24A7 7 0 1 1 31 24M24 19V29",
    constellation: "M24 5L40 15V33L24 43L8 33V15ZM24 13L27 20L35 24L27 27L24 35L21 27L13 24L21 20Z",
    harmony: "M24 5L40 15V33L24 43L8 33V15ZM19 17L29 31M29 17L19 31M16 24H32",
    health: "M18 6H30V12H27V20L35 31V39L31 43H17L13 39V31L21 20V12H18ZM19 33H29M24 28V38",
    mana: "M18 6H30V12H27V20L35 31V39L31 43H17L13 39V31L21 20V12H18ZM24 26C13 39 35 39 24 26Z",
    "health-percent": "M19 5H29V13L39 25V37L24 44L9 37V25L19 13ZM17 26H31M24 19V33M15 37H33",
    "mana-percent": "M19 5H29V13L39 25V37L24 44L9 37V25L19 13ZM24 19C9 35 39 35 24 19ZM15 37H33"
} as const;
export function ItemIcon({ item, type = "equipment", value = "weapon", className = "" }: {
    readonly item?: InventoryItem; readonly type?: ItemType; readonly value?: keyof typeof ICON_PATHS; readonly className?: string;
}) {
    const category = item?.type ?? type, subtype = item?.value ?? value;
    return <IconFrame type={category} value={subtype} rarity={item?.rarity} className={className}
        badge={item?.type === "equipment" ? <span aria-label={`${item.stars}星`}>{"★".repeat(item.stars)}</span>
            : item?.type === "consumable" || item?.type === "affix" || item?.type === "scroll" ? <span aria-label={`数量 ${item.size}`}>{item.size}</span> : undefined}>
        <svg className={`item-icon icon-${subtype}`} viewBox="0 0 48 48" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PATHS[category === "affix" || category === "scroll" ? category : subtype as keyof typeof ICON_PATHS]} />{category === "consumable" && subtype.endsWith("-percent") && <text x="36" y="16" fill="currentColor" fillOpacity="1" stroke="none" fontSize="13" fontWeight="bold">%</text>}
        </svg>
    </IconFrame>;
}
export function potionDescription(item: Consumable): string {
    const recipe = POTIONS[item.value], amount = potionAmount(item);
    return `恢复${recipe.resource === "health" ? "生命" : "法力"} ${recipe.percent ? `${Math.round(amount * 100)}% 上限` : `+${amount}`}`;
}
export function ItemDetails({ item }: { readonly item: InventoryItem }) {
    return <div className={`item-details rarity-${item.rarity}`} data-testid="item-details">
        <header><strong>{item.name}</strong><span><b className="rarity-label">{RARITY_NAMES[item.rarity]}品质</b>{item.type === "equipment" && <span>等级 {item.itemLevel}</span>}</span></header>
        {item.type === "equipment" && <>
            <div className="item-meta"><span>{SLOT_NAMES[item.value]}</span><span>{equipmentAccessLabel(item)}</span><span className="gear-stars" aria-label={`${item.stars}星`}>{"★".repeat(item.stars)}</span><span>评分 {item.score}</span>{item.locked && <span>已锁定 · 自动清理保护</span>}</div>
            <h4 className="item-section-title">基础属性</h4>
            <div className="item-properties" aria-label="基础属性">{BONUS_IDS.filter(id => item.baseBonuses[id] > 0).map(id => <div className="property-row" key={id}><span>{BONUS_INFO[id].name}</span><b>+{statValue(id, item.baseBonuses[id])}</b></div>)}</div>
            <h4 className="item-section-title">附加词条</h4>
            <ul className="affix-list" aria-label={`${item.affixes.length}条词条`}>{item.affixes.map(affix => <li key={affix.stat}>
                <span>{BONUS_INFO[affix.stat].name}<Hint label={BONUS_INFO[affix.stat].name}>{BONUS_INFO[affix.stat].detail}</Hint></span>
                <b>{affix.stat === "shieldRecovery" ? "−" : "+"}{statValue(affix.stat, affix.value)}</b>
            </li>)}</ul>
        </>}
        {item.type === "orb" && <><div className="item-meta">寻宝宝珠 · 宝箱 / 领主专属</div>
            <h4 className="item-section-title">嵌入效果</h4><div className="item-properties">{item.ratings.quantity > 0 && <div className="property-row"><span>掉落数量</span><b>+{item.ratings.quantity}</b></div>}
                {item.ratings.quality > 0 && <div className="property-row"><span>品质寻宝</span><b>+{item.ratings.quality}</b></div>}{item.ratings.stars > 0 && <div className="property-row"><span>星级寻宝</span><b>+{item.ratings.stars}</b></div>}</div><p>同类两颗：该类寻宝 +25%。三种类型：金币 +25%。四种类型：打造消耗 −15%。</p><p>可在打造中精炼品质，或分解获得 {orbDust(item)} 宝珠粉尘。</p></>}
        {item.type === "affix" && <><div className="item-meta">词条精粹 · 数量 {item.size}</div><h4 className="item-section-title">打入效果</h4>
            <div className="property-row"><span>{BONUS_INFO[item.value].name}</span><b>{item.value === "shieldRecovery" ? "−" : "+"}{statValue(item.value, item.amount)}</b></div>
            <p>{BONUS_INFO[item.value].detail}</p><p>在打造界面拖到目标装备的某条词条上，确认后消耗一份精粹并覆盖原词条。</p></>}
        {item.type === "consumable" && <><h4 className="item-section-title">使用效果</h4><div className="property-row">{potionDescription(item)}</div>
            {item.rarity === "legendary" && <div className="property-row">额外恢复{POTIONS[item.value].resource === "health" ? "法力" : "生命"}上限的 15%</div>}
            <p>生命恢复享受回复加成。数量 {item.size} / {GAME_CONFIG.inventory.consumable.stackSize} · 共用 {CONSUMABLE_COOLDOWN} 秒冷却</p></>}
        {item.type === "scroll" && <><h4 className="item-section-title">领主挑战传送</h4><p>开启 {challengeBossName(item.value)} 的挑战副本，首次进入消耗 1 张。中途离开、倒下或刷新保留击杀与领奖进度。</p>
            <p>经验 ×3 · 普通怪强度 ×1.3 · Boss ×1.5。清场后中心七彩宝箱必得三星彩装。</p><p>使用打开对应世界地图。数量 {item.size} / 99。</p></>}
    </div>;
}

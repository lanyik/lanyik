import { useMemo, useState } from "react";
import type { PlayerSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { canStack } from "../core/Inventory";
import { compareEquipment } from "../core/EquipmentEvaluation";
import { canUseConsumable, type InventoryItem } from "../core/InventoryItem";
import { SLOT_NAMES, BONUS_INFO } from "../core/Equipment";
import { RARITIES, RARITY_NAMES, type Rarity } from "../core/Loot";
import { ItemIcon, potionDescription, statValue } from "./ItemView";
import { OrbSockets, useOrbDrag } from "./OrbDrag";
import { ItemTooltip, powerClass, signed, useDismissItemTooltip } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";
import { recycleReward, recyclingName } from "../core/Recycling";
import { POTION_RARITIES } from "../core/InventoryItem";
import { VirtualItemGrid } from "./VirtualItemGrid";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onRecycle, onBulkRecycle, onSort, onMerge, onAutoRecycle, onLock, onCraft, onRemoveOrb, disabled, paused }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number | undefined) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onRecycle: (item: InventoryItem) => void;
    readonly onBulkRecycle: (belowLevel: number) => void;
    readonly onSort: () => void; readonly onMerge: () => void; readonly onAutoRecycle: (type: InventoryItem["type"], maximum: Rarity | null) => void;
    readonly onLock: (id: number, locked: boolean) => void; readonly onCraft: (item: InventoryItem) => void;
    readonly onRemoveOrb: (socket: number) => void; readonly disabled: boolean; readonly paused: boolean;
}) {
    const [filter, setFilter] = useState<InventoryItem["type"]>("equipment");
    const [belowLevelText, setBelowLevel] = useState(String(Math.max(2, player.level)));
    const belowLevel = Number(belowLevelText);
    const [lockMode, setLockMode] = useState(false);
    const drag = useOrbDrag();
    const dismissTooltip = useDismissItemTooltip();
    const evaluations = useMemo(() => new Map(player.inventory.filter(item => item.type === "equipment").map(item => [item.id, compareEquipment(item, player)])), [player.inventory, player.stats, player.equipment, player.level, player.attributes]);
    const items = player.inventory.filter(item => item.type === filter);
    const rules = GAME_CONFIG.inventory[filter];
    const mergeable = filter === "consumable" && items.some((item, index) => item.size < rules.stackSize && items.some((other, j) => j > index && canStack(item, other)));
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div className="window-title"><UiIcon name="inventory" /><div><span className="eyebrow">INVENTORY</span><h2>行囊</h2></div></div>
            <div className={`bag-capacity${items.length === rules.capacity ? " full" : ""}`} aria-label={`${rules.name}容量 ${items.length} / ${rules.capacity}`}><span>{rules.name}{items.length === rules.capacity ? "已满" : "容量"}<b>{items.length}<small> / {rules.capacity}</small></b></span><div><i style={{ width: `${items.length / rules.capacity * 100}%` }} /></div></div>
            <button className="close-button" aria-label="关闭背包" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="bag-toolbar"><div className="bag-tabs">{([['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂'], ['affix', '词条'], ['scroll', '卷轴']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => { setFilter(id); onSelect(undefined); }}>{name}<span>{player.inventory.filter(item => item.type === id).length}/{GAME_CONFIG.inventory[id].capacity}</span></button>)}</div>
            {filter === "consumable" && <button disabled={disabled || !mergeable} onClick={onMerge}>合并药剂</button>}
            <button className="sort-inventory" disabled={disabled || player.inventory.length === 0} onClick={onSort} title="按品质、等级从高到低整理"><UiIcon name="sort" />一键整理</button>
        </div>
        {filter === "equipment" && <div className="bag-bulk"><label>分解低于 <input aria-label="批量分解等级" type="number" min="2" step="1" value={belowLevelText} onChange={event => setBelowLevel(event.target.value)} /> 级</label>
            <button disabled={disabled || !Number.isSafeInteger(belowLevel) || belowLevel < 2 || !items.some(item => item.type === "equipment" && !item.locked && item.itemLevel < belowLevel)} onClick={() => onBulkRecycle(belowLevel)}>一键分解</button>
            <button aria-pressed={lockMode} onClick={() => setLockMode(!lockMode)}>锁定模式</button><small>Shift＋点击切换锁定；自动锁定先转为手动保护，再次点击解锁。</small></div>}
        <div className="bag-cleanup">
            <label>自动{recyclingName(filter)}<select aria-label={`自动${recyclingName(filter)}${rules.name}品质`} value={player.autoRecycle[filter] ?? "off"} onChange={event => onAutoRecycle(filter, event.target.value === "off" ? null : event.target.value as Rarity)} disabled={disabled}>
                <option value="off">关闭</option>
                {(filter === "consumable" ? POTION_RARITIES : RARITIES).map(rarity => <option key={rarity} value={rarity}>{RARITY_NAMES[rarity]}及以下（含{RARITY_NAMES[rarity]}）</option>)}
            </select></label><small>{filter === "equipment" ? "Z 挂机自动穿戴战力提升装备；明显落后的自动锁定白蓝紫装可出售，手动锁定及金色以上保留。品质清理保留提升、持平和空部位装备。" : filter === "orb" ? "Z 挂机先按整套寻宝收益自动嵌珠，再按品质分解剩余宝珠；已嵌宝珠保留。" : "当前分类按整格自动售出换金币，设置后立即处理。"}</small><span>已{recyclingName(filter)} <b>{player.recycled[filter]}</b> 件</span>
        </div>
        {filter === "orb" && <div className="bag-orb-slots"><OrbSockets player={player} disabled={disabled} onRemove={onRemoveOrb} /><small>拖到槽位嵌入 / 交换 · 双击槽位取下 · 聚焦图标按空格，再按 1–6</small></div>}
        <VirtualItemGrid key={filter} className="bag-cards" label="背包物品" items={items} minWidth={174} rowHeight={142} renderItem={item => {
            const comparison = evaluations.get(item.id);
            const useDisabled = disabled || item.type === "orb" || item.type === "affix" || item.type === "consumable" && (paused || player.potionRemaining > 0 || !canUseConsumable(item, player));
            return <article key={item.id} tabIndex={0}
                className={`inventory-card rarity-${item.rarity}${item.id === selectedId ? " selected" : ""}${item.type === "equipment" && item.locked ? " item-locked" : ""}`}
                aria-label={`${item.name}${item.type === "equipment" ? `，等级${item.itemLevel}` : ""}`} data-testid="inventory-item" data-item-id={item.id} data-kind={item.type} data-rarity={item.rarity} data-level={item.type === "equipment" ? item.itemLevel : undefined}
                data-clearable={comparison?.canClear ?? false} data-power-delta={comparison?.delta}
                onClickCapture={event => { if (item.type === "equipment" && (event.shiftKey || lockMode)) { event.preventDefault(); event.stopPropagation(); dismissTooltip(); if (!disabled) onLock(item.id, !item.locked || item.autoEquipped); } }}
                onPointerDown={event => { if (item.type === "equipment" && (event.shiftKey || lockMode)) event.preventDefault(); }}
                onKeyDown={event => { if (item.type === "equipment" && event.shiftKey && event.code === "Space") { event.preventDefault(); event.stopPropagation(); dismissTooltip(); if (!disabled && !event.repeat) onLock(item.id, !item.locked || item.autoEquipped); } }}
                onClick={() => onSelect(item.id)} onFocus={() => onSelect(item.id)}
                onDoubleClick={event => { if (!event.shiftKey && !lockMode && !useDisabled && event.target instanceof Element && !event.target.closest("button")) onUse(item); }}>
                {item.type === "equipment" && item.locked && <><UiIcon name="lock" className="cell-lock-watermark" /><span className="cell-lock-badge"><UiIcon name="lock" />{item.autoEquipped ? "自动锁定" : "已锁定"}</span></>}
                <header className="bag-item-heading"><ItemTooltip item={item} player={player}><button className={`item-icon-trigger${item.type === "orb" ? " orb-drag-trigger" : ""}`} aria-label={`查看${item.name}详情`}
                    onPointerDown={event => { if (item.type === "orb") drag.begin(event, item.id); }} onKeyDown={event => { if (item.type === "orb") drag.keyboard(event, item.id); }}
                    onDoubleClick={event => { if (!event.shiftKey && !lockMode && !useDisabled) onUse(item); }}><ItemIcon item={item} /></button></ItemTooltip><div><strong>{item.name}</strong><small>{item.type === "equipment" ? `${SLOT_NAMES[item.value]} · Lv.${item.itemLevel}${item.locked ? " · 已锁定" : ""}` : item.type === "orb" ? "寻宝宝珠" : item.type === "affix" ? "词条精粹" : item.type === "scroll" ? "领主挑战通行证" : "恢复药剂"}</small></div></header>
                {comparison && item.type === "equipment" ? <div className="bag-item-rating"><span>评分 <b>{item.score}</b></span><strong className={powerClass(comparison.delta)}>战力 {signed(comparison.delta)}</strong><small>{comparison.canClear ? "可清理" : "保留"}</small></div>
                    : <div className="bag-item-rating"><span>{item.type === "consumable" ? potionDescription(item) : item.type === "affix" ? `${BONUS_INFO[item.value].name} ${statValue(item.value, item.amount)}` : item.type === "scroll" ? "经验 ×3 · 清场必得三星彩装" : "嵌入后提升寻宝收益"}</span></div>}
                <footer className="item-actions">{item.type === "orb" ? <small>拖动嵌入</small> : item.type !== "affix" && <button className="primary-action" disabled={useDisabled} onClick={() => onUse(item)}>{item.type === "scroll" ? "前往" : item.type === "consumable" ? "使用" : "装备"}</button>}
                    {item.type !== "consumable" && item.type !== "scroll" && <button disabled={disabled} onClick={() => onCraft(item)}>打造</button>}
                    <button className="recycle-action" disabled={disabled || item.type === "equipment" && item.locked} onClick={() => onRecycle(item)} title={item.type === "orb" ? `获得 ${recycleReward(item).dust} 粉尘` : `获得 ${recycleReward(item).gold} 金币`}>{recyclingName(item.type)}</button></footer>
            </article>;
        }} empty={<div className="empty-bag"><UiIcon name="inventory" /><strong>此分类暂无物品</strong><p>击败敌人或打开宝箱，靠近战利品自动拾取。</p></div>} />
        <footer className="bag-footer"><span className="gold-value"><UiIcon name="coins" /><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span></span><span>{items.length} 格 · {items.reduce((sum, item) => sum + item.size, 0)} 件</span>
            <span>粉尘 <b>{player.orbDust}</b></span><span className="bag-shortcuts">打开时整理 · <kbd>Del</kbd> {recyclingName(filter)}</span>
        </footer>
    </aside>;
}

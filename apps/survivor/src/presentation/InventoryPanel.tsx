import { useMemo, useState } from "react";
import type { PlayerSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { canStack } from "../core/Inventory";
import { compareEquipment } from "../core/EquipmentEvaluation";
import { canUseConsumable, type InventoryItem } from "../core/InventoryItem";
import { SLOT_NAMES } from "../core/Equipment";
import { RARITIES, RARITY_NAMES, type Rarity } from "../core/Loot";
import { ItemIcon, potionDescription } from "./ItemView";
import { OrbSockets, useOrbDrag } from "./OrbDrag";
import { ItemTooltip, powerClass, signed } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onDiscard, onSort, onMerge, onAutoClear, onClearQuality, onRemoveOrb, disabled, paused }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number | undefined) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onDiscard: (id: number) => void;
    readonly onSort: () => void; readonly onMerge: () => void; readonly onAutoClear: (enabled: boolean) => void;
    readonly onClearQuality: (maximum: Rarity) => void; readonly onRemoveOrb: (socket: number) => void; readonly disabled: boolean; readonly paused: boolean;
}) {
    const [filter, setFilter] = useState<InventoryItem["type"]>("equipment");
    const [clearQuality, setClearQuality] = useState<Rarity>("common");
    const drag = useOrbDrag();
    const clearCount = player.inventory.filter(item => item.type === "equipment" && RARITIES.indexOf(item.rarity) <= RARITIES.indexOf(clearQuality)).length;
    const evaluations = useMemo(() => new Map(player.inventory.filter(item => item.type === "equipment").map(item => [item.id, compareEquipment(item, player)])), [player.inventory, player.stats, player.equipment]);
    const items = player.inventory.filter(item => item.type === filter);
    const rules = GAME_CONFIG.inventory[filter];
    const mergeable = filter === "consumable" && items.some((item, index) => item.size < rules.stackSize && items.some((other, j) => j > index && canStack(item, other)));
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div className="window-title"><UiIcon name="inventory" /><div><span className="eyebrow">INVENTORY</span><h2>行囊</h2></div></div>
            <div className={`bag-capacity${items.length === rules.capacity ? " full" : ""}`} aria-label={`${rules.name}容量 ${items.length} / ${rules.capacity}`}><span>{rules.name}{items.length === rules.capacity ? "已满" : "容量"}<b>{items.length}<small> / {rules.capacity}</small></b></span><div><i style={{ width: `${items.length / rules.capacity * 100}%` }} /></div></div>
            <button className="close-button" aria-label="关闭背包" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="bag-toolbar"><div className="bag-tabs">{([['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => { setFilter(id); onSelect(undefined); }}>{name}<span>{player.inventory.filter(item => item.type === id).length}/{GAME_CONFIG.inventory[id].capacity}</span></button>)}</div>
            {filter === "consumable" && <button disabled={disabled || !mergeable} onClick={onMerge}>合并药剂</button>}
            <button className="sort-inventory" disabled={disabled || player.inventory.length === 0} onClick={onSort} title="按品质、等级从高到低整理"><UiIcon name="sort" />一键整理</button>
        </div>
        <div className="bag-cleanup">
            <label><input type="checkbox" checked={player.autoClearEquipment} disabled={disabled} onChange={event => onAutoClear(event.target.checked)} />自动清理</label>
            <small>自动保留战力提升、持平和空部位装备；一键清理按品质移除背包装备</small><span>已清理 <b>{player.clearedEquipment}</b> 件</span>
            {filter === "equipment" && <><label>清理品质<select aria-label="清理装备品质" value={clearQuality} onChange={event => setClearQuality(event.target.value as Rarity)} disabled={disabled}>
                {RARITIES.map(rarity => <option key={rarity} value={rarity}>{RARITY_NAMES[rarity]}及以下（含{RARITY_NAMES[rarity]}）</option>)}
            </select></label><button disabled={disabled || clearCount === 0} onClick={() => onClearQuality(clearQuality)}>一键清理 {clearCount} 件</button></>}
        </div>
        {filter === "orb" && <div className="bag-orb-slots"><OrbSockets player={player} disabled={disabled} onRemove={onRemoveOrb} /><small>拖到槽位嵌入 / 交换 · 双击槽位取下 · 聚焦图标按空格，再按 1–6</small></div>}
        <div className="bag-cards" aria-label="背包物品">{items.map(item => {
            const comparison = evaluations.get(item.id);
            const useDisabled = disabled || item.type === "orb" || item.type === "consumable" && (paused || player.potionRemaining > 0 || !canUseConsumable(item, player));
            return <article key={item.id} tabIndex={0}
                className={`inventory-card rarity-${item.rarity}${item.id === selectedId ? " selected" : ""}`}
                aria-label={`${item.name}${item.type === "equipment" ? `，等级${item.itemLevel}` : ""}`} data-testid="inventory-item" data-item-id={item.id} data-kind={item.type} data-rarity={item.rarity} data-level={item.type === "equipment" ? item.itemLevel : undefined}
                data-clearable={comparison?.canClear ?? false} data-power-delta={comparison?.delta}
                onClick={() => onSelect(item.id)} onFocus={() => onSelect(item.id)}
                onDoubleClick={event => { if (!useDisabled && event.target instanceof Element && !event.target.closest("button")) onUse(item); }}>
                <header className="bag-item-heading"><ItemTooltip item={item} player={player}><button className={`item-icon-trigger${item.type === "orb" ? " orb-drag-trigger" : ""}`} aria-label={`查看${item.name}详情`}
                    onPointerDown={event => { if (item.type === "orb") drag.begin(event, item.id); }} onKeyDown={event => { if (item.type === "orb") drag.keyboard(event, item.id); }}
                    onDoubleClick={() => { if (!useDisabled) onUse(item); }}><ItemIcon item={item} /></button></ItemTooltip><div><strong>{item.name}</strong><small>{item.type === "equipment" ? `${SLOT_NAMES[item.value]} · Lv.${item.itemLevel}` : item.type === "orb" ? "寻宝宝珠" : "恢复药剂"}</small></div></header>
                {comparison && item.type === "equipment" ? <div className="bag-item-rating"><span>评分 <b>{item.score}</b></span><strong className={powerClass(comparison.delta)}>战力 {signed(comparison.delta)}</strong><small>{comparison.canClear ? "可清理" : "保留"}</small></div>
                    : <div className="bag-item-rating"><span>{item.type === "consumable" ? potionDescription(item) : "嵌入后提升寻宝收益"}</span></div>}
                <footer className="item-actions">{item.type === "orb" ? <small>拖动图标嵌入</small> : <button className="primary-action" disabled={useDisabled} onClick={() => onUse(item)}>{item.type === "consumable" ? "使用" : "装备"}</button>}
                    <button className="discard-action" disabled={disabled} onClick={() => onDiscard(item.id)}>丢弃</button></footer>
            </article>;
        })}
            {items.length === 0 && <div className="empty-bag"><UiIcon name="inventory" /><strong>此分类暂无物品</strong><p>击败敌人或打开宝箱，靠近战利品自动拾取。</p></div>}
        </div>
        <footer className="bag-footer"><span className="gold-value"><UiIcon name="coins" /><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span></span><span>{items.length} 格 · {items.reduce((sum, item) => sum + item.size, 0)} 件</span>
            <span className="bag-shortcuts">图标悬停详情 · <kbd>Alt</kbd> 固定 · <kbd>Del</kbd> 丢弃</span>
        </footer>
    </aside>;
}

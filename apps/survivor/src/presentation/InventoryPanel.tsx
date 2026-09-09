import { useMemo, useState } from "react";
import type { PlayerSnapshot } from "../core/CombatState";
import { INVENTORY_CAPACITY } from "../core/CombatConfig";
import { compareEquipment } from "../core/EquipmentEvaluation";
import type { InventoryItem } from "../core/InventoryItem";
import { SLOT_NAMES } from "../core/Equipment";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { ItemIcon } from "./ItemView";
import { ItemTooltip, powerClass, signed } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onDiscard, onSort, onClear, onAutoClear, socket, onSocket, disabled }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number | undefined) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onDiscard: (id: number) => void;
    readonly onSort: () => void; readonly onClear: () => void; readonly onAutoClear: (enabled: boolean) => void;
    readonly socket: number; readonly onSocket: (socket: number) => void; readonly disabled: boolean;
}) {
    const [filter, setFilter] = useState<InventoryItem["kind"]>("equipment");
    const evaluations = useMemo(() => new Map(player.inventory.filter(item => item.kind === "equipment").map(item => [item.id, compareEquipment(item, player)])), [player.inventory, player.stats, player.equipment]);
    const items = player.inventory.filter(item => item.kind === filter);
    const clearable = [...evaluations.values()].filter(value => value.canClear).length;
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div className="window-title"><UiIcon name="inventory" /><div><span className="eyebrow">INVENTORY</span><h2>行囊</h2></div></div>
            <div className={`bag-capacity${player.inventory.length === INVENTORY_CAPACITY ? " full" : ""}`} aria-label={`背包容量 ${player.inventory.length} / ${INVENTORY_CAPACITY}`}><span>{player.inventory.length === INVENTORY_CAPACITY ? "背包已满" : "背包容量"}<b>{player.inventory.length}<small> / {INVENTORY_CAPACITY}</small></b></span><div><i style={{ width: `${player.inventory.length / INVENTORY_CAPACITY * 100}%` }} /></div></div>
            <button className="close-button" aria-label="关闭背包" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="bag-toolbar"><div className="bag-tabs">{([['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => { setFilter(id); onSelect(undefined); }}>{name}<span>{player.inventory.filter(item => item.kind === id).length}</span></button>)}</div>
            <button className="sort-inventory" disabled={disabled || player.inventory.length === 0} onClick={onSort} title="按品质、等级从高到低整理"><UiIcon name="sort" />一键整理</button>
        </div>
        <div className="bag-cleanup"><button className="clear-inventory" disabled={disabled || clearable === 0} onClick={onClear}>清理较弱装备 <b>{clearable}</b></button>
            <label><input type="checkbox" checked={player.autoClearLowLevelEquipment} disabled={disabled} onChange={event => onAutoClear(event.target.checked)} />自动清理低级劣装</label>
            <small>保留战力提升、评分更高、持平和空部位装备</small><span>已清理 <b>{player.clearedEquipment}</b> 件</span>
        </div>
        <div className="bag-cards" aria-label="背包物品">{items.map(item => {
            const comparison = evaluations.get(item.id);
            return <ItemTooltip key={item.id} item={item} player={player}><article tabIndex={0}
                className={`inventory-card rarity-${item.rarity}${item.id === selectedId ? " selected" : ""}`}
                aria-label={`${item.name}，等级${item.itemLevel}`} data-testid="inventory-item" data-item-id={item.id} data-kind={item.kind} data-rarity={item.rarity} data-level={item.itemLevel}
                data-clearable={comparison?.canClear ?? false} data-power-delta={comparison?.delta}
                onClick={() => onSelect(item.id)} onFocus={() => onSelect(item.id)}
                onDoubleClick={event => { if (!disabled && event.target instanceof Element && !event.target.closest("button")) onUse(item); }}>
                <header className="bag-item-heading"><ItemIcon kind={item.kind === "equipment" ? item.slot : item.kind} /><div><strong>{item.name}</strong><small>{item.kind === "equipment" ? SLOT_NAMES[item.slot] : item.kind === "orb" ? "寻宝宝珠" : "恢复药剂"} · Lv.{item.itemLevel} {item.kind === "equipment" && "★".repeat(item.stars)}</small></div></header>
                {comparison && item.kind === "equipment" ? <div className="bag-item-rating"><span>评分 <b>{item.score}</b></span><strong className={powerClass(comparison.delta)}>战力 {signed(comparison.delta)}</strong><small>{comparison.canClear ? "可清理" : "保留"}</small></div>
                    : <div className="bag-item-rating"><span>{item.kind === "consumable" ? `恢复${item.effect === "health" ? "生命" : "法力"} +${item.restore}` : "嵌入后提升寻宝收益"}</span></div>}
                <footer className="item-actions"><button className="primary-action" disabled={disabled} onClick={() => onUse(item)}>{item.kind === "orb" ? `嵌入槽 ${socket + 1}` : item.kind === "consumable" ? "使用" : "装备"}</button>
                    <button className="discard-action" disabled={disabled} onClick={() => onDiscard(item.id)}>丢弃</button></footer>
            </article></ItemTooltip>;
        })}
            {items.length === 0 && <div className="empty-bag"><UiIcon name="inventory" /><strong>此分类暂无物品</strong><p>击败敌人或打开宝箱，靠近战利品自动拾取。</p></div>}
        </div>
        <footer className="bag-footer"><span className="gold-value"><UiIcon name="coins" /><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span></span><span>显示 {items.length} 件</span>
            {filter === "orb" && <label>宝珠目标槽<select aria-label="嵌入宝珠槽" value={socket} onChange={event => onSocket(Number(event.target.value))}>
                {ORB_UNLOCK_LEVELS.map((level, index) => <option key={index} value={index} disabled={player.level < level}>槽 {index + 1}{player.level < level ? ` · Lv.${level}` : ""}</option>)}
            </select></label>}
            <span className="bag-shortcuts">悬停对比 · 双击使用 · <kbd>Del</kbd> 丢弃</span>
        </footer>
    </aside>;
}

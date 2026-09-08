import { useMemo, useState } from "react";
import { INVENTORY_CAPACITY, type PlayerSnapshot } from "../core/CombatSimulation";
import type { InventoryItem } from "../core/InventoryItem";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { ItemDetails, ItemIcon } from "./ItemView";
import { UiIcon } from "./UiIcon";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onDiscard, onSort, onAutoClear, socket, onSocket, disabled }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number | undefined) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onDiscard: (id: number) => void;
    readonly onSort: () => void; readonly onAutoClear: (enabled: boolean) => void;
    readonly socket: number; readonly onSocket: (socket: number) => void; readonly disabled: boolean;
}) {
    const [filter, setFilter] = useState<"all" | InventoryItem["kind"]>("all");
    const items = useMemo(() => player.inventory.filter(item => filter === "all" || item.kind === filter), [filter, player.inventory]);
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div className="window-title"><UiIcon name="inventory" /><div><span className="eyebrow">INVENTORY</span><h2>行囊</h2></div></div>
            <div className={`bag-capacity${player.inventory.length === INVENTORY_CAPACITY ? " full" : ""}`} aria-label={`背包容量 ${player.inventory.length} / ${INVENTORY_CAPACITY}`}><span>{player.inventory.length === INVENTORY_CAPACITY ? "背包已满" : "背包容量"}<b>{player.inventory.length}<small> / {INVENTORY_CAPACITY}</small></b></span><div><i style={{ width: `${player.inventory.length / INVENTORY_CAPACITY * 100}%` }} /></div></div>
            <button className="close-button" aria-label="关闭背包" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="bag-toolbar"><div className="bag-tabs">{([['all', '全部'], ['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => { setFilter(id); onSelect(undefined); }}>{name}<span>{id === "all" ? player.inventory.length : player.inventory.filter(item => item.kind === id).length}</span></button>)}</div>
            <button className="sort-inventory" disabled={disabled || player.inventory.length === 0} onClick={onSort} title="按品质、等级从高到低整理"><UiIcon name="sort" />一键整理</button>
        </div>
        <div className="bag-cleanup"><label><input type="checkbox" checked={player.autoClearLowLevelEquipment} disabled={disabled}
            onChange={event => onAutoClear(event.target.checked)} />自动清理低级装备</label>
            <small>低于 Lv.{player.level} · 仅背包装备</small>
            <span>已清理 <b>{player.clearedEquipment}</b> 件</span>
        </div>
        <div className="bag-cards" aria-label="背包物品">{items.map(item => <article key={item.id} tabIndex={0}
            className={`inventory-card rarity-${item.rarity}${item.id === selectedId ? " selected" : ""}`}
            aria-label={`${item.name}，等级${item.itemLevel}`} data-testid="inventory-item" data-item-id={item.id} data-kind={item.kind} data-rarity={item.rarity} data-level={item.itemLevel}
            onClick={() => onSelect(item.id)} onFocus={() => onSelect(item.id)}
            onDoubleClick={event => {
                if (!disabled && event.target instanceof Element && !event.target.closest("button, input, select")) onUse(item);
            }}>
            <ItemIcon className="bag-item-icon" kind={item.kind === "equipment" ? item.slot : item.kind} />
            <ItemDetails item={item} />
            <footer className="item-actions">
                <button className="primary-action" disabled={disabled} onClick={() => onUse(item)}>{item.kind === "orb" ? `嵌入槽 ${socket + 1}` : item.kind === "consumable" ? "使用" : "装备"}</button>
                <button className="discard-action" disabled={disabled} onClick={() => onDiscard(item.id)}>丢弃</button>
            </footer>
        </article>)}
            {items.length === 0 && <div className="empty-bag"><div className="empty-bag-emblem"><UiIcon name="inventory" /></div><strong>{player.inventory.length === 0 ? "行囊尚空，出发寻宝" : "此分类暂无物品"}</strong><p>{player.inventory.length === 0 ? "击败荒原中的敌人，靠近战利品自动拾取。" : "继续探索，或切换分类查看已有物品。"}</p><small>{player.inventory.length === 0 ? "宝箱与地域领主还会掉落寻宝宝珠" : `背包共 ${player.inventory.length} 件物品`}</small></div>}
        </div>
        <footer className="bag-footer"><span className="gold-value"><UiIcon name="coins" /><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span></span><span>显示 {items.length} 件</span>
            <label>宝珠目标槽<select aria-label="嵌入宝珠槽" value={socket} onChange={event => onSocket(Number(event.target.value))}>
                {ORB_UNLOCK_LEVELS.map((level, index) => <option key={index} value={index} disabled={player.level < level}>槽 {index + 1}{player.level < level ? ` · Lv.${level}` : ""}</option>)}
            </select></label>
            <span className="bag-shortcuts">使用<kbd>Enter</kbd> 丢弃<kbd>Del</kbd></span>
        </footer>
    </aside>;
}

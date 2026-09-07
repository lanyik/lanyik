import { useMemo, useState } from "react";
import { INVENTORY_CAPACITY, type PlayerSnapshot } from "../core/CombatSimulation";
import type { InventoryItem } from "../core/InventoryItem";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { ItemDetails, ItemIcon } from "./ItemView";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onDiscard, onSort, onAutoClear, socket, onSocket, disabled }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number | undefined) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onDiscard: (id: number) => void;
    readonly onSort: () => void; readonly onAutoClear: (enabled: boolean) => void;
    readonly socket: number; readonly onSocket: (socket: number) => void; readonly disabled: boolean;
}) {
    const [filter, setFilter] = useState<"all" | InventoryItem["kind"]>("all");
    const items = useMemo(() => player.inventory.filter(item => filter === "all" || item.kind === filter), [filter, player.inventory]);
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div><span className="eyebrow">INVENTORY</span><h2>背包 <small>{player.inventory.length} / {INVENTORY_CAPACITY}</small></h2></div><button className="close-button" aria-label="关闭背包" onClick={onClose}>×</button></header>
        <div className="bag-toolbar"><div className="bag-tabs">{([['all', '全部'], ['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => { setFilter(id); onSelect(undefined); }}>{name}</button>)}</div>
            <button className="sort-inventory" disabled={disabled || player.inventory.length === 0} onClick={onSort}>一键整理 <small>品质 ↓ 等级 ↓</small></button>
        </div>
        <div className="bag-cleanup"><label><input type="checkbox" checked={player.autoClearLowLevelEquipment} disabled={disabled}
            onChange={event => onAutoClear(event.target.checked)} />自动清理低级装备</label>
            <small>清理低于角色 Lv.{player.level} 的背包装备；保留已穿戴装备、宝珠和药剂</small>
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
                <button disabled={disabled} onClick={() => onUse(item)}>{item.kind === "orb" ? `嵌入槽 ${socket + 1}` : item.kind === "consumable" ? "使用" : "装备"}</button>
                <button disabled={disabled} onClick={() => onDiscard(item.id)}>丢弃</button>
            </footer>
        </article>)}
            {items.length === 0 && <div className="empty-bag">{player.inventory.length === 0 ? "背包暂无物品" : "此分类暂无物品"}</div>}
        </div>
        <footer className="bag-footer"><span className="gold-value">金币 {player.gold}</span><span>显示 {items.length} 件</span>
            <label>宝珠目标槽<select aria-label="嵌入宝珠槽" value={socket} onChange={event => onSocket(Number(event.target.value))}>
                {ORB_UNLOCK_LEVELS.map((level, index) => <option key={index} value={index} disabled={player.level < level}>槽 {index + 1}{player.level < level ? ` · Lv.${level}` : ""}</option>)}
            </select></label>
            <span className="bag-shortcuts">使用<kbd>Enter</kbd> 丢弃<kbd>Del</kbd></span>
        </footer>
    </aside>;
}

import { useMemo, useState } from "react";
import { INVENTORY_CAPACITY, type PlayerSnapshot } from "../core/CombatSimulation";
import type { InventoryItem } from "../core/InventoryItem";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { ItemDetails, ItemIcon } from "./ItemView";

export function InventoryPanel({ player, selectedId, onSelect, onClose, onUse, onDiscard, socket, onSocket, disabled }: {
    readonly player: PlayerSnapshot; readonly selectedId: number | undefined; readonly onSelect: (id: number) => void;
    readonly onClose: () => void; readonly onUse: (item: InventoryItem) => void; readonly onDiscard: (id: number) => void;
    readonly socket: number; readonly onSocket: (socket: number) => void; readonly disabled: boolean;
}) {
    const [filter, setFilter] = useState<"all" | InventoryItem["kind"]>("all");
    const items = useMemo(() => player.inventory.filter(item => filter === "all" || item.kind === filter), [filter, player.inventory]);
    const selected = player.inventory.find(item => item.id === selectedId);
    return <aside className="inventory-window window" role="dialog" aria-label="背包">
        <header className="window-heading"><div><span className="eyebrow">INVENTORY</span><h2>背包 <small>{player.inventory.length} / {INVENTORY_CAPACITY}</small></h2></div><button className="close-button" aria-label="关闭背包" onClick={onClose}>×</button></header>
        <div className="bag-tabs">{([['all', '全部'], ['equipment', '装备'], ['orb', '宝珠'], ['consumable', '药剂']] as const).map(([id, name]) =>
            <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{name}</button>)}</div>
        <div className="bag-grid">{Array.from({ length: INVENTORY_CAPACITY }, (_, index) => {
            const item = items[index];
            return <button className={`bag-slot rarity-${item?.rarity ?? "common"}${item && item.id === selectedId ? " selected" : ""}`} key={index}
                disabled={!item} aria-label={item ? `${item.name}，等级${item.itemLevel}` : `空背包格 ${index + 1}`} data-testid={item ? "inventory-item" : undefined}
                onClick={() => item && onSelect(item.id)} onDoubleClick={() => item && !disabled && onUse(item)}>
                {item && <><ItemIcon kind={item.kind === "equipment" ? item.slot : item.kind} /><small>{item.itemLevel}</small>
                    {item.kind === "equipment" && <span className="bag-stars">{"★".repeat(item.stars)}</span>}</>}
            </button>;
        })}</div>
        <div className="bag-inspector">{selected ? <ItemDetails item={selected} /> : <div className="empty-inspector">物品详情</div>}</div>
        <footer className="bag-actions"><span className="gold-value">金币 {player.gold}</span>
            {selected?.kind === "orb" && <select aria-label="嵌入宝珠槽" value={socket} onChange={event => onSocket(Number(event.target.value))}>
                {ORB_UNLOCK_LEVELS.map((level, index) => <option key={index} value={index} disabled={player.level < level}>槽 {index + 1}{player.level < level ? ` · Lv.${level}` : ""}</option>)}
            </select>}
            <button disabled={!selected || disabled} onClick={() => selected && onUse(selected)}>{selected?.kind === "orb" ? "嵌入" : selected?.kind === "consumable" ? "使用" : "装备"}<kbd>Enter</kbd></button>
            <button disabled={!selected || disabled} onClick={() => selected && onDiscard(selected.id)}>丢弃<kbd>Del</kbd></button>
        </footer>
    </aside>;
}

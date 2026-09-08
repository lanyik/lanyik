import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { InventoryItem } from "../core/InventoryItem";
import { compareEquipment, type EquipmentContext } from "../core/EquipmentEvaluation";
import { ItemDetails, statValue } from "./ItemView";

export const signed = (value: number): string => value > 0 ? `+${value}` : String(value);
export const powerClass = (value: number): string => value > 0 ? "power-up" : value < 0 ? "power-down" : "power-equal";

export function EquipmentDetails({ item, player }: { readonly item: InventoryItem; readonly player: EquipmentContext }) {
    const comparison = item.kind === "equipment" ? compareEquipment(item, player) : undefined;
    const equipped = comparison?.current?.id === item.id;
    return <>
        {comparison && <div className={`comparison-summary ${powerClass(comparison.delta)}`}>
            <strong>{equipped ? "已装备" : comparison.delta > 0 ? "换装提升" : comparison.delta < 0 ? "换装降低" : "战力持平"}</strong>
            {!equipped && <><b>战力 {signed(comparison.delta)}</b><small>换装后 {comparison.power} · 装备评分 {signed(comparison.scoreDelta)}</small>
                <span>{comparison.canClear ? "可一键清理" : "清理时保留"}{!comparison.current ? " · 当前部位为空" : ""}</span></>}
        </div>}
        <div className={`comparison-items${comparison?.current && !equipped ? " has-current" : ""}`}>
            <section>{comparison && !equipped && <h3>待装备</h3>}<ItemDetails item={item} /></section>
            {comparison?.current && !equipped && <section><h3>当前装备</h3><ItemDetails item={comparison.current} /></section>}
        </div>
        {comparison && !equipped && <div className="comparison-stats" aria-label="换装后核心属性">
            <span>攻击 <b>{statValue("damage", player.stats.damage)} → {statValue("damage", comparison.stats.damage)}</b></span>
            <span>防御 <b>{statValue("armor", player.stats.armor)} → {statValue("armor", comparison.stats.armor)}</b></span>
            <span>生命 <b>{player.stats.maxHealth} → {comparison.stats.maxHealth}</b></span>
        </div>}
    </>;
}

/** Portal avoids panel clipping; measured placement also supports long, high-rarity items. */
export function ItemTooltip({ item, player, className = "", children }: {
    readonly item: InventoryItem | undefined; readonly player: EquipmentContext;
    readonly className?: string; readonly children: ReactElement<{ "aria-describedby"?: string }>;
}) {
    const id = useId();
    const anchor = useRef<HTMLDivElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: window.innerHeight - 16 });
    const cancel = () => clearTimeout(timer.current);
    const show = () => { cancel(); setOpen(true); };
    const hide = () => { cancel(); timer.current = setTimeout(() => setOpen(false), 120); };
    useEffect(() => () => clearTimeout(timer.current), []);
    useLayoutEffect(() => {
        if (!open || !item || !anchor.current || !popup.current) return;
        const place = () => {
            const box = anchor.current!.getBoundingClientRect();
            if (!box.width || !box.height) { setOpen(false); return; }
            const tip = popup.current!.getBoundingClientRect();
            const rightFits = box.right + tip.width + 16 <= window.innerWidth;
            const leftFits = box.left >= tip.width + 16;
            if (rightFits || leftFits) {
                setPosition({ left: rightFits ? box.right + 8 : box.left - tip.width - 8,
                    top: Math.max(8, Math.min(box.top, window.innerHeight - tip.height - 8)), maxHeight: window.innerHeight - 16 });
            } else {
                // A wide tooltip must never cover its trigger and intercept the pending click.
                // Keep panel controls and the narrow-screen navigation reachable as well.
                const panel = anchor.current!.closest(".window");
                const contentTop = panel?.querySelector(".bag-cards")?.getBoundingClientRect().top
                    ?? panel?.querySelector(".window-heading")?.getBoundingClientRect().bottom ?? 8;
                const navigation = document.querySelector(".interface-menu")?.getBoundingClientRect();
                const bottom = navigation && navigation.width > window.innerWidth / 2 ? navigation.top - 8 : window.innerHeight - 8;
                const below = bottom - box.bottom - 8;
                const above = box.top - Math.max(8, contentTop) - 8;
                const useBelow = below >= tip.height || below >= above;
                const maxHeight = Math.max(0, useBelow ? below : above);
                setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - tip.width - 8)),
                    top: useBelow ? box.bottom + 8 : box.top - Math.min(tip.height, maxHeight) - 8, maxHeight });
            }
        };
        const observer = new ResizeObserver(place);
        observer.observe(popup.current);
        observer.observe(anchor.current);
        place();
        window.addEventListener("resize", place);
        const scroll = (event: Event) => { if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) setOpen(false); };
        window.addEventListener("scroll", scroll, true);
        return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", scroll, true); };
    }, [open, item?.id]);
    return <div ref={anchor} className={`item-tooltip-anchor ${className}`} onPointerEnter={show} onPointerLeave={hide}
        onFocus={show} onBlur={hide} onKeyDown={event => { if (event.key === "Escape" && open) { setOpen(false); event.stopPropagation(); } }}>
        {cloneElement(children, { "aria-describedby": open && item ? id : undefined })}
        {open && item && createPortal(<div ref={popup} id={id} role="tooltip" className={`equipment-tooltip${item.kind === "equipment" && player.equipment[item.slot] && player.equipment[item.slot]?.id !== item.id ? " comparing" : ""}`}
            style={position} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
            <EquipmentDetails item={item} player={player} />
        </div>, document.body)}
    </div>;
}

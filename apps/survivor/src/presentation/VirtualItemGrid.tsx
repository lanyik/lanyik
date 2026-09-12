import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A bounded visible window plus one row on either side; no off-screen icon animations. */
export function VirtualItemGrid<T extends { readonly id: number }>({ items, className, label, minWidth, rowHeight, renderItem, empty }: {
    items: readonly T[]; className: string; label: string; minWidth: number; rowHeight: number; renderItem: (item: T) => ReactNode; empty: ReactNode;
}) {
    const element = useRef<HTMLDivElement>(null), [viewport, setViewport] = useState({ width: 360, height: 350, top: 0 });
    const measured = useRef(viewport), pendingScroll = useRef<number | undefined>(undefined);
    const countColumns = (width: number) => Math.max(2, Math.floor((width + 8) / (minWidth + 8)));
    useLayoutEffect(() => {
        const node = element.current!, measure = () => {
            if (node.clientWidth <= 20) return;
            const value = measured.current, next = { width: node.clientWidth - 20, height: node.clientHeight, top: node.scrollTop };
            const before = countColumns(value.width), after = countColumns(next.width), stride = rowHeight + 8;
            if (before !== after) {
                next.top = Math.floor(Math.floor(value.top / stride) * before / after) * stride + value.top % stride;
                pendingScroll.current = next.top;
            }
            if (value.width !== next.width || value.height !== next.height || value.top !== next.top) { measured.current = next; setViewport(next); }
        };
        const observer = new ResizeObserver(measure); observer.observe(node); measure();
        node.addEventListener("scroll", measure, { passive: true });
        return () => { observer.disconnect(); node.removeEventListener("scroll", measure); };
    }, []);
    useLayoutEffect(() => { if (pendingScroll.current !== undefined) { element.current!.scrollTop = pendingScroll.current; pendingScroll.current = undefined; } }, [viewport]);
    const columns = countColumns(viewport.width), stride = rowHeight + 8;
    const rows = Math.ceil(items.length / columns), first = Math.max(0, Math.min(rows - 1, Math.floor(viewport.top / stride) - 1));
    const last = Math.min(rows, first + Math.ceil(viewport.height / stride) + 3), width = (viewport.width - (columns - 1) * 8) / columns;
    return <div ref={element} className={`${className} virtual-item-grid`} role="list" aria-label={label} data-total-items={items.length}>
        {!items.length ? empty : <div className="virtual-grid-content" style={{ height: rows * stride - 8 }}>{items.slice(first * columns, last * columns).map((item, offset) => {
            const index = first * columns + offset;
            return <div key={item.id} className="virtual-grid-cell" role="listitem" aria-posinset={index + 1} aria-setsize={items.length} style={{ width, height: rowHeight, transform: `translate(${index % columns * (width + 8)}px, ${Math.floor(index / columns) * stride}px)` }}>{renderItem(item)}</div>;
        })}</div>}
    </div>;
}

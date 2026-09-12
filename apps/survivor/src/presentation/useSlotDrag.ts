import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

interface Drag<T> { readonly value: T; readonly source: HTMLElement; readonly pointer: number; readonly x: number; readonly y: number; started: boolean }

/** Shared captured-pointer/keyboard interaction for internal slot assignments. */
export function useSlotDrag<T>({ attribute, slots, disabled, canEquip, equip, name }: {
    readonly attribute: string; readonly slots: number; readonly disabled: boolean;
    readonly canEquip: (id: T, slot?: number) => boolean; readonly equip: (id: T, slot: number) => void; readonly name: (id: T) => string;
}) {
    const drag = useRef<Drag<T> | undefined>(undefined), ghost = useRef<HTMLDivElement>(null), suppressClick = useRef(false);
    const position = useRef({ x: 0, y: 0 }), latest = useRef({ disabled, canEquip, equip, name });
    latest.current = { disabled, canEquip, equip, name };
    const [dragging, setDragging] = useState<T>(), [over, setOver] = useState(-1), [announcement, setAnnouncement] = useState("");
    const allowed = (id: T, slot?: number) => !latest.current.disabled && latest.current.canEquip(id, slot);
    const show = (current: Drag<T>) => {
        current.started = true; document.documentElement.setAttribute(`data-${attribute}-dragging`, "");
        window.dispatchEvent(new CustomEvent("icon-drag-start", { detail: attribute }));
        setDragging(current.value); setAnnouncement(`已拿起${latest.current.name(current.value)}，拖到槽位，或按 1 到 ${slots} 装配`);
    };
    const finish = (slot = -1, suppress = false) => {
        const current = drag.current; drag.current = undefined;
        if (current && current.pointer >= 0 && current.source.hasPointerCapture(current.pointer)) current.source.releasePointerCapture(current.pointer);
        document.documentElement.removeAttribute(`data-${attribute}-dragging`); setDragging(undefined); setOver(-1);
        if (!current?.started) return;
        suppressClick.current = suppress && current.pointer >= 0;
        if (slot >= 0 && slot < slots && allowed(current.value, slot) && current.source.isConnected) {
            latest.current.equip(current.value, slot); setAnnouncement(`已放入槽位 ${slot + 1}`);
        } else setAnnouncement("已取消装配");
    };
    useEffect(() => {
        const targetAt = (x: number, y: number) => {
            const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-${attribute}-slot]`);
            return slot ? Number(slot.getAttribute(`data-${attribute}-slot`)) : -1;
        };
        const move = (event: PointerEvent) => {
            const current = drag.current;
            if (!current || current.pointer !== event.pointerId) return;
            if (!current.source.isConnected || !allowed(current.value)) { finish(); return; }
            position.current = { x: event.clientX, y: event.clientY };
            if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 6) show(current);
            if (!current.started) return;
            event.preventDefault();
            if (ghost.current) ghost.current.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
            setOver(targetAt(event.clientX, event.clientY));
        };
        const up = (event: PointerEvent) => { if (drag.current?.pointer === event.pointerId) finish(targetAt(event.clientX, event.clientY), true); };
        const cancel = () => finish();
        const anotherDrag = (event: Event) => { if ((event as CustomEvent<string>).detail !== attribute && drag.current) finish(); };
        const down = () => { suppressClick.current = false; };
        const lost = (event: PointerEvent) => { if (drag.current?.pointer === event.pointerId) finish(); };
        const key = (event: KeyboardEvent) => {
            if (!drag.current?.started || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.code !== "Escape" && (!/^Digit[1-9]$/.test(event.code) || Number(event.code.slice(-1)) > slots)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            finish(event.code === "Escape" ? -1 : Number(event.code.slice(-1)) - 1, true);
        };
        const click = (event: MouseEvent) => {
            if (!suppressClick.current) return;
            suppressClick.current = false; event.preventDefault(); event.stopImmediatePropagation();
        };
        window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel);
        window.addEventListener("pointerdown", down, true); window.addEventListener("lostpointercapture", lost, true);
        window.addEventListener("keydown", key, true); window.addEventListener("click", click, true);
        window.addEventListener("icon-drag-start", anotherDrag);
        return () => {
            window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel);
            window.removeEventListener("pointerdown", down, true); window.removeEventListener("lostpointercapture", lost, true);
            window.removeEventListener("keydown", key, true); window.removeEventListener("click", click, true);
            window.removeEventListener("icon-drag-start", anotherDrag);
            const current = drag.current; drag.current = undefined;
            if (current && current.pointer >= 0 && current.source.hasPointerCapture(current.pointer)) current.source.releasePointerCapture(current.pointer);
            document.documentElement.removeAttribute(`data-${attribute}-dragging`);
        };
    }, [attribute, slots]);
    useEffect(() => {
        const current = drag.current;
        if (current && (!current.source.isConnected || !allowed(current.value))) finish();
    });
    return { dragging, over, ghost, position: position.current, announcement,
        begin(event: ReactPointerEvent<HTMLElement>, id: T) {
            if (event.button !== 0 || !allowed(id)) return;
            if (drag.current) finish();
            suppressClick.current = false;
            drag.current = { value: id, source: event.currentTarget, pointer: event.pointerId, x: event.clientX, y: event.clientY, started: false };
            position.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
        },
        keyboard(event: ReactKeyboardEvent<HTMLElement>, id: T) {
            if (event.code !== "Space" || !allowed(id)) return;
            event.preventDefault(); event.stopPropagation();
            if (drag.current) finish();
            const box = event.currentTarget.getBoundingClientRect(); position.current = { x: box.right, y: box.top };
            drag.current = { value: id, source: event.currentTarget, pointer: -1, x: box.right, y: box.top, started: false }; show(drag.current);
        }
    };
}

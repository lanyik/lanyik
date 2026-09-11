import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CombatCommand } from "../core/CombatCommand";
import type { CombatSnapshot } from "../core/CombatState";
import { SKILLS, type SkillId } from "../core/Skills";
import { SkillIcon } from "./SkillView";

interface Drag { readonly type: "skill"; readonly value: SkillId; readonly source: HTMLElement; readonly pointer: number;
    readonly x: number; readonly y: number; started: boolean }
interface DragContext {
    readonly dragging: SkillId | undefined; readonly over: number;
    begin(event: ReactPointerEvent<HTMLElement>, id: SkillId): void;
    keyboard(event: ReactKeyboardEvent<HTMLElement>, id: SkillId): void;
}
const Context = createContext<DragContext | undefined>(undefined);
export function useSkillDrag(): DragContext {
    const context = useContext(Context);
    if (!context) throw new Error("Skill dragging requires its application provider");
    return context;
}

/** Pointer capture supports mouse, pen and touch without accepting external drag payloads. */
export function SkillDragProvider({ player, disabled, dispatch, children }: {
    readonly player: CombatSnapshot["player"] | undefined; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly children: ReactNode;
}) {
    const drag = useRef<Drag | undefined>(undefined), ghost = useRef<HTMLDivElement>(null), suppressClick = useRef(false);
    const ghostPosition = useRef({ x: 0, y: 0 });
    const latest = useRef({ player, disabled, dispatch }); latest.current = { player, disabled, dispatch };
    const [dragging, setDragging] = useState<SkillId>(), [over, setOver] = useState(-1), [announcement, setAnnouncement] = useState("");
    const canEquip = (id: SkillId) => !latest.current.disabled && !!latest.current.player && latest.current.player.level >= SKILLS[id].unlock;
    const show = (current: Drag) => {
        current.started = true; document.documentElement.setAttribute("data-skill-dragging", "");
        window.dispatchEvent(new Event("icon-drag-start"));
        setDragging(current.value); setAnnouncement(`已拿起${SKILLS[current.value].name}，拖到槽位，或按 1 到 4 装配`);
    };
    const finish = (slot = -1, suppress = false) => {
        const current = drag.current;
        drag.current = undefined;
        if (current && current.pointer >= 0 && current.source.hasPointerCapture(current.pointer)) current.source.releasePointerCapture(current.pointer);
        document.documentElement.removeAttribute("data-skill-dragging");
        setDragging(undefined); setOver(-1);
        if (!current?.started) return;
        suppressClick.current = suppress && current.pointer >= 0;
        if (slot >= 0 && slot < 4 && canEquip(current.value) && current.source.isConnected) {
            latest.current.dispatch({ type: "equip-skill", skill: current.value, slot });
            setAnnouncement(`${SKILLS[current.value].name}已放入槽位 ${slot + 1}`);
        } else setAnnouncement("已取消装配");
    };
    useEffect(() => {
        const targetAt = (x: number, y: number) => {
            const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-skill-slot]");
            return slot ? Number(slot.dataset.skillSlot) : -1;
        };
        const move = (event: PointerEvent) => {
            const current = drag.current;
            if (!current || current.pointer !== event.pointerId) return;
            ghostPosition.current.x = event.clientX; ghostPosition.current.y = event.clientY;
            if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 6) show(current);
            if (!current.started) return;
            event.preventDefault();
            if (ghost.current) ghost.current.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
            setOver(targetAt(event.clientX, event.clientY));
        };
        const up = (event: PointerEvent) => { if (drag.current?.pointer === event.pointerId) finish(targetAt(event.clientX, event.clientY), true); };
        const cancel = () => finish();
        const down = () => { suppressClick.current = false; };
        const lost = (event: PointerEvent) => { if (drag.current?.pointer === event.pointerId) finish(); };
        const key = (event: KeyboardEvent) => {
            if (!drag.current?.started || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.code !== "Escape" && !/^Digit[1-4]$/.test(event.code)) return;
            event.preventDefault(); event.stopImmediatePropagation();
            finish(event.code === "Escape" ? -1 : Number(event.code.slice(-1)) - 1);
        };
        const click = (event: MouseEvent) => {
            if (!suppressClick.current) return;
            suppressClick.current = false; event.preventDefault(); event.stopImmediatePropagation();
        };
        window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel);
        window.addEventListener("pointerdown", down, true); window.addEventListener("lostpointercapture", lost, true);
        window.addEventListener("keydown", key, true); window.addEventListener("click", click, true);
        return () => {
            window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel);
            window.removeEventListener("pointerdown", down, true); window.removeEventListener("lostpointercapture", lost, true);
            window.removeEventListener("keydown", key, true); window.removeEventListener("click", click, true);
            document.documentElement.removeAttribute("data-skill-dragging");
        };
    }, []);
    useEffect(() => { if (disabled || !player) finish(); }, [disabled, !!player]);
    return <Context.Provider value={{ dragging, over,
        begin(event, id) {
            if (event.button !== 0 || !canEquip(id)) return;
            if (drag.current) finish();
            suppressClick.current = false;
            drag.current = { type: SKILLS[id].type, value: SKILLS[id].value, source: event.currentTarget, pointer: event.pointerId,
                x: event.clientX, y: event.clientY, started: false };
            ghostPosition.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        keyboard(event, id) {
            if (event.code !== "Space" || !canEquip(id)) return;
            event.preventDefault(); event.stopPropagation();
            const box = event.currentTarget.getBoundingClientRect();
            ghostPosition.current = { x: box.right, y: box.top };
            drag.current = { type: "skill", value: id, source: event.currentTarget, pointer: -1, x: box.right, y: box.top, started: false };
            show(drag.current);
        }
    }}>
        {children}<span className="sr-only" role="status" aria-live="polite">{announcement}</span>
        {dragging && createPortal(<div className="skill-drag-ghost" ref={ghost} style={{ transform: `translate(${ghostPosition.current.x + 14}px, ${ghostPosition.current.y + 14}px)` }}>
            <SkillIcon id={dragging} /><span>{SKILLS[dragging].name}</span></div>, document.body)}
    </Context.Provider>;
}

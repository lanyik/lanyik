import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PlayerSnapshot } from "../core/CombatState";
import type { CombatCommand } from "../core/CombatCommand";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { useSlotDrag } from "./useSlotDrag";
import { ItemIcon } from "./ItemView";
import { ItemTooltip } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";

const Context = createContext<ReturnType<typeof useSlotDrag<number>> | undefined>(undefined);
export function useOrbDrag() {
    const context = useContext(Context);
    if (!context) throw new Error("Orb dragging requires its application provider");
    return context;
}
export function OrbDragProvider({ player, disabled, dispatch, children }: {
    readonly player: PlayerSnapshot | undefined; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly children: ReactNode;
}) {
    const find = (id: number) => player?.inventory.find(item => item.id === id && item.type === "orb") ?? player?.orbs.find(item => item?.id === id);
    const drag = useSlotDrag<number>({ attribute: "orb", slots: ORB_UNLOCK_LEVELS.length, disabled: disabled || !player,
        canEquip: (id, slot) => !!find(id) && !!player && (slot === undefined || player.level >= ORB_UNLOCK_LEVELS[slot]),
        equip: (id, socket) => dispatch({ type: "equip-orb", itemId: id, socket }), name: id => find(id)!.name });
    const item = drag.dragging === undefined ? undefined : find(drag.dragging);
    return <Context.Provider value={drag}>{children}<span className="sr-only" role="status" aria-live="polite">{drag.announcement}</span>
        {item && createPortal(<div className="skill-drag-ghost" ref={drag.ghost} style={{ transform: `translate(${drag.position.x + 14}px, ${drag.position.y + 14}px)` }}><ItemIcon item={item} /><span>{item.name}</span></div>, document.body)}
    </Context.Provider>;
}

export function OrbSockets({ player, disabled, onInspect, onRemove }: {
    readonly player: PlayerSnapshot; readonly disabled: boolean; readonly onInspect?: (id: number | undefined) => void; readonly onRemove: (socket: number) => void;
}) {
    const drag = useOrbDrag();
    return <div className="orb-sockets" aria-label="宝珠栏">{ORB_UNLOCK_LEVELS.map((level, index) => {
        const orb = player.orbs[index], locked = player.level < level;
        return <div key={index} data-orb-slot={index} className={`orb-socket rarity-${orb?.rarity ?? "common"}${locked ? " locked" : ""}${!locked && drag.dragging !== undefined && drag.over === index ? " drag-over" : ""}`}>
            <ItemTooltip item={orb} player={player}><button className="item-icon-trigger orb-drag-trigger" disabled={disabled || locked}
                aria-label={`宝珠槽 ${index + 1}${locked ? `，${level}级解锁` : orb ? `，${orb.name}` : "，空"}`}
                onPointerDown={event => { if (orb) drag.begin(event, orb.id); }} onKeyDown={event => { if (orb) drag.keyboard(event, orb.id); }}
                onClick={() => onInspect?.(orb?.id)} onDoubleClick={() => onRemove(index)}>
                {locked ? <UiIcon name="lock" /> : <ItemIcon item={orb} type="orb" value="fortune" />}</button></ItemTooltip>
            <small>{locked ? `Lv.${level}` : `槽 ${index + 1}`}</small>
        </div>;
    })}</div>;
}

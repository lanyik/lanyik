import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CombatCommand } from "../core/CombatCommand";
import type { PlayerSnapshot } from "../core/CombatState";
import { SKILLS, type SkillId } from "../core/Skills";
import { GAME_CONFIG } from "../core/GameConfig";
import { SkillIcon } from "./SkillView";
import { useSlotDrag } from "./useSlotDrag";

const Context = createContext<ReturnType<typeof useSlotDrag<SkillId>> | undefined>(undefined);
export function useSkillDrag() {
    const context = useContext(Context);
    if (!context) throw new Error("Skill dragging requires its application provider");
    return context;
}
export function SkillDragProvider({ player, disabled, dispatch, children }: {
    readonly player: PlayerSnapshot | undefined; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly children: ReactNode;
}) {
    const drag = useSlotDrag<SkillId>({ attribute: "skill", slots: GAME_CONFIG.skills.slots, disabled: disabled || !player,
        canEquip: id => !!player && player.level >= SKILLS[id].unlock,
        equip: (skill, slot) => dispatch({ type: "equip-skill", skill, slot }), name: id => SKILLS[id].name });
    return <Context.Provider value={drag}>{children}<span className="sr-only" role="status" aria-live="polite">{drag.announcement}</span>
        {drag.dragging && createPortal(<div className="skill-drag-ghost" ref={drag.ghost} style={{ transform: `translate(${drag.position.x + 14}px, ${drag.position.y + 14}px)` }}>
            <SkillIcon id={drag.dragging} /><span>{SKILLS[drag.dragging].name}</span></div>, document.body)}
    </Context.Provider>;
}

import type { CSSProperties } from "react";
import type { CombatSnapshot } from "../core/CombatState";
import { SKILLS, skillValues } from "../core/Skills";
import { SkillIcon, SkillTooltip } from "./SkillView";
import { useSkillDrag } from "./SkillDrag";

export function SkillSlot({ index, player, blocked, panel = false, cast }: {
    readonly index: number; readonly player: CombatSnapshot["player"]; readonly blocked: boolean;
    readonly panel?: boolean; readonly cast?: () => void;
}) {
    const id = player.skills.loadout[index], d = SKILLS[id], drag = useSkillDrag();
    const remaining = player.skills.remaining[id], cooldown = skillValues(id, player.skills.ranks[id], player.stats).cooldown;
    const unavailable = blocked || player.skills.dashing || remaining > 0 || player.mana < d.mana || id === "ward" && player.skills.ward > 0;
    return <div data-skill-slot={index} data-drop-active={drag.over === index} className={`${panel ? "loadout-slot" : "skill-slot"} ${id}-skill`}
        style={{ "--skill-color": d.color, "--cooldown": `${Math.min(100, remaining / cooldown * 100)}%` } as CSSProperties}>
        <kbd>{index + 1}</kbd>
        <SkillTooltip id={id} player={player}><button className="skill-icon-trigger item-icon-trigger" aria-label={`${index + 1} ${d.name}`}
            aria-disabled={!panel && unavailable} onPointerDown={event => drag.begin(event, id)} onKeyDown={event => drag.keyboard(event, id)}
            onClick={() => { if (!panel && !unavailable) cast?.(); }}>
            <SkillIcon id={id} rank={player.skills.ranks[id]} />
            {!panel && remaining > 0 && <span className="skill-cooldown-mask" />}
        </button></SkillTooltip>
        <span className="skill-slot-name">{d.name}</span><small>{panel ? d.role : remaining > 0 ? `${remaining.toFixed(1)}s` : `${d.mana} 法力`}</small>
    </div>;
}

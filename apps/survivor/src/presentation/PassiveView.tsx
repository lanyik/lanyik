import type { CSSProperties } from "react";
import type { CombatCommand } from "../core/CombatCommand";
import type { PlayerSnapshot } from "../core/CombatState";
import { BONUS_INFO, type BonusId } from "../core/Equipment";
import { PASSIVES, PASSIVE_UNLOCK_LEVELS, passiveNodeId, type PassiveId } from "../core/PassiveSkills";
import { nodeIndex } from "../core/SkillBuild";
import { IconTooltip } from "./ItemTooltip";
import { statValue } from "./ItemView";

export function PassiveIcon({ id }: { readonly id: PassiveId }) {
    const definition = PASSIVES[id];
    return <svg className="passive-art" viewBox="0 0 48 48" aria-hidden="true" style={{ color: definition.color }}>
        <path d="M24 3L42 13V35L24 45L6 35V13Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" />
        <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <text x="24" y="31" textAnchor="middle" fontSize="25" fill="currentColor">{definition.glyph}</text>
    </svg>;
}
/** Values before existing caps/diminishing returns; both benefits and costs are explicit. */
export function PassiveNumbers({ id, rank, preview }: { readonly id: PassiveId; readonly rank: number; readonly preview?: number }) {
    const definition = PASSIVES[id];
    const value = (amount: number, format: (n: number) => string) => preview === undefined ? format(amount * rank) : `${format(amount * rank)} → ${format(amount * preview)}`;
    return <dl className="passive-numbers">
        {definition.collectAll && <div><dt>自动全部拾取</dt><dd>{preview !== undefined ? (preview ? "解锁后装配生效" : "未学习") : "常驻"}</dd></div>}
        {(["quality", "stars", "quantity"] as const).filter(key => definition.find?.[key]).map(key => <div key={key}><dt>{{ quality: "品质寻宝", stars: "星级寻宝", quantity: "数量寻宝" }[key]}</dt><dd className="power-up">{value(definition.find![key]!, n => `+${n}`)}</dd></div>)}
        {(Object.keys(definition.bonuses) as BonusId[]).map(key => {
            const amount = definition.bonuses[key]!, format = (n: number) => `${n < 0 || key === "shieldRecovery" && n > 0 ? "−" : "+"}${statValue(key, Math.abs(n))}`;
            return <div key={key}><dt>{BONUS_INFO[key].name}</dt><dd className={amount < 0 ? "power-down" : "power-up"}>{value(amount, format)}</dd></div>;
        })}
    </dl>;
}
export function PassiveSlots({ player, dispatch, blocked = false }: {
    readonly player: PlayerSnapshot; readonly dispatch?: (command: CombatCommand) => void; readonly blocked?: boolean;
}) {
    return <div className={"passive-slots" + (dispatch ? " panel-passives" : "")} role="group" aria-label={dispatch ? "被动装配槽" : "常驻被动"}>
        {player.skills.passives.map((id, index) => {
            const unlock = PASSIVE_UNLOCK_LEVELS[index], locked = player.level < unlock;
            const rank = id ? player.skills.build.ranks[nodeIndex(passiveNodeId(id))] : 0;
            return <div className="passive-slot" data-passive-slot={index} data-locked={locked} key={index} style={id ? { "--passive-color": PASSIVES[id].color } as CSSProperties : undefined}>
                <IconTooltip identity={`passive-slot:${index}:${id}`} content={<div className="passive-details"><h3>{id ? PASSIVES[id].name : `被动槽 ${index + 1}`}</h3>
                    <p>{locked ? `${unlock} 级解锁` : id ? `Lv.${rank} · 已装配 · 常驻生效` : "学习通用被动后，在节点详情选择此槽位"}</p>
                    {id && <><p>{PASSIVES[id].description}</p><PassiveNumbers id={id} rank={rank} /></>}<small>家园可装卸 · 不占主动槽 · 无需施法</small></div>}>
                    <span tabIndex={0} className="passive-slot-content" aria-label={`被动槽 ${index + 1} · ${locked ? `${unlock}级解锁` : id ? PASSIVES[id].name + ` ${rank}级` : "空槽"}`}>
                        {id ? <PassiveIcon id={id} /> : <span className="passive-placeholder">{locked ? "◇" : "＋"}</span>}
                        <span><b>{id ? PASSIVES[id].name : locked ? `${unlock}级解锁` : "待装配被动"}</b><small>P{index + 1} · {id ? `Lv.${rank} 常驻` : "被动槽"}</small></span>
                    </span>
                </IconTooltip>
                {dispatch && id && <button disabled={blocked} aria-label={`卸下${PASSIVES[id].name}`} onClick={() => dispatch({ type: "equip-passive", passive: null, slot: index })}>×</button>}
            </div>;
        })}
    </div>;
}

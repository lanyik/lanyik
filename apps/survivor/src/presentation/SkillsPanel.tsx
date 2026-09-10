import { useState } from "react";
import type { CombatCommand } from "../core/CombatCommand";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { SKILLS, SKILL_IDS, skillValues, type SkillId } from "../core/Skills";
import { UiIcon } from "./UiIcon";

export function SkillIcon({ id }: { readonly id: SkillId }) {
    return <span className="skill-symbol" style={{ color: SKILLS[id].color }}><UiIcon name={id} /></span>;
}

export function SkillsPanel({ player, disabled, dispatch, onClose }: {
    readonly player: CombatSnapshot["player"]; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly onClose: () => void;
}) {
    const [slot, setSlot] = useState(0);
    const { skills, stats, level } = player;
    return <section className="skills-window window" role="dialog" aria-label="技能">
        <header className="window-heading"><div className="window-title"><UiIcon name="skills" /><div><span className="eyebrow">ABILITIES</span><h2>技能 <small>可用点数 {skills.points}</small></h2></div></div><button className="close-button" aria-label="关闭技能" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="skill-management">
            <p>每级获得 1 技能点。选择快捷槽后装配技能，已装配技能交换位置。</p>
            <div className="loadout-picker" role="group" aria-label="选择技能槽">{skills.loadout.map((id, index) => <button key={index} aria-pressed={slot === index} onClick={() => setSlot(index)}><kbd>{index + 1}</kbd>{SKILLS[id].name}</button>)}</div>
            <p className="skill-auto-note">自动施法按槽位顺序判断：攻击技能需要范围内有敌人；结界在生命不高于 60% 时释放；疾风步仅手动。</p>
            <div className="skill-catalog">{SKILL_IDS.map(id => {
                const definition = SKILLS[id], rank = skills.ranks[id], values = skillValues(id, rank, stats);
                const unlocked = level >= definition.unlock, equipped = skills.loadout.indexOf(id), maxed = rank === GAME_CONFIG.skills.maxRank;
                const upgradeLevel = definition.unlock + rank;
                return <article key={id} data-skill={id} className={unlocked ? "" : "locked"}>
                    <SkillIcon id={id} /><div className="skill-details"><h3>{definition.name}<small>Lv.{rank} / {GAME_CONFIG.skills.maxRank}</small></h3><p>{definition.description}</p>
                        <p className="skill-values">{id === "dash" ? `${values.dashDistance.toFixed(2)} 距离 · 0.25 秒免伤` : id === "ward" ? `${values.ward} 护盾 · 持续 6 秒` : `${Math.round(values.damage * 100)}% 攻击伤害 · ${id === "chain" ? `${values.targets} 目标 · 首跳 7 / 连跳 4 距离 · 每跳保留 80%` : `${values.radius.toFixed(1)} 范围${id === "frost" ? ` · 减速 ${values.slowSeconds.toFixed(1)} 秒` : ""}`}`}</p>
                        <p>{values.mana} 法力 · {values.cooldown.toFixed(1)} 秒冷却{equipped >= 0 ? ` · 已装配 ${equipped + 1}` : ""}</p>
                        <div className="skill-actions"><button disabled={disabled || !unlocked || equipped === slot} onClick={() => dispatch({ type: "equip-skill", skill: id, slot })}>{unlocked ? `装配到 ${slot + 1}` : `${definition.unlock} 级解锁`}</button>
                            <button disabled={disabled || !skills.points || maxed || level < upgradeLevel} onClick={() => dispatch({ type: "upgrade-skill", skill: id })}>{maxed ? "已满级" : level < upgradeLevel ? `${upgradeLevel} 级可升级` : "升级 · 1 点"}</button></div>
                    </div>
                </article>;
            })}</div>
            <p>守夜弩击自动攻击，每秒 {stats.attackRate.toFixed(2)} 次。被动免伤盾抵挡一次命中后 {stats.shieldRecovery.toFixed(1)} 秒恢复。</p>
        </div>
    </section>;
}

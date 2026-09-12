import type { CSSProperties } from "react";
import type { CombatCommand } from "../core/CombatCommand";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { SKILLS, SKILL_IDS, SKILL_RULES } from "../core/Skills";
import { UiIcon } from "./UiIcon";
import { SkillIcon, SkillTooltip, skillSummary } from "./SkillView";
import { SkillSlot } from "./SkillSlot";
import { useSkillDrag } from "./SkillDrag";

export function SkillsPanel({ player, disabled, dispatch, onClose }: {
    readonly player: CombatSnapshot["player"]; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly onClose: () => void;
}) {
    const { skills, level } = player, drag = useSkillDrag();
    return <section className="skills-window window" role="dialog" aria-label="技能">
        <header className="window-heading"><div className="window-title"><UiIcon name="skills" /><div><span className="eyebrow">THE ARCANUM / 守夜秘典</span><h2>技能</h2></div></div>
            <div className="skill-points" data-points={skills.points} aria-label={`可用点数 ${skills.points}`}><b>{skills.points.toString().padStart(2, "0")}</b><span>可用<br />技能点</span></div>
            <button className="close-button" aria-label="关闭技能" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="skill-management">
            <div className="skill-section-heading"><div><span className="eyebrow">DISCOVER YOUR POWER</span><h3>研习秘术</h3></div><span>每次升级获得 {GAME_CONFIG.skills.pointsPerLevel} 技能点</span></div>
            <div className="skill-catalog">{SKILL_IDS.map(id => {
                const d = SKILLS[id], rank = skills.ranks[id], unlocked = level >= d.unlock;
                const equipped = skills.loadout.indexOf(id), maxed = rank === GAME_CONFIG.skills.maxRank, upgradeLevel = d.unlock + rank;
                return <article key={id} data-skill={id} className={`skill-card${unlocked ? "" : " locked"}`} style={{ "--skill-color": d.color } as CSSProperties}>
                    <div className="skill-card-top"><SkillTooltip id={id} player={player}><button className="skill-icon-trigger item-icon-trigger" aria-label={`${d.name}技能图标`} aria-disabled={disabled || !unlocked}
                        onPointerDown={event => drag.begin(event, id)} onKeyDown={event => drag.keyboard(event, id)}><SkillIcon id={id} rank={rank} /></button></SkillTooltip>
                        <div className="skill-card-title"><span className="skill-school">{d.school} <i /> {d.role}</span><h3>{d.name}</h3><small>{unlocked ? equipped >= 0 ? `已装配 · 槽位 ${equipped + 1}` : "已习得 · 拖动装配" : `角色 ${d.unlock} 级解锁`}</small></div>
                        <span className="skill-card-index">0{SKILL_IDS.indexOf(id) + 1}</span></div>
                    <p className="skill-card-summary">{skillSummary(id, player)}</p>
                    <div className="skill-rank-row"><span className="skill-rank-pips" aria-label={`Lv.${rank} / ${GAME_CONFIG.skills.maxRank}`}>{Array.from({ length: GAME_CONFIG.skills.maxRank }, (_, i) => <i key={i} data-filled={i < rank} />)}</span><small>Lv.{rank} / {GAME_CONFIG.skills.maxRank}</small>
                        <button className="skill-upgrade" disabled={disabled || !skills.points || maxed || level < upgradeLevel}
                            onClick={() => dispatch({ type: "upgrade-skill", skill: id })}>{maxed ? "已满级" : level < upgradeLevel ? `${upgradeLevel} 级可升级` : "升级 · 1 点"}<span aria-hidden="true">＋</span></button></div>
                </article>;
            })}</div>
            <p className="skill-auto-note">自动施法按槽位从左至右判断。疾风步仅手动；守护结界在生命不高于 {SKILL_RULES.ward.automaticHealthRatio * 100}% 时自动施放。</p>
        </div>
        <footer className="skill-loadout"><div className="skill-section-heading"><h3>战斗装配 <span>01 — {String(GAME_CONFIG.skills.slots).padStart(2, "0")}</span></h3><span>{drag.dragging ? "松开图标即可装配" : "拖动图标到槽位 · 已装配技能交换位置"}</span></div>
            <div className="loadout-slots" role="group" aria-label="技能装配槽">{skills.loadout.map((_, index) => <SkillSlot key={index} index={index} player={player} panel blocked={disabled} />)}</div>
            <p className="skill-loadout-tip">悬停图标查看详情 <span><kbd>Alt</kbd> 固定浮窗</span></p>
        </footer>
    </section>;
}

import type { CSSProperties } from "react";
import type { CombatCommand } from "../core/CombatCommand";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { SKILLS, SKILL_IDS, SKILL_RULES } from "../core/Skills";
import { WindowHeader } from "./WindowChrome";
import { SkillIcon, SkillTooltip, skillSummary } from "./SkillView";
import { SkillSlot } from "./SkillSlot";
import { useSkillDrag } from "./SkillDrag";

export function SkillsPanel({ player, disabled, dispatch, onClose }: {
    readonly player: CombatSnapshot["player"]; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly onClose: () => void;
}) {
    const { skills, level } = player, drag = useSkillDrag();
    return <section className="skills-window window" role="dialog" aria-label="技能">
        <WindowHeader title="技能" icon="skills" shortcut="K" close={onClose} help={<><p>拖动图标到下方槽位装配，已装配技能互换位置。空格拿起，再按 1–4 放入；Esc 取消。</p><p>悬停查看技能详情，Alt 固定浮窗。每次升级获得 {GAME_CONFIG.skills.pointsPerLevel} 技能点。</p><p>自动施法按槽位从左至右判断。疾风步仅手动；守护结界在生命不高于 {SKILL_RULES.ward.automaticHealthRatio * 100}% 时自动施放。</p></>}>
            <span className="skill-points" data-points={skills.points} aria-label={`可用点数 ${skills.points}`}><b>{skills.points}</b> 技能点</span>
        </WindowHeader>
        <div className="skill-management">
            <div className="skill-section-heading"><h3>技能图鉴</h3><span>拖入下方槽位装配</span></div>
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
        </div>
        <footer className="skill-loadout"><div className="skill-section-heading"><h3>战斗装配 <span>01 — {String(GAME_CONFIG.skills.slots).padStart(2, "0")}</span></h3><span>{drag.dragging ? "松开图标即可装配" : "拖动图标到槽位 · 已装配技能交换位置"}</span></div>
            <div className="loadout-slots" role="group" aria-label="技能装配槽">{skills.loadout.map((_, index) => <SkillSlot key={index} index={index} player={player} panel blocked={disabled} />)}</div>
        </footer>
    </section>;
}

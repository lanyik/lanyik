import { useId, type ReactElement } from "react";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { SKILLS, SKILL_RULES, skillValues, type SkillId } from "../core/Skills";
import { IconFrame } from "./IconFrame";
import { IconTooltip } from "./ItemTooltip";

export function SkillIcon({ id, rank }: { readonly id: SkillId; readonly rank?: number }) {
    const gradient = useId(), color = SKILLS[id].color;
    return <IconFrame type={SKILLS[id].type} value={SKILLS[id].value} accent={color} className="skill-art" badge={rank === undefined ? undefined : <span aria-label={`技能等级 ${rank}`}>{rank}</span>}>
        <svg viewBox="0 0 64 64" className="skill-artwork" fill="none" aria-hidden="true">
            <defs><radialGradient id={gradient}><stop stopColor="#fff" /><stop offset=".28" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient></defs>
            <circle cx="32" cy="32" r="30" fill={`url(#${gradient})`} opacity=".35" />
            <g stroke={color} strokeLinecap="round" strokeLinejoin="round">
                {id === "meteor" && <><path d="M55 5L34 41L19 52L8 43L18 25Z" fill={color} fillOpacity=".35" strokeWidth="2" /><path d="M49 8L31 29M58 18L40 40M36 5L20 24" strokeWidth="3" /><circle cx="23" cy="40" r="12" fill={color} /><path d="M20 31L29 37L26 47L16 43Z" fill="#fff1d0" /></>}
                {id === "vortex" && <><path d="M54 18C29-6 1 18 12 40C23 63 59 50 52 28C47 11 22 13 20 30C17 46 40 48 43 33C45 24 31 21 28 29" strokeWidth="4" /><path d="M7 13L13 20L5 23M55 50L48 46L48 56" strokeWidth="2" /><circle cx="32" cy="32" r="5" fill="#f1dcff" /></>}
                {id === "blades" && <><circle cx="32" cy="32" r="21" strokeDasharray="24 13" strokeWidth="2" /><path d="M32 5L40 20L33 17L26 22ZM57 44L39 44L45 39L44 30ZM8 45L17 30L19 37L27 41Z" fill="#ddfff6" strokeWidth="2" /><circle cx="32" cy="32" r="5" fill={color} /></>}
                {id === "pulse" && <><ellipse cx="32" cy="34" rx="27" ry="13" transform="rotate(-28 32 34)" opacity=".6" /><ellipse cx="32" cy="34" rx="24" ry="10" transform="rotate(40 32 34)" strokeWidth="2" /><path d="M32 5L37 24L54 31L38 37L32 57L26 39L9 32L26 25Z" fill={color} fillOpacity=".4" /><path d="M32 16L36 28L45 32L35 36L32 47L28 36L18 32L28 28Z" fill="#f6eaff" stroke="#fff" /><path d="M10 15L14 19M49 47L54 52M50 12L47 17M10 48L17 46" /></>}
                {id === "frost" && <><path d="M32 5V58M9 18L55 45M9 45L55 18" strokeWidth="2.5" /><path d="M23 11L32 20L41 11M23 52L32 43L41 52M9 29L22 26L20 13M44 51L42 38L55 35M20 51L22 38L9 35M55 29L42 26L44 13" strokeWidth="2" /><path d="M32 22L41 32L32 42L23 32Z" fill="#e6fbff" stroke="#fff" /><path d="M14 5L17 8M49 56L52 59M5 39L8 39" /></>}
                {id === "chain" && <><path d="M38 3L14 35H29L23 61L51 25H35Z" strokeWidth="5" opacity=".25" /><path d="M38 3L14 35H29L23 61L51 25H35Z" fill="#fff4c8" stroke="#fff9e8" strokeWidth="1.5" /><path d="M15 10L20 19L10 23L15 29M53 39L45 43L52 54M6 42H15M47 10L54 6" strokeWidth="2" /></>}
                {id === "dash" && <><path d="M9 14L37 21L54 32L37 43L9 51L29 34L16 28L37 30Z" fill={color} fillOpacity=".45" /><path d="M35 15L54 32L35 49L43 32Z" fill="#e0fff4" stroke="#fff" /><path d="M5 21L25 24M2 33H21M8 43L26 40M16 8L27 13M16 56L29 51" strokeWidth="2" /></>}
                {id === "ward" && <><path d="M32 5L53 14V31Q50 48 32 59Q14 48 11 31V14Z" fill={color} fillOpacity=".18" strokeWidth="2" /><path d="M32 12L46 18V31Q43 44 32 51Q21 44 18 31V18Z" stroke="#c7e1ff" /><path d="M32 18L36 28L44 32L36 36L32 46L28 36L20 32L28 28Z" fill="#e4f1ff" stroke="#fff" /><circle cx="7" cy="39" r="2" fill={color} /><circle cx="56" cy="23" r="2" fill={color} /></>}
            </g>
        </svg>
    </IconFrame>;
}

export function skillSummary(id: SkillId, player: CombatSnapshot["player"]): string {
    const v = skillValues(id, player.skills.ranks[id], player.stats);
    return id === "dash" ? `${v.dashDistance.toFixed(2)} 距离 · 疾行免伤` : id === "ward" ? `${v.ward} 护盾 · 持续 ${SKILL_RULES.ward.durationSeconds} 秒`
        : id === "vortex" || id === "blades" ? `每 ${SKILL_RULES[id].interval} 秒 ${Math.round(v.damage * 100)}% 伤害 · 持续 ${SKILL_RULES[id].duration} 秒`
        : `${Math.round(v.damage * 100)}% 伤害 · ${id === "chain" ? `${v.targets} 个目标` : `${v.radius.toFixed(1)} 范围`}`;
}

function SkillDetails({ id, player }: { readonly id: SkillId; readonly player: CombatSnapshot["player"] }) {
    const d = SKILLS[id], rank = player.skills.ranks[id], v = skillValues(id, rank, player.stats), slot = player.skills.loadout.indexOf(id);
    return <div className="skill-tooltip-details">
        <header><SkillIcon id={id} rank={rank} /><div><span className="eyebrow">{d.school} · {d.role}</span><h3>{d.name}</h3><small>技能等级 {rank} / {GAME_CONFIG.skills.maxRank}{slot >= 0 ? ` · 已装配 ${slot + 1}` : " · 未装配"}</small></div></header>
        <p>{d.description}</p>
        <div className="skill-tooltip-cost"><span>法力 <b>{v.mana}</b></span><span>冷却 <b>{v.cooldown.toFixed(1)} 秒</b></span></div>
        <strong className="skill-tooltip-power">{skillSummary(id, player)}</strong>
        {id === "pulse" && <p>对仍被减速的目标造成 {SKILL_RULES.pulse.chilledMultiplier * 100}% 的本技能伤害；不消耗减速。</p>}
        {id === "meteor" && <p>锁定距离 {SKILL_RULES.meteor.range}，{SKILL_RULES.meteor.delay} 秒后命中固定落点；敌人可以离开范围。</p>}
        {id === "vortex" && <p>锁定距离 {SKILL_RULES.vortex.range}，作用半径 {v.radius}；牵引遵守地形阻挡，领主只承受 {SKILL_RULES.vortex.bossPullScale * 100}% 牵引。</p>}
        {id === "blades" && <p>环带半径 {v.radius}，半宽 {SKILL_RULES.blades.width}；随玩家移动，内圈安全。同类持续技能结束前不能重放。</p>}
        {id === "frost" && <p>移动速度降低 {(1 - SKILL_RULES.frost.slowScale) * 100}%，持续 {v.slowSeconds.toFixed(1)} 秒。重复施放延长减速时间。</p>}
        {id === "chain" && <p>首跳距离 {SKILL_RULES.chain.firstRange}，连跳 {SKILL_RULES.chain.jumpRange}；每跳保留 {SKILL_RULES.chain.damageRetention * 100}% 伤害，每个目标只命中一次。</p>}
        {id === "dash" && <p>沿施放时朝向穿行，{SKILL_RULES.dash.durationSeconds} 秒内免伤。疾行期间不能转向或施放其他技能。</p>}
        {id === "ward" && <p>护盾优先承受伤害，耗尽或 {SKILL_RULES.ward.durationSeconds} 秒后消失；护盾存在时不能刷新。</p>}
        <p className="skill-tooltip-rule">{!d.automatic ? "仅手动施放" : id === "ward" ? `自动：生命不高于 ${SKILL_RULES.ward.automaticHealthRatio * 100}% 且没有结界` : "自动：攻击范围内存在敌人"}</p>
        <footer>{player.level < d.unlock ? `角色 ${d.unlock} 级解锁` : "拖动图标到技能槽装配；已有技能自动交换位置。"}<br />键盘：空格拿起，1–{GAME_CONFIG.skills.slots} 放入，Esc 取消。</footer>
    </div>;
}

export function SkillTooltip({ id, player, children }: { readonly id: SkillId; readonly player: CombatSnapshot["player"];
    readonly children: ReactElement<{ "aria-describedby"?: string }> }) {
    return <IconTooltip identity={`skill:${id}`} content={<SkillDetails id={id} player={player} />}>{children}</IconTooltip>;
}

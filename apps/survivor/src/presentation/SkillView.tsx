import { useId, type ReactElement } from "react";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { SKILLS, SKILL_RULES, skillValues, isFrostSkill, type SkillId } from "../core/Skills";
import { SKILL_NODES, nodeIndex } from "../core/SkillBuild";
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
                {id === "fireball" && <><path d="M34 5C42 22 58 28 51 45C44 66 10 59 12 37C12 28 22 21 20 13L29 27C33 19 29 12 34 5Z" fill={color} fillOpacity=".65" strokeWidth="2" /><path d="M33 27C37 36 46 43 38 50C24 59 20 40 28 37L29 44Z" fill="#fff2b1" /></>}
                {id === "fireray" && <><path d="M8 52L49 6L58 15L17 58Z" fill={color} fillOpacity=".3" /><path d="M12 52L52 11" stroke="#fff4c1" strokeWidth="5" /><path d="M22 26L28 30L34 23M33 42L39 33L48 35M7 40L16 42M42 8L42 16" strokeWidth="3" /><circle cx="14" cy="51" r="8" strokeWidth="2" /></>}
                {id === "firewall" && <><path d="M7 54V38L14 19L20 32L29 7L36 29L46 15L57 36V54Z" fill={color} fillOpacity=".55" strokeWidth="2" /><path d="M15 53L18 38L25 47L30 28L37 48L46 34L50 53" fill="#fff0ac" /><path d="M5 58H60M11 61H53" strokeWidth="2" /></>}
                {id === "firedomain" && <><ellipse cx="32" cy="45" rx="27" ry="13" strokeWidth="3" /><ellipse cx="32" cy="45" rx="20" ry="8" strokeDasharray="8 4" /><path d="M32 5L39 19L35 27L46 23C56 48 14 52 19 30L25 19L28 32C36 25 24 17 32 5Z" fill={color} fillOpacity=".65" strokeWidth="2" /><path d="M33 26L38 39L29 43L26 36Z" fill="#fff0b5" /></>}
                {id === "pyroblast" && <><path d="M19 5L15 34M37 4L31 29M56 13L43 38" strokeWidth="3" /><path d="M10 21L21 32L23 43L12 48L5 37ZM29 13L39 25L39 41L28 45L21 33ZM48 26L57 40L53 53L41 57L36 47Z" fill={color} fillOpacity=".6" strokeWidth="2" /><circle cx="14" cy="39" r="4" fill="#fff0b5" /><circle cx="30" cy="34" r="5" fill="#fff0b5" /><circle cx="47" cy="46" r="5" fill="#fff0b5" /></>}
                {id === "doom" && <><path d="M32 3L39 22L59 14L46 32L62 45L41 42L32 61L25 43L4 50L18 33L3 18L25 22Z" fill={color} fillOpacity=".5" strokeWidth="2" /><circle cx="32" cy="32" r="11" fill="#fff1b5" /><path d="M31 10L28 21M52 32H45M32 48V54M17 34L11 37" stroke="#fff9dd" strokeWidth="2" /></>}
                {id === "vortex" && <><path d="M54 18C29-6 1 18 12 40C23 63 59 50 52 28C47 11 22 13 20 30C17 46 40 48 43 33C45 24 31 21 28 29" strokeWidth="4" /><path d="M7 13L13 20L5 23M55 50L48 46L48 56" strokeWidth="2" /><circle cx="32" cy="32" r="5" fill="#f1dcff" /></>}
                {id === "blades" && <><circle cx="32" cy="32" r="21" strokeDasharray="24 13" strokeWidth="2" /><path d="M32 5L40 20L33 17L26 22ZM57 44L39 44L45 39L44 30ZM8 45L17 30L19 37L27 41Z" fill="#ddfff6" strokeWidth="2" /><circle cx="32" cy="32" r="5" fill={color} /></>}
                {id === "pulse" && <><ellipse cx="32" cy="34" rx="27" ry="13" transform="rotate(-28 32 34)" opacity=".6" /><ellipse cx="32" cy="34" rx="24" ry="10" transform="rotate(40 32 34)" strokeWidth="2" /><path d="M32 5L37 24L54 31L38 37L32 57L26 39L9 32L26 25Z" fill={color} fillOpacity=".4" /><path d="M32 16L36 28L45 32L35 36L32 47L28 36L18 32L28 28Z" fill="#f6eaff" stroke="#fff" /><path d="M10 15L14 19M49 47L54 52M50 12L47 17M10 48L17 46" /></>}
                {id === "frost" && <><path d="M32 5V58M9 18L55 45M9 45L55 18" strokeWidth="2.5" /><path d="M23 11L32 20L41 11M23 52L32 43L41 52M9 29L22 26L20 13M44 51L42 38L55 35M20 51L22 38L9 35M55 29L42 26L44 13" strokeWidth="2" /><path d="M32 22L41 32L32 42L23 32Z" fill="#e6fbff" stroke="#fff" /></>}
                {id === "icebolt" && <><path d="M53 8L46 35L29 48L17 35L29 18Z" fill={color} fillOpacity=".35" strokeWidth="2" /><path d="M53 8L29 36L17 35M29 36V48" stroke="#ecfdff" strokeWidth="2" /><path d="M19 19L8 31M21 44L10 56M34 51L27 59" strokeWidth="3" /></>}
                {id === "icelance" && <><path d="M54 5L45 30L34 31L33 42L7 58L22 32L33 30L34 19Z" fill={color} fillOpacity=".3" strokeWidth="2" /><path d="M8 57L54 5" stroke="#eaffff" strokeWidth="3" /><path d="M11 16L19 24M43 41L51 49M14 38L21 44" strokeWidth="2" /></>}
                {id === "icestorm" && <><path d="M13 5L21 17L13 36L5 24ZM36 9L46 24L36 47L27 31ZM55 30L61 41L53 59L46 48Z" fill={color} fillOpacity=".4" strokeWidth="2" /><path d="M13 9V27M36 15V38M54 35V52M8 43L18 38M18 56L30 48" stroke="#edffff" strokeWidth="2" /></>}
                {id === "blizzard" && <><path d="M8 20C25 3 57 11 54 26C52 39 19 28 12 40C5 52 36 60 53 46M19 14C39 6 51 24 34 25M24 46C40 56 53 38 37 39" strokeWidth="3" /><path d="M31 28V39M26 31L36 37M26 37L36 31" stroke="#f1ffff" strokeWidth="2" /></>}
                {id === "shatter" && <><path d="M31 8L38 23L31 31L22 24ZM54 23L39 30L39 42L58 42ZM23 35L9 25L5 43L19 45ZM30 42L22 58L42 54L40 42Z" fill={color} fillOpacity=".4" strokeWidth="2" /><path d="M30 32L35 36M40 18L46 9M16 16L10 8M48 49L56 57" stroke="#fff" strokeWidth="3" /></>}
                {id === "absolutezero" && <><path d="M32 4L56 18V46L32 60L8 46V18Z" fill={color} fillOpacity=".15" strokeWidth="2" /><path d="M32 12L49 22V42L32 52L15 42V22Z" strokeWidth="2" /><path d="M32 18V46M20 25L44 39M20 39L44 25" stroke="#f1ffff" strokeWidth="3" /><circle cx="32" cy="32" r="5" fill="#fff" /></>}
                {id === "chain" && <><path d="M38 3L14 35H29L23 61L51 25H35Z" strokeWidth="5" opacity=".25" /><path d="M38 3L14 35H29L23 61L51 25H35Z" fill="#fff4c8" stroke="#fff9e8" strokeWidth="1.5" /><path d="M15 10L20 19L10 23L15 29M53 39L45 43L52 54M6 42H15M47 10L54 6" strokeWidth="2" /></>}
                {id === "dash" && <><path d="M9 14L37 21L54 32L37 43L9 51L29 34L16 28L37 30Z" fill={color} fillOpacity=".45" /><path d="M35 15L54 32L35 49L43 32Z" fill="#e0fff4" stroke="#fff" /><path d="M5 21L25 24M2 33H21M8 43L26 40M16 8L27 13M16 56L29 51" strokeWidth="2" /></>}
                {id === "ward" && <><path d="M32 5L53 14V31Q50 48 32 59Q14 48 11 31V14Z" fill={color} fillOpacity=".18" strokeWidth="2" /><path d="M32 12L46 18V31Q43 44 32 51Q21 44 18 31V18Z" stroke="#c7e1ff" /><path d="M32 18L36 28L44 32L36 36L32 46L28 36L20 32L28 28Z" fill="#e4f1ff" stroke="#fff" /><circle cx="7" cy="39" r="2" fill={color} /><circle cx="56" cy="23" r="2" fill={color} /></>}
            </g>
        </svg>
    </IconFrame>;
}

export function skillSummary(id: SkillId, player: CombatSnapshot["player"]): string {
    const v = skillValues(id, player.skills.ranks[id], player.stats, player.skills.modifiers[id]);
    return id === "dash" ? `${v.dashDistance.toFixed(2)} 距离 · 免疫直接命中` : id === "ward" ? `${v.ward} 护盾 · 持续 ${SKILL_RULES.ward.durationSeconds} 秒`
        : v.fire && v.duration > 0 ? `每 ${v.fire.interval.toFixed(3)} 秒 ${Math.round(v.damage * 100)}% 伤害 · ${Math.floor(v.duration / v.fire.interval)} 次打击`
        : id === "icestorm" || id === "blizzard" ? `每 0.5 秒 ${Math.round(v.damage * 100)}% 伤害 · 持续 ${v.duration.toFixed(1)} 秒`
        : id === "vortex" || id === "blades" ? `每 ${SKILL_RULES[id].interval} 秒 ${Math.round(v.damage * 100)}% 伤害 · 持续 ${SKILL_RULES[id].duration} 秒`
        : `${Math.round(v.damage * 100)}% 伤害 · ${id === "chain" ? `${v.targets} 个目标` : `${v.radius.toFixed(1)} 范围`}`;
}

function SkillDetails({ id, player }: { readonly id: SkillId; readonly player: CombatSnapshot["player"] }) {
    const d = SKILLS[id], rank = player.skills.ranks[id], v = skillValues(id, rank, player.stats, player.skills.modifiers[id]), slot = player.skills.loadout.indexOf(id);
    return <div className="skill-tooltip-details">
        <header><SkillIcon id={id} rank={rank} /><div><span className="eyebrow">{d.school} · {d.role}</span><h3>{d.name}</h3><small>技能等级 {rank} / {SKILL_NODES[nodeIndex(id)].maximum}{slot >= 0 ? ` · 已装配 ${slot + 1}` : " · 未装配"}</small></div></header>
        <p>{d.description}</p>
        <div className="skill-tooltip-cost"><span>法力 <b>{v.mana}</b></span><span>冷却 <b>{v.cooldown.toFixed(1)} 秒</b></span></div>
        <strong className="skill-tooltip-power">{skillSummary(id, player)}</strong>
        {id === "pulse" && <p>对仍被减速的目标造成 {SKILL_RULES.pulse.chilledMultiplier * 100}% 的本技能伤害；不消耗减速。</p>}
        {id === "meteor" && <p>锁定距离 {SKILL_RULES.meteor.range}，{SKILL_RULES.meteor.delay} 秒后命中固定落点；敌人可以离开范围。</p>}
        {v.fire && <>
            {v.fire.burnDamage > 0 && <p>每次命中附加一层灼烧，每 0.5 秒造成 {(v.fire.burnDamage * 100).toFixed(1)}% 伤害，持续 {v.fire.burnSeconds.toFixed(1)} 秒（{Math.floor(v.fire.burnSeconds / .5)} 跳，每层完整基础总量 {(v.fire.burnDamage * Math.floor(v.fire.burnSeconds / .5) * 100).toFixed(1)}%）。本人最多 {v.fire.stackLimit} 层，各层独立计时；灼烧不暴击、不吸血。</p>}
            {v.fire.detonation > 0 && <p>命中后消费本人的灼烧，将尚未结算伤害的 {Math.round(v.fire.detonation * 100)}% 加入本次爆发；不重复计算施放者增伤，不消费其他来源，闪避不引爆。</p>}
            {v.duration > 0 && <p>{id === "fireray" ? "站定引导" : "固定区域"} {v.duration.toFixed(1)} 秒，完整直接伤害倍率 {Math.round(v.damage * Math.floor(v.duration / v.fire.interval) * 100)}%；实际命中取决于敌人是否留在范围内。</p>}
            {v.fire.protection > 0 && <p>直接命中获得两秒保护，减少 {Math.round(v.fire.protection * 100)}% 所受伤害；重复获得刷新时长，不叠加。</p>}
        </>}
        {id === "vortex" && <p>锁定距离 {SKILL_RULES.vortex.range}，作用半径 {v.radius}；牵引遵守地形阻挡，领主只承受 {SKILL_RULES.vortex.bossPullScale * 100}% 牵引。</p>}
        {id === "blades" && <p>环带半径 {v.radius}，半宽 {SKILL_RULES.blades.width}；随玩家移动，内圈安全。同类持续技能结束前不能重放。</p>}
        {isFrostSkill(id) && <p>附加 {v.chill.toFixed(1)} 寒意，持续 {v.slowSeconds.toFixed(1)} 秒；五层尝试冻结 {v.freezeSeconds.toFixed(1)} 秒，结束后抵抗控制 3 秒。精英冻结减半，领主免疫冻结。</p>}
        {id === "shatter" && <p>冻结目标额外承受 50% 本技能伤害；命中后消费冻结并给予控制抵抗。</p>}
        {id === "chain" && <p>首跳距离 {SKILL_RULES.chain.firstRange}，连跳 {SKILL_RULES.chain.jumpRange}；每跳保留 {SKILL_RULES.chain.damageRetention * 100}% 伤害，每个目标只命中一次。</p>}
        {id === "dash" && <p>沿施放时朝向穿行，{SKILL_RULES.dash.durationSeconds} 秒内免疫直接命中伤害，已有灼烧继续结算。疾行期间不能转向或施放其他技能。</p>}
        {id === "ward" && <p>护盾优先承受伤害，耗尽或 {SKILL_RULES.ward.durationSeconds} 秒后消失；护盾存在时不能刷新。</p>}
        <p className="skill-tooltip-rule">{!d.automatic ? "仅手动施放" : id === "ward" ? `自动：生命不高于 ${SKILL_RULES.ward.automaticHealthRatio * 100}% 且没有结界` : "自动：攻击范围内存在敌人"}</p>
        <footer>{rank === 0 ? "在技能树学习后装配" : player.level < d.unlock ? `角色 ${d.unlock} 级解锁` : "拖动图标到技能槽装配；已有技能自动交换位置。"}<br />键盘：空格拿起，1–{GAME_CONFIG.skills.slots} 放入，Esc 取消。</footer>
    </div>;
}

export function SkillTooltip({ id, player, children }: { readonly id: SkillId; readonly player: CombatSnapshot["player"];
    readonly children: ReactElement<{ "aria-describedby"?: string }> }) {
    return <IconTooltip identity={`skill:${id}`} content={<SkillDetails id={id} player={player} />}>{children}</IconTooltip>;
}

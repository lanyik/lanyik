import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CombatCommand } from "../core/CombatCommand";
import type { CombatSnapshot } from "../core/CombatState";
import { skillValues, mobileCast, SKILL_TIMINGS, type SkillId } from "../core/Skills";
import { SKILL_NODES, compileSkillModifiers, initialSkillRanks, investedPoints, nodeIndex, nodeRequirement, reachableSkillRanks, validateSkillRanks, type SkillNode } from "../core/SkillBuild";
import { WindowHeader } from "./WindowChrome";
import { SkillIcon, SkillTooltip } from "./SkillView";
import { SkillSlot } from "./SkillSlot";
import { useSkillDrag } from "./SkillDrag";

const SCHOOLS = [
    { id: "frost", name: "冰霜", glyph: "❄", color: "#8de3ff", caption: "穿刺碎裂 · 减速冻结" },
    { id: "fire", name: "火焰", glyph: "✧", color: "#ffa56b", caption: "陨星术式 · 分支待扩展" },
    { id: "lightning", name: "雷电", glyph: "ϟ", color: "#e5d994", caption: "连锁术式 · 分支待扩展" },
    { id: "stars", name: "星辰", glyph: "✦", color: "#baacf5", caption: "结界与刃阵 · 分支待扩展" },
    { id: "utility", name: "通用", glyph: "◇", color: "#8fe2c6", caption: "机动 · 脉冲 · 引力" }
] as const;
const SCHOOL_SKILLS: Readonly<Record<string, readonly SkillId[]>> = { fire: ["meteor"], lightning: ["chain"], stars: ["ward", "blades"], utility: ["pulse", "vortex", "dash"] };
function keyMove(event: KeyboardEvent, node: SkillNode, nodes: readonly SkillNode[], select: (id: string) => void) {
    const directions: Record<string, readonly [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const direction = directions[event.key]; if (!direction) return;
    event.preventDefault();
    let nearest: SkillNode | undefined, score = Infinity;
    for (const candidate of nodes) {
        const dx = candidate.x - node.x, dy = candidate.y - node.y, forward = dx * direction[0] + dy * direction[1];
        if (forward <= 0) continue;
        const cost = Math.hypot(dx, dy) + Math.abs(dx * direction[1] - dy * direction[0]) * 2;
        if (cost < score) { score = cost; nearest = candidate; }
    }
    if (nearest) { select(nearest.id); document.getElementById("skill-node-" + nearest.id)?.focus(); }
}
const SkillGraph = memo(function SkillGraph({ nodes, ranks, committed, selected, level, select }: {
    readonly nodes: readonly SkillNode[]; readonly ranks: readonly number[]; readonly committed: readonly number[];
    readonly selected: string; readonly level: number; readonly select: (id: string) => void;
}) {
    const drag = useSkillDrag();
    return <div className="constellation-map" role="group" aria-label="技能分支树">
        <svg className="constellation-lines" viewBox="0 0 840 820" aria-hidden="true">
            <circle cx="420" cy="350" r="275" className="astral-ring" /><circle cx="420" cy="350" r="305" className="astral-ring outer" />
            <path d="M420 18V890M115 350H725" className="astral-axis" />
            {nodes.map(node => {
                if (!node.parent) return null;
                const parent = nodes.find(candidate => candidate.id === node.parent); if (!parent) return null;
                const learned = ranks[nodeIndex(node.id)] > 0;
                return <path key={node.id} className={learned ? "learned-link" : ""} d={"M" + parent.x + "," + parent.y + " C" + parent.x + "," + (parent.y + 55) + " " + node.x + "," + (node.y - 55) + " " + node.x + "," + node.y} />;
            })}
            {Array.from({ length: 32 }, (_, i) => <circle key={i} cx={(i * 179 + 41) % 830} cy={(i * 137 + 25) % 920} r={i % 3 === 0 ? 1.8 : .8} className="astral-star" />)}
        </svg>
        {nodes[0]?.frost && <><span className="constellation-label damage-path">碎裂之径</span><span className="constellation-label control-path">永冬之径</span></>}
        {nodes.map(node => {
            const rank = ranks[nodeIndex(node.id)], current = committed[nodeIndex(node.id)], reason = nodeRequirement(node, ranks, level);
            const learned = rank > 0, draft = rank !== current;
            return <button key={node.id} id={"skill-node-" + node.id} type="button" data-node={node.id} data-skill={node.kind === "active" ? node.skill : undefined}
                className={"constellation-node " + node.kind + (learned ? " learned" : "") + (reason && !learned ? " locked" : "") + (draft ? " draft" : "")}
                style={{ left: node.x, top: node.y } as CSSProperties} aria-pressed={selected === node.id} aria-label={node.name + " " + rank + "/" + node.maximum}
                onClick={() => select(node.id)} onKeyDown={event => { if (event.key === " " && node.kind === "active" && node.skill && current > 0) drag.keyboard(event, node.skill); else keyMove(event, node, nodes, select); }}
                onPointerDown={event => { if (node.kind === "active" && node.skill && current > 0) drag.begin(event, node.skill); }}>
                <span className="node-aura" />
                <span className="node-emblem">{node.kind === "active" && node.skill ? <SkillIcon id={node.skill} /> : node.kind === "mastery" ? "✧" : node.kind === "passive" ? "✦" : node.modifier === "power" ? "⚔" : node.modifier === "shape" ? "⌖" : "◷"}</span>
                <span className="node-name">{node.name}</span><span className="node-rank">{rank}<i> / {node.maximum}</i></span>
            </button>;
        })}
    </div>;
});

export function SkillsPanel({ player, homestead, disabled, dispatch, onClose }: {
    readonly player: CombatSnapshot["player"]; readonly homestead: boolean; readonly disabled: boolean;
    readonly dispatch: (command: CombatCommand) => void; readonly onClose: () => void;
}) {
    const { skills, level } = player, drag = useSkillDrag(), scroller = useRef<HTMLDivElement>(null), details = useRef<HTMLElement>(null);
    const [school, setSchool] = useState("frost"), [selected, select] = useState("icebolt");
    const [draft, setDraft] = useState<readonly number[]>(skills.build.ranks), [revision, setRevision] = useState(skills.build.revision);
    useEffect(() => { if (details.current) details.current.scrollTop = 0; }, [selected, skills.build.revision]);
    useEffect(() => {
        if (skills.build.revision !== revision) { setDraft(skills.build.ranks); setRevision(skills.build.revision); }
    }, [skills.build, revision]);
    const theme = SCHOOLS.find(entry => entry.id === school)!;
    const nodes = useMemo(() => school === "frost" ? SKILL_NODES.filter(node => node.frost)
        : SKILL_NODES.filter(node => node.skill && node.kind === "active" && SCHOOL_SKILLS[school].includes(node.skill))
            .map((node, i) => ({ ...node, x: 240 + (i % 2) * 360, y: 175 + Math.floor(i / 2) * 235 })), [school]);
    useEffect(() => {
        const element = scroller.current;
        if (element) { element.scrollLeft = Math.max(0, (840 - element.clientWidth) / 2); element.scrollTop = 0; }
    }, [school]);
    const node = SKILL_NODES[nodeIndex(selected)], rank = draft[nodeIndex(selected)], current = skills.build.ranks[nodeIndex(selected)];
    const cost = investedPoints(draft) - investedPoints(skills.build.ranks), available = skills.points - cost;
    const dirty = draft.some((value, i) => value !== skills.build.ranks[i]), refund = draft.some((value, i) => value < skills.build.ranks[i]);
    const requirement = nodeRequirement(node, draft, level);
    const invalid = validateSkillRanks(draft, level) ?? (refund && !homestead ? "请回家园应用包含退款的构筑" : null);
    const oldValues = node.skill ? skillValues(node.skill, skills.ranks[node.skill], player.stats, skills.modifiers[node.skill]) : undefined;
    const draftModifiers = useMemo(() => compileSkillModifiers(draft), [draft]);
    const preview = node.skill ? skillValues(node.skill, draft[nodeIndex(node.skill)], player.stats, draftModifiers[node.skill]) : undefined;
    function change(delta: number) {
        const index = nodeIndex(selected), next = [...draft], newRank = next[index] + delta;
        if (disabled || newRank < node.initial || newRank > node.maximum || delta > 0 && (available < 1 || requirement)) return;
        if (delta > 0 && !node.frost && level < node.level + newRank - 1) return;
        next[index] = newRank;
        setDraft(delta < 0 ? reachableSkillRanks(next, level) : next);
    }
    function locate() {
        const shown = nodes.find(candidate => candidate.id === selected);
        if (shown && scroller.current) {
            scroller.current.scrollTo({ left: Math.max(0, shown.x - scroller.current.clientWidth / 2), top: Math.max(0, shown.y - scroller.current.clientHeight / 2), behavior: "smooth" });
        }
    }
    return <section className="skills-window constellation-window window" role="dialog" aria-label="技能" style={{ "--school-color": theme.color } as CSSProperties}>
        <WindowHeader title="技能" icon="skills" shortcut="K" close={onClose} help={<><p>沿星图连线解锁主动与侧路。点击节点查看，右侧加减点先进入草稿，应用后才生效。</p><p>每次升级 1 点；家园免费洗点，移除前置会连带退回不满足条件的节点。洗点不刷新冷却。</p><p>拖动已学主动到六个槽位，或空格拿起、1–6 放入。重型施法前摇可被移动取消，后摇期间不能连续释放；取消不返还法力与冷却。</p></>}>
            <span className="skill-points" data-points={skills.points} aria-label={"可用点数 " + skills.points}><b>{available}</b><span>可用技能点</span></span>
        </WindowHeader>
        <nav className="school-tabs" aria-label="技能学派">{SCHOOLS.map(tab => <button key={tab.id} aria-pressed={school === tab.id} style={{ "--tab-color": tab.color } as CSSProperties}
            onClick={() => { setSchool(tab.id); select(tab.id === "frost" ? "icebolt" : SCHOOL_SKILLS[tab.id][0]); }}>
            <i aria-hidden="true">{tab.glyph}</i><span>{tab.name}</span>{tab.id === "frost" && <small>完整分支</small>}</button>)}</nav>
        <div className="constellation-workspace">
            <div className="constellation-stage">
                <header className="constellation-heading"><div><span>ARCANA / {String(SCHOOLS.indexOf(theme) + 1).padStart(2, "0")}</span><h3>{theme.name}之章</h3><p>{theme.caption}</p></div>
                    <button onClick={locate} aria-label="定位选中节点">⌖ 定位</button></header>
                <div className="constellation-scroll" ref={scroller}><SkillGraph nodes={nodes} ranks={draft} committed={skills.build.ranks} level={level} selected={selected} select={select} /></div>
                <div className="constellation-legend"><span>□ 主动</span><span>○ 强化</span><span>◇ 专精</span><b>{school === "frost" ? "本系投入 " + investedPoints(draft, true) : "现有术式 · 专属分支随后接入"}</b></div>
            </div>
            <aside className="constellation-details" aria-label="节点详情" ref={details}>
                <span className="node-detail-kind">{node.kind === "active" ? "主动技能" : node.kind === "mastery" ? "互斥专精" : "被动强化"}</span>
                {node.skill && <SkillTooltip id={node.skill} player={player}><span tabIndex={0} className="node-detail-icon"><SkillIcon id={node.skill} rank={current} /></span></SkillTooltip>}
                <h3>{node.name}</h3><div className="node-detail-rank">Lv.{current}<span> → </span><b>{rank}</b><small> / {node.maximum}</small></div>
                <p>{node.description}</p>
                {oldValues && preview && node.skill && <dl className="node-detail-stats"><div><dt>法力 · 当前→草稿</dt><dd>{oldValues.mana} → {preview.mana}</dd></div><div><dt>冷却</dt><dd>{oldValues.cooldown.toFixed(1)} → {preview.cooldown.toFixed(1)}s</dd></div>
                    {node.skill === "ward" ? <div><dt>吸收护盾</dt><dd>{oldValues.ward} → {preview.ward}</dd></div>
                        : node.skill === "dash" ? <div><dt>疾行距离</dt><dd>{oldValues.dashDistance.toFixed(1)} → {preview.dashDistance.toFixed(1)}</dd></div>
                            : <><div><dt>攻击倍率</dt><dd>{Math.round(oldValues.damage * 100)} → {Math.round(preview.damage * 100)}%</dd></div><div><dt>作用范围</dt><dd>{oldValues.radius.toFixed(1)} → {preview.radius.toFixed(1)}</dd></div></>}
                    {(node.skill === "icebolt" || node.skill === "icelance" || node.skill === "chain") && <div><dt>最多目标</dt><dd>{oldValues.targets} → {preview.targets}</dd></div>}
                    <div><dt>前摇 / 后摇</dt><dd>{(node.skill === "dash" ? 0 : Math.max(.1, SKILL_TIMINGS[node.skill][0] / (1 + player.stats.castSpeed))).toFixed(2)} / {Math.max(.15, SKILL_TIMINGS[node.skill][1] / (1 + player.stats.castSpeed)).toFixed(2)}s</dd></div></dl>}
                {node.kind === "active" && node.skill && <small>{mobileCast(node.skill) ? "移动施法 · 共享后摇" : "站定吟唱 · 移动取消前摇"}</small>}
                <div className="node-requirements">{requirement ?? (rank === node.maximum ? "节点已达到最高等级" : "前置满足 · 每级消耗 1 点")}</div>
                {node.parent && <button className="node-parent" onClick={() => select(node.parent!)}>↗ 查看前置：{SKILL_NODES[nodeIndex(node.parent)].name} {node.parentRank} 级</button>}
                <div className="node-point-controls"><button onClick={() => change(-1)} disabled={disabled || rank <= node.initial} aria-label={"减少" + node.name}>−</button><span>{rank}</span>
                    <button onClick={() => change(1)} disabled={disabled || rank >= node.maximum || available < 1 || !!requirement || !node.frost && level < node.level + rank} aria-label={"提升" + node.name}>＋</button></div>
                {node.kind === "active" && current > 0 && <small className="node-drag-hint">从树上拖动已学图标，装入下方任意槽位</small>}
                <div className="build-draft-summary"><strong>构筑草稿</strong><span>本次{cost >= 0 ? "花费" : "退回"} {Math.abs(cost)} 点</span><small>{invalid ?? (dirty ? "预览尚未应用" : "与当前构筑一致")}</small></div>
            </aside>
        </div>
        <footer className="skill-loadout">
            <div className="tree-build-actions"><span>{drag.dragging ? "松开图标即可装配" : "六槽装配 · 1–6 施法 · F 自动施法"}</span>
                <button disabled={!dirty || disabled} onClick={() => setDraft(skills.build.ranks)}>撤销草稿</button>
                <button disabled={disabled} onClick={() => setDraft(initialSkillRanks())}>重置草稿</button>
                <button className="apply-skill-build" disabled={disabled || !dirty || !!invalid} onClick={() => dispatch({ type: "commit-skill-build", ranks: draft, revision })}>应用构筑</button>
            </div>
            <div className="loadout-slots" role="group" aria-label="技能装配槽">{skills.loadout.map((_, index) => <SkillSlot key={index} index={index} player={player} panel blocked={disabled} />)}</div>
        </footer>
    </section>;
}

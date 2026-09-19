import { FROST_SKILLS, SKILLS, SKILL_IDS, isFrostSkill, isUltimate, type SkillId, type SkillModifiers } from "./Skills";

export interface SkillNode {
    readonly id: string; readonly name: string; readonly description: string; readonly kind: "active" | "modifier" | "passive" | "mastery";
    readonly skill?: SkillId; readonly modifier?: "power" | "shape" | "tempo"; readonly parent?: string; readonly parentRank: number;
    readonly maximum: number; readonly initial: number; readonly level: number; readonly investment: number;
    readonly x: number; readonly y: number; readonly frost: boolean;
}
const nodes: SkillNode[] = [];
const branches: readonly [SkillId, string | undefined, number, number, number, number, readonly string[]][] = [
    ["icebolt", undefined, 0, 0, 2, 0, ["寒锋", "冰屑", "节流"]],
    ["icelance", "icebolt", -1, 1, 8, 6, ["锐冰", "贯穿", "急咏"]],
    ["icestorm", "icelance", -1, 2, 20, 18, ["晶锋", "扩域", "绵延"]],
    ["shatter", "icestorm", -1, 3, 45, 40, ["毁伤", "崩裂范围", "复苏"]],
    ["frost", "icebolt", 1, 1, 8, 6, ["霜伤", "广域", "深寒"]],
    ["blizzard", "frost", 1, 2, 20, 18, ["雪刃", "雪域", "冻凝"]],
    ["absolutezero", "blizzard", 1, 3, 45, 40, ["寒核", "极域", "缓释"]]
];
function add(node: SkillNode): void { nodes.push(Object.freeze(node)); }
for (const [skill, parent, branch, tier, level, investment, names] of branches) {
    const x = 420 + branch * 220, y = 55 + tier * 200;
    add({ id: skill, name: SKILLS[skill].name, description: SKILLS[skill].description, kind: "active", skill,
        parent, parentRank: tier === 3 ? 5 : tier ? 3 : 0, maximum: isUltimate(skill) ? 5 : 10, initial: 0, level, investment, x, y, frost: true });
    for (const [index, modifier] of (["power", "shape", "tempo"] as const).entries()) {
        const description = modifier === "power" ? "每点使本技能伤害增加 4%。"
            : modifier === "shape" ? ["icebolt", "icelance"].includes(skill) ? "每点增加 1 个不同命中目标。" : "每点增加本技能作用范围 5%。"
            : skill === "icebolt" ? "每点减少本技能法力消耗 3%。" : skill === "icelance" || skill === "shatter" ? "每点减少本技能基础冷却 2%。"
                : skill === "icestorm" ? "每点延长冰晶风暴 10%。" : skill === "absolutezero" ? "每点延长所附寒意 10%。" : "每点增加本技能寒意积累 10%。";
        add({ id: `${skill}.${modifier}`, name: names[index], description, kind: "modifier", skill, modifier, parent: skill,
            parentRank: [1, 3, 5][index], maximum: 5, initial: 0, level: 2, investment: 0, x: x + (index - 1) * 85, y: y + 90, frost: true });
    }
}
for (const [i, [id, name, description]] of ([
    ["frost.study", "冰霜研习", "每点增加全部冰霜技能伤害 3%。"], ["frost.economy", "冷静施法", "每点减少全部冰霜技能法力消耗 2%。"],
    ["frost.duration", "冰域掌控", "每点延长本人施加的寒意 5%。"], ["frost.resilience", "寒冰韧性", "每点缩短自身受到的寒意、减速和冻结时间 4%。"]
] as const).entries()) add({ id, name, description, kind: "passive", parentRank: 0, maximum: 5, initial: 0, level: 2,
    investment: [2, 6, 12, 18][i], x: 55, y: 165 + i * 165, frost: true });
add({ id: "frost.shatter", name: "碎冰", description: "每点使冻结目标承受的直接冰伤额外增加 10%；自身寒意积累乘 75%。与永冬互斥。", kind: "mastery", parent: "icestorm", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 340, y: 605, frost: true });
add({ id: "frost.winter", name: "永冬", description: "每点增加 15% 寒意积累和 10% 冻结时长；直接冰伤乘 85%。与碎冰互斥。", kind: "mastery", parent: "blizzard", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 500, y: 605, frost: true });
for (const [i, skill] of SKILL_IDS.filter(id => !isFrostSkill(id)).entries()) add({ id: skill, name: SKILLS[skill].name, description: SKILLS[skill].description,
    kind: "active", skill, parentRank: 0, maximum: skill === "dash" ? 1 : 5, initial: 1, level: SKILLS[skill].unlock, investment: 0,
    x: 145 + (i % 3) * 220, y: 120 + Math.floor(i / 3) * 220, frost: false });
export const SKILL_NODES: readonly SkillNode[] = Object.freeze(nodes);
const indices = new Map(SKILL_NODES.map((node, index) => [node.id, index]));
export function nodeIndex(id: string): number {
    const index = indices.get(id);
    if (index === undefined) throw new RangeError("Unknown skill node");
    return index;
}
export const initialSkillRanks = (): number[] => SKILL_NODES.map(node => node.initial);
export function investedPoints(ranks: readonly number[], frostOnly = false): number {
    return SKILL_NODES.reduce((sum, node, i) => sum + (frostOnly && !node.frost ? 0 : ranks[i] - node.initial), 0);
}
export function nodeRequirement(node: SkillNode, ranks: readonly number[], level: number): string | null {
    if (level < node.level) return `角色 ${node.level} 级解锁`;
    if (node.parent && ranks[nodeIndex(node.parent)] < node.parentRank) return `需要 ${SKILL_NODES[nodeIndex(node.parent)].name} ${node.parentRank} 级`;
    const spent = investedPoints(ranks, true) - (node.frost ? ranks[nodeIndex(node.id)] : 0);
    if (spent < node.investment) return `本系还需投入 ${node.investment - spent} 点`;
    if (node.kind === "mastery" && ranks[nodeIndex(node.id === "frost.shatter" ? "frost.winter" : "frost.shatter")] > 0) return "同系专精互斥，请先退回另一专精";
    return null;
}
export function validateSkillRanks(ranks: readonly number[], level: number): string | null {
    if (!Array.isArray(ranks) || ranks.length !== SKILL_NODES.length) return "技能节点数量无效";
    for (let i = 0; i < ranks.length; i++) {
        const node = SKILL_NODES[i], rank = ranks[i];
        if (!Number.isInteger(rank) || rank < node.initial || rank > node.maximum) return "技能节点等级无效";
    }
    if (investedPoints(ranks) > level - 1) return "技能点不足";
    for (let i = 0; i < ranks.length; i++) {
        const node = SKILL_NODES[i], rank = ranks[i];
        if (rank <= node.initial) continue;
        const reason = nodeRequirement(node, ranks, level);
        if (reason) return reason;
        if (!node.frost && level < node.level + rank - 1) return "角色等级不足以强化该术式";
    }
    // Investment gates must be reachable in an actual purchase order. Final totals alone
    // would let locked branches finance one another inside a forged transaction/save.
    const reachable = reachableSkillRanks(ranks, level);
    if (reachable.some((rank, i) => rank !== ranks[i])) return "技能分支缺少可先行投入的前置节点";
    return null;
}
export function reachableSkillRanks(ranks: readonly number[], level: number): number[] {
    const reachable = initialSkillRanks();
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < ranks.length; i++) {
            if (reachable[i] === ranks[i] || nodeRequirement(SKILL_NODES[i], reachable, level)) continue;
            reachable[i] = ranks[i]; changed = true;
        }
    }
    return reachable;
}
export function compileSkillModifiers(ranks: readonly number[]): Readonly<Partial<Record<SkillId, SkillModifiers>>> {
    const rank = (id: string) => ranks[nodeIndex(id)];
    return Object.freeze(Object.fromEntries(FROST_SKILLS.map(id => [id, Object.freeze({ power: rank(`${id}.power`), shape: rank(`${id}.shape`), tempo: rank(`${id}.tempo`),
        damage: rank("frost.study"), economy: rank("frost.economy"), duration: rank("frost.duration"), shatter: rank("frost.shatter"), winter: rank("frost.winter") })])));
}
/** Only committed progression lives here. Cast state and cooldowns belong to SkillSystem. */
export class SkillBuild {
    public points = 0;
    public revision = 0;
    private ranks: readonly number[] = Object.freeze(initialSkillRanks());
    public modifiers: Readonly<Partial<Record<SkillId, SkillModifiers>>> = Object.freeze({});
    public rank(id: string): number { return this.ranks[nodeIndex(id)]; }
    public snapshot() { return { revision: this.revision, ranks: this.ranks }; }
    public restore(ranks: readonly number[], points: number, revision: number): void {
        this.ranks = Object.freeze([...ranks]); this.points = points; this.revision = revision; this.compile();
    }
    public commit(ranks: readonly number[], revision: number, level: number, refundAllowed: boolean): string | null {
        if (revision !== this.revision) return "构筑已变化，请重新预览";
        const invalid = validateSkillRanks(ranks, level);
        if (invalid) return invalid;
        if (!refundAllowed && ranks.some((rank, i) => rank < this.ranks[i])) return "请回家园洗点，并等待当前施放结束";
        const cost = investedPoints(ranks) - investedPoints(this.ranks);
        if (cost > this.points) return "技能点不足";
        if (ranks.every((rank, i) => rank === this.ranks[i])) return null;
        this.restore(ranks, this.points - cost, this.revision + 1);
        return null;
    }
    private compile(): void {
        this.modifiers = compileSkillModifiers(this.ranks);
    }
}

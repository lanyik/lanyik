import { FIRE_SKILLS, FROST_SKILLS, LIGHTNING_SKILLS, STAR_SKILLS, NO_SKILL_MODIFIERS, SKILLS, SKILL_IDS, isFireSkill, isFrostSkill, isLightningSkill, isStarSkill, isUltimate, type SkillId, type SkillModifiers } from "./Skills";

export interface SkillNode {
    readonly id: string; readonly name: string; readonly description: string; readonly kind: "active" | "modifier" | "passive" | "mastery";
    readonly skill?: SkillId; readonly modifier?: "power" | "shape" | "tempo"; readonly parent?: string; readonly parentRank: number;
    readonly maximum: number; readonly initial: number; readonly level: number; readonly investment: number;
    readonly x: number; readonly y: number; readonly school: "frost" | "fire" | "lightning" | "stars" | "legacy"; readonly exclusive?: string;
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
function fireModifierDescription(skill: SkillId, modifier: "power" | "shape" | "tempo"): string {
    return modifier === "power" ? "每点增加本技能直接伤害与灼烧伤害 4%。"
            : modifier === "shape" ? skill === "pyroblast" ? "每点增加一枚炎弹，最多六枚；同轮单个敌人最多命中两次。" : "每点增加本技能作用范围 5%。"
            : skill === "fireball" ? "每点减少本技能法力消耗 3%。" : skill === "fireray" ? "每点缩短射线打击间隔 3%，延长所附灼烧 10%；间隔向上取整到逻辑帧。"
                : skill === "firewall" ? "每点延长火墙所附灼烧 10%。" : skill === "firedomain" ? "每点延长火域持续时间 10%。"
                    : skill === "meteor" ? "每点增加灼烧引爆转化率 4 个百分点，总转化率最高 80%。" : "每点减少本技能基础冷却 2%。";
}
function lightningModifierDescription(skill: SkillId, modifier: "power" | "shape" | "tempo"): string {
    return modifier === "power" ? "每点增加本技能直接伤害 4%。"
        : modifier === "shape" ? skill === "thunderstrike" ? "每点多降下一次落雷，最多八次。" : skill === "thunderlance" ? "每点多穿透一个不同目标，最多八个。"
            : ["judgment", "thunderfield"].includes(skill) ? "每点增加作用半径 5%。" : "每点增加一个不同目标；电网所有分支共用预算，不增加每个分支的单独预算。"
        : skill === "arc" ? "每点减少法力消耗 3%。" : skill === "chain" ? "每点增加后跳传导距离 5%，所有树修正合计最多增加 50%。"
            : skill === "thunderstrike" ? "每点使同次轰击对同一目标的后续成功命中累积增伤 3%，累计最高 15%；闪避不累积。"
                : skill === "thunderfield" ? "每点延长电场持续时间 10%。" : skill === "tempest" ? "每点提高后跳保留比例 2 个百分点，最高 95%，不放大首跳。"
                    : "每点减少本技能基础冷却 2%。";
}
function starModifierDescription(skill: SkillId, modifier: "power" | "shape" | "tempo"): string {
    if (modifier === "power") return skill === "infusion" || skill === "resonance" ? "每点增加技能强化倍率 2 个百分点，最终最多额外 80%。"
        : skill === "shelter" ? "每点增加减伤 2 个百分点，最终最多 50%；与其他保护取较强值。"
            : skill === "ward" || skill === "bastion" ? "每点增加本技能护盾量 4%。" : "每点增加本技能直接伤害 4%。";
    if (modifier === "shape") return skill === "starbolt" ? "每点多命中一个不同目标，最多六个；同次施放仍至多获得一层星能。"
        : skill === "infusion" || skill === "resonance" ? "每点增加一次强化；含星能额外次数最多八次。"
            : skill === "blades" ? "每点增加刃阵半径 5%，内圈同样向外移动。" : "每点延长本技能护盾或减伤持续时间 10%。";
    return skill === "starbolt" || skill === "ward" ? "每点减少法力消耗 3%。"
        : skill === "resonance" ? "每点减少基础冷却 2%。" : skill === "shelter" ? "每点在出手时净化一个负面来源组，最多五个；不移除控制抵抗。"
            : skill === "bastion" ? "护盾被伤害耗尽后，每点治疗起手时最大生命的 1%；到期、替换、洗点不触发，致死伤害不能复活。"
                : "每点延长持续时间 10%；强化期限最多十五秒，刃阵只计算完整周期。";
}
function addBranches(entries: typeof branches, school: Exclude<SkillNode["school"], "legacy">): void {
    for (const [skill, parent, branch, tier, level, investment, names] of entries) {
        const x = 620 + branch * 220, y = tier ? 360 + (tier - 1) * 340 : 90;
        add({ id: skill, name: SKILLS[skill].name, description: SKILLS[skill].description, kind: "active", skill,
            parent, parentRank: tier === 3 ? 5 : tier ? 3 : 0, maximum: isUltimate(skill) ? 5 : 10, initial: 0, level, investment, x, y, school });
        for (const [index, modifier] of (["power", "shape", "tempo"] as const).entries()) {
            const description = school === "stars" ? starModifierDescription(skill, modifier) : school === "lightning" ? lightningModifierDescription(skill, modifier) : school === "fire" ? fireModifierDescription(skill, modifier) : modifier === "power" ? "每点使本技能伤害增加 4%。"
                : modifier === "shape" ? ["icebolt", "icelance"].includes(skill) ? "每点增加 1 个不同命中目标。" : "每点增加本技能作用范围 5%。"
                : skill === "icebolt" ? "每点减少本技能法力消耗 3%。" : skill === "icelance" || skill === "shatter" ? "每点减少本技能基础冷却 2%。"
                    : skill === "icestorm" ? "每点延长冰晶风暴 10%。" : skill === "absolutezero" ? "每点延长所附寒意 10%。" : "每点增加本技能寒意积累 10%。";
            add({ id: `${skill}.${modifier}`, name: names[index], description, kind: "modifier", skill, modifier, parent: skill,
                parentRank: [1, 3, 5][index], maximum: 5, initial: 0, level: 2, investment: 0,
                x: tier ? x + branch * 220 : x + (index - 1) * 125, y: tier ? y + (index - 1) * 100 : y + 140, school });
        }
    }
}
addBranches(branches, "frost");
for (const [i, [id, name, description]] of ([
    ["frost.study", "冰霜研习", "每点增加全部冰霜技能伤害 3%。"], ["frost.economy", "冷静施法", "每点减少全部冰霜技能法力消耗 2%。"],
    ["frost.duration", "冰域掌控", "每点延长本人施加的寒意 5%。"], ["frost.resilience", "寒冰韧性", "每点缩短自身受到的寒意、减速和冻结时间 4%。"]
] as const).entries()) add({ id, name, description, kind: "passive", parentRank: 0, maximum: 5, initial: 0, level: 2,
    investment: [2, 6, 12, 18][i], x: 620, y: 420 + i * 165, school: "frost" });
add({ id: "frost.shatter", name: "碎冰", description: "每点使冻结目标承受的直接冰伤额外增加 10%；自身寒意积累乘 75%。与永冬互斥。", kind: "mastery", parent: "icestorm", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 475, y: 910, school: "frost", exclusive: "frost.winter" });
add({ id: "frost.winter", name: "永冬", description: "每点增加 15% 寒意积累和 10% 冻结时长；直接冰伤乘 85%。与碎冰互斥。", kind: "mastery", parent: "blizzard", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 765, y: 910, school: "frost", exclusive: "frost.shatter" });
const fireBranches: typeof branches = [
    ["fireball", undefined, 0, 0, 2, 0, ["炽焰", "溅射", "节流"]],
    ["fireray", "fireball", -1, 1, 8, 6, ["热流", "扩束", "速燃"]],
    ["firewall", "fireray", -1, 2, 20, 18, ["火势", "火线", "余烬"]],
    ["firedomain", "firewall", -1, 3, 45, 40, ["焚蚀", "疆域", "长燃"]],
    ["pyroblast", "fireball", 1, 1, 8, 6, ["爆芯", "弹群", "急咏"]],
    ["meteor", "pyroblast", 1, 2, 20, 18, ["陨击", "冲击范围", "蓄能"]],
    ["doom", "meteor", 1, 3, 45, 40, ["终焰", "毁灭范围", "复苏"]]
];
addBranches(fireBranches, "fire");
for (const [i, [id, name, description]] of ([
    ["fire.study", "火焰研习", "每点增加全部火系直接伤害与灼烧伤害 3%。"], ["fire.economy", "控火节流", "每点减少全部火系技能法力消耗 2%。"],
    ["fire.duration", "余热延续", "每点延长本人施加的灼烧 5%。"], ["fire.resilience", "耐热体魄", "火系直接命中后获得两秒保护，每点减伤 1%；重复命中刷新时间，灼烧不触发。"]
] as const).entries()) add({ id, name, description, kind: "passive", parentRank: 0, maximum: 5, initial: 0, level: 2,
    investment: [2, 6, 12, 18][i], x: 620, y: 420 + i * 165, school: "fire" });
add({ id: "fire.wildfire", name: "燎原", description: "每点增加一层自身灼烧上限与 8% 灼烧伤害；直接火伤乘 85%。与爆燃互斥。", kind: "mastery", parent: "firewall", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 475, y: 910, school: "fire", exclusive: "fire.combustion" });
add({ id: "fire.combustion", name: "爆燃", description: "每点增加 10% 直接火伤和 5 个百分点引爆转化率；自身灼烧伤害乘 80%。与燎原互斥。", kind: "mastery", parent: "meteor", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 765, y: 910, school: "fire", exclusive: "fire.wildfire" });
addBranches([
    ["arc", undefined, 0, 0, 2, 0, ["电势", "支路", "节流"]],
    ["thunderlance", "arc", -1, 1, 8, 6, ["高压", "穿透", "急咏"]],
    ["thunderstrike", "thunderlance", -1, 2, 20, 18, ["雷威", "落雷数", "聚焦"]],
    ["judgment", "thunderstrike", -1, 3, 45, 40, ["天威", "覆盖", "复苏"]],
    ["chain", "arc", 1, 1, 8, 6, ["初压", "跳跃", "远导"]],
    ["thunderfield", "chain", 1, 2, 20, 18, ["电场", "扩域", "持续"]],
    ["tempest", "thunderfield", 1, 3, 45, 40, ["主脉", "分叉", "续流"]]
], "lightning");
for (const [i, [id, name, description]] of ([
    ["lightning.study", "雷电研习", "每点增加全部雷系直接伤害 3%。"], ["lightning.economy", "电荷节流", "每点减少全部雷系技能法力消耗 2%。"],
    ["lightning.duration", "导电专注", "每点延长本人施加的导电标记 5%；导电不叠层，不造成额外伤害。"],
    ["lightning.resilience", "静电防护", "雷系成功命中后获得三秒静电防护，每点减伤 1%；重复刷新，与其他保护取较强值，不相乘。"]
] as const).entries()) add({ id, name, description, kind: "passive", parentRank: 0, maximum: 5, initial: 0, level: 2,
    investment: [2, 6, 12, 18][i], x: 620, y: 420 + i * 165, school: "lightning" });
add({ id: "lightning.overload", name: "过载", description: "每点增加 12% 直接雷伤；法力消耗统一乘 120%。与导流互斥。", kind: "mastery", parent: "thunderstrike", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 475, y: 910, school: "lightning", exclusive: "lightning.conduction" });
add({ id: "lightning.conduction", name: "导流", description: "每点增加一个电弧/连锁/电场短链/电网目标及 5% 后跳距离；直接雷伤统一乘 85%。与过载互斥。", kind: "mastery", parent: "thunderfield", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 765, y: 910, school: "lightning", exclusive: "lightning.overload" });
addBranches([
    ["starbolt", undefined, 0, 0, 2, 0, ["星芒", "星屑", "节流"]],
    ["infusion", "starbolt", -1, 1, 8, 6, ["增幅", "蓄星", "恒定"]],
    ["blades", "infusion", -1, 2, 20, 18, ["刃芒", "环域", "回旋"]],
    ["resonance", "blades", -1, 3, 45, 40, ["共振", "续辉", "周转"]],
    ["ward", "starbolt", 1, 1, 8, 6, ["厚壁", "持守", "节流"]],
    ["shelter", "ward", 1, 2, 20, 18, ["坚壁", "久护", "净化"]],
    ["bastion", "shelter", 1, 3, 45, 40, ["穹顶", "延展", "回护"]]
], "stars");
for (const [i, [id, name, description]] of ([
    ["stars.study", "星辰研习", "每点增加星辰直接伤害和护盾量 3%；不放大强化或减伤百分比。"],
    ["stars.economy", "星能节流", "每点减少全部星辰技能法力消耗 2%。"],
    ["stars.duration", "充盈护盾", "每点增加星辰护盾量 5%，与研习及专属护盾威力相加。"],
    ["stars.resilience", "星体坚韧", "每点缩短自身受到的减速、寒意与冻结时间 3%；与寒冰韧性相加，不提供元素抗性。"]
] as const).entries()) add({ id, name, description, kind: "passive", parentRank: 0, maximum: 5, initial: 0, level: 2,
    investment: [2, 6, 12, 18][i], x: 620, y: 420 + i * 165, school: "stars" });
add({ id: "stars.radiance", name: "耀星", description: "每点增加技能强化 5 个百分点；星辰护盾生成量统一乘 85%。与守望互斥。", kind: "mastery", parent: "blades", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 475, y: 910, school: "stars", exclusive: "stars.sentinel" });
add({ id: "stars.sentinel", name: "守望", description: "每点增加星辰护盾量 10% 和庇护减伤 3 个百分点；所有直接技能伤害统一乘 90%，不降低灼烧。与耀星互斥。", kind: "mastery", parent: "shelter", parentRank: 3,
    maximum: 3, initial: 0, level: 30, investment: 28, x: 765, y: 910, school: "stars", exclusive: "stars.radiance" });
for (const [i, skill] of SKILL_IDS.filter(id => !isFrostSkill(id) && !isFireSkill(id) && !isLightningSkill(id) && !isStarSkill(id)).entries()) add({ id: skill, name: SKILLS[skill].name, description: SKILLS[skill].description,
    kind: "active", skill, parentRank: 0, maximum: skill === "dash" ? 1 : 5, initial: 1, level: SKILLS[skill].unlock, investment: 0,
    x: 145 + (i % 3) * 220, y: 120 + Math.floor(i / 3) * 220, school: "legacy" });
export const SKILL_NODES: readonly SkillNode[] = Object.freeze(nodes);
const indices = new Map(SKILL_NODES.map((node, index) => [node.id, index]));
export function nodeIndex(id: string): number {
    const index = indices.get(id);
    if (index === undefined) throw new RangeError("Unknown skill node");
    return index;
}
export const initialSkillRanks = (): number[] => SKILL_NODES.map(node => node.initial);
export function investedPoints(ranks: readonly number[], school?: SkillNode["school"]): number {
    return SKILL_NODES.reduce((sum, node, i) => sum + (school && node.school !== school ? 0 : ranks[i] - node.initial), 0);
}
export function nodeRequirement(node: SkillNode, ranks: readonly number[], level: number): string | null {
    if (level < node.level) return `角色 ${node.level} 级解锁`;
    if (node.parent && ranks[nodeIndex(node.parent)] < node.parentRank) return `需要 ${SKILL_NODES[nodeIndex(node.parent)].name} ${node.parentRank} 级`;
    const spent = investedPoints(ranks, node.school) - (ranks[nodeIndex(node.id)] - node.initial);
    if (spent < node.investment) return `本系还需投入 ${node.investment - spent} 点`;
    if (node.exclusive && ranks[nodeIndex(node.exclusive)] > 0) return "同系专精互斥，请先退回另一专精";
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
        if (node.school === "legacy" && level < node.level + rank - 1) return "角色等级不足以强化该术式";
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
    return Object.freeze(Object.fromEntries([...FROST_SKILLS, ...FIRE_SKILLS, ...LIGHTNING_SKILLS, ...STAR_SKILLS, "pulse", "vortex"].map(value => {
        const id = value as SkillId;
        if (!isFrostSkill(id) && !isFireSkill(id) && !isLightningSkill(id) && !isStarSkill(id)) return [id, Object.freeze({ ...NO_SKILL_MODIFIERS, sentinel: rank("stars.sentinel") })];
        const school = isStarSkill(id) ? "stars" : isLightningSkill(id) ? "lightning" : isFireSkill(id) ? "fire" : "frost";
        return [id, Object.freeze({ ...NO_SKILL_MODIFIERS, power: rank(`${id}.power`), shape: rank(`${id}.shape`), tempo: rank(`${id}.tempo`),
            damage: rank(`${school}.study`), economy: rank(`${school}.economy`), duration: rank(`${school}.duration`), sentinel: rank("stars.sentinel"),
            ...(school === "frost" ? { shatter: rank("frost.shatter"), winter: rank("frost.winter") }
                : school === "fire" ? { wildfire: rank("fire.wildfire"), combustion: rank("fire.combustion"), resilience: rank("fire.resilience") }
                    : school === "lightning" ? { overload: rank("lightning.overload"), conduction: rank("lightning.conduction"), resilience: rank("lightning.resilience") }
                        : { radiance: rank("stars.radiance"), resilience: rank("stars.resilience") }) })];
    })));
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

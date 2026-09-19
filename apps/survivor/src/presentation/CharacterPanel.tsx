import { useState } from "react";
import { ATTRIBUTE_IDS, BONUS_INFO, EQUIPMENT_SLOTS, SLOT_NAMES, type AttributeId, type BonusId } from "../core/Equipment";
import type { PlayerSnapshot } from "../core/CombatState";
import type { SessionCommand } from "../app/CombatSession";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { RARITIES, RARITY_NAMES } from "../core/Loot";
import { Hint, ItemDetails, ItemIcon, statValue } from "./ItemView";
import { WindowHeader } from "./WindowChrome";
import { UiIcon } from "./UiIcon";
import { OrbSockets } from "./OrbDrag";
import { ItemTooltip } from "./ItemTooltip";

const ATTRIBUTE_INFO: Readonly<Record<AttributeId, { name: string; detail: string }>> = {
    might: { name: "力量", detail: "基础攻击" }, vitality: { name: "体魄", detail: "基础生命、防御、回复" },
    agility: { name: "敏捷", detail: "基础移速、格挡值" }, spirit: { name: "精神", detail: "基础法力、法力回复" }
};
const STAT_GROUPS = [
    { name: "进攻与命中", ids: ["damage", "damageBonus", "damageIncrease", "attackSpeed", "castSpeed", "accuracy", "criticalChance", "criticalDamage", "excellentChance", "excellentDamage", "lethalChance", "lethalDamage", "lifeExtraction", "normalDamage", "eliteDamage"] },
    { name: "防御与生存", ids: ["maxHealth", "maxHealthBonus", "armor", "armorBonus", "block", "blockChance", "blockBonus", "evasion", "damageReduction", "criticalResistance", "criticalDamageReduction", "eliteReduction", "shieldRecovery", "thorns", "thornsPerMille", "thornsCap"] },
    { name: "回复与探索", ids: ["healthRegen", "regenBonus", "lifesteal", "moveSpeed", "experienceBonus", "goldBonus", "pickupRadius"] },
] as const satisfies readonly { readonly name: string; readonly ids: readonly BonusId[] }[];

export function CharacterPanel({ player, disabled, dispatch, onClose }: {
    readonly player: PlayerSnapshot; readonly disabled: boolean; readonly dispatch: (command: SessionCommand) => void;
    readonly onClose: () => void;
}) {
    const [inspectedId, setInspectedId] = useState<number>();
    const inspected = [...Object.values(player.equipment), ...player.orbs].find(item => item?.id === inspectedId);
    return <section className="character-window window" role="dialog" aria-label="角色" data-testid="character-panel">
        <WindowHeader title="角色" icon="character" shortcut="C" close={onClose} help={<><p>选择装备查看详情，双击卸下；宝珠拖入槽位嵌入或交换。</p><p>属性右侧 + 分配点数。展开属性分组查看完整数值，悬停图标可比较装备。</p></>}><span>Lv. {player.level}</span></WindowHeader>
        <div className="character-columns">
            <div className="equipment-pane"><div className="section-heading"><h3>随身装备</h3><small>{Object.keys(player.equipment).length} / {EQUIPMENT_SLOTS.length} 已装备</small></div>
                <div className="paper-doll" aria-label="装备栏">
                    {EQUIPMENT_SLOTS.map(slot => {
                        const item = player.equipment[slot];
                        return <div key={slot} className={`equipment-slot slot-${slot} rarity-${item?.rarity ?? "common"}${item ? " occupied" : " empty"}${item && item.id === inspectedId ? " selected" : ""}`} data-slot={slot}>
                            <span className="slot-label">{SLOT_NAMES[slot]}</span><ItemTooltip item={item} player={player}><button className="item-icon-trigger"
                            aria-label={`${SLOT_NAMES[slot]}${item ? `：${item.name}` : "：空"}`} onClick={() => setInspectedId(item?.id)}
                            onDoubleClick={() => !disabled && dispatch({ type: "unequip", slot })}>
                            <ItemIcon item={item} type="equipment" value={slot} /></button></ItemTooltip>
                            <span className="slot-value">{item ? `${item.score} 分 · ${"★".repeat(item.stars)}` : "未装备"}</span>
                        </div>;
                    })}
                </div>
                <div className="section-heading orb-heading"><h3>寻宝宝珠</h3><small>{ORB_UNLOCK_LEVELS.filter(level => player.level >= level).length} / 6 已解锁</small></div>
                <OrbSockets player={player} disabled={disabled} onInspect={setInspectedId} onRemove={socket => dispatch({ type: "remove-orb", socket })} />
                <p className="orb-resonance-summary">共鸣：{player.orbResonance.pairs.length} 类配对 · {player.orbResonance.diversity} 种类型<br />金币 +{player.orbResonance.goldBonus * 100}% · 打造消耗 −{player.orbResonance.craftDiscount * 100}%</p>
                <div className="equipment-inspector">{inspected ? <><ItemDetails item={inspected} />
                    {inspected.type === "equipment" && <>{inspected.autoEquipped && <button disabled={disabled} onClick={() => dispatch({ type: "set-equipment-lock", itemId: inspected.id, locked: true })}>锁定保留</button>}
                        <button disabled={disabled} onClick={() => { dispatch({ type: "unequip", slot: inspected.value }); setInspectedId(undefined); }}>卸下装备</button></>}
                    {inspected.type === "orb" && <button disabled={disabled} onClick={() => { dispatch({ type: "remove-orb", socket: player.orbs.findIndex(orb => orb?.id === inspected.id) }); setInspectedId(undefined); }}>取下宝珠</button>}
                </> : <div className="empty-inspector"><UiIcon name="shield" /><strong>查看装备详情</strong><span>选择装备或宝珠，查看属性与词条</span></div>}</div>
            </div>
            <div className="attributes-pane"><div className="character-power" aria-label="角色战力"><span>总战力 <Hint label="战力">根据角色等级、基础属性与装备结算后的战斗属性加权评分；已计入百分比加成和属性上限。金币、经验与拾取范围不计战力，装备评分另含这些收益。战力用于综合比较，具体词条可在装备详情查看。</Hint></span><strong data-testid="character-power">{player.battlePower}</strong><small>装备贡献 <b>+{player.equipmentPower}</b> · 加成已计入下方属性</small></div><div className="primary-stats" aria-label="核心属性">
                <div><span>攻击</span><strong>{statValue("damage", player.stats.damage)}</strong></div><div><span>防御</span><strong>{statValue("armor", player.stats.armor)}</strong></div><div><span>生命</span><strong>{player.stats.maxHealth}</strong></div>
            </div><div className="section-heading"><h3>基础属性</h3><span className={`attribute-points${player.unspentAttributePoints > 0 ? " available" : ""}`}>{player.unspentAttributePoints} 点可分配</span></div>
                <div className="attribute-list">{ATTRIBUTE_IDS.map(id => <div className="attribute-row" key={id}>
                    <span>{ATTRIBUTE_INFO[id].name}<Hint label={ATTRIBUTE_INFO[id].name}>{ATTRIBUTE_INFO[id].detail}。包含灵境永久 +{player.spiritRealm.attributes[id]}；加点不改变掉落分布或战斗概率。</Hint><small>{ATTRIBUTE_INFO[id].detail}</small></span>
                    <strong>{player.attributes[id]}</strong><button aria-label={`提升${ATTRIBUTE_INFO[id].name}`} disabled={disabled || !player.unspentAttributePoints} onClick={() => dispatch({ type: "allocate", attribute: id })}>+</button>
                </div>)}</div>
                <div className="loot-summary"><span>装备爆率 <Hint label="装备爆率"><strong>寻宝分布</strong>
                    <p>普通怪 {(player.lootProfile.normalDropChance * 100).toFixed(1)}% · 精英 {(player.lootProfile.eliteDropChance * 100).toFixed(1)}%</p>
                    <p>掉落判定后，品质从彩到白分层判断；宝珠寻宝收益递减。</p>
                    {RARITIES.map((rarity, index) => <div key={rarity}>{RARITY_NAMES[rarity]}品质 {(player.lootProfile.qualities[index] * 100).toFixed(2)}%</div>)}
                    <p>{player.lootProfile.stars.map((chance, index) => `${index + 1}星 ${(chance * 100).toFixed(1)}%`).join(" · ")}</p>
                    <small>宝箱与领主保底另行生效；寻宝不提高宝珠自身掉率。</small>
                </Hint></span><b>{(player.lootProfile.normalDropChance * 100).toFixed(1)}%</b></div>
                <div className="stat-groups">{STAT_GROUPS.map((group, index) => <details className="stat-group" key={group.name} open={index === 0}>
                    <summary>{group.name}<small>{group.ids.length + (index === 2 ? 2 : 0)} 项</small></summary>
                    <dl className="character-stats">{index === 2 && <><div><dt>法力</dt><dd>{player.stats.maxMana}</dd></div><div><dt>法力回复</dt><dd>{player.stats.manaRegen.toFixed(1)}/0.5秒</dd></div></>}
                        {group.ids.map(id => <div key={id}><dt>{BONUS_INFO[id].name}{BONUS_INFO[id].unit !== "flat" && <Hint label={BONUS_INFO[id].name}>{BONUS_INFO[id].detail}{id === "goldBonus" && `；含宝珠共鸣 +${player.orbResonance.goldBonus * 100}%`}</Hint>}</dt><dd>{statValue(id, player.stats[id] + (id === "goldBonus" ? player.orbResonance.goldBonus : 0))}</dd></div>)}
                    </dl>
                </details>)}</div>
            </div>
        </div>
    </section>;
}

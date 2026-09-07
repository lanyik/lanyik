import { useState } from "react";
import { ATTRIBUTE_IDS, BONUS_IDS, BONUS_INFO, EQUIPMENT_SLOTS, SLOT_NAMES, type AttributeId } from "../core/Equipment";
import type { PlayerSnapshot } from "../core/CombatSimulation";
import type { SessionCommand } from "../app/CombatSession";
import { ORB_UNLOCK_LEVELS } from "../core/Orbs";
import { RARITIES, RARITY_NAMES } from "../core/Loot";
import { Hint, ItemDetails, ItemIcon, statValue } from "./ItemView";
import type { InventoryItem } from "../core/InventoryItem";

const ATTRIBUTE_INFO: Readonly<Record<AttributeId, { name: string; detail: string }>> = {
    might: { name: "力量", detail: "基础攻击" }, vitality: { name: "体魄", detail: "基础生命、防御、回复" },
    agility: { name: "敏捷", detail: "基础移速、格挡值" }, spirit: { name: "精神", detail: "基础法力、法力回复" }
};
export function CharacterPanel({ player, disabled, dispatch, onClose, socket, onSocket }: {
    readonly player: PlayerSnapshot; readonly disabled: boolean; readonly dispatch: (command: SessionCommand) => void;
    readonly onClose: () => void; readonly socket: number; readonly onSocket: (socket: number) => void;
}) {
    const [inspected, setInspected] = useState<InventoryItem>();
    return <section className="character-window window" role="dialog" aria-label="角色" data-testid="character-panel">
        <header className="window-heading"><div><span className="eyebrow">CHARACTER</span><h2>守夜人 <small>Lv.{player.level}</small></h2></div><button className="close-button" aria-label="关闭角色" onClick={onClose}>×</button></header>
        <div className="character-columns">
            <div className="equipment-pane"><h3>装备</h3>
                <div className="paper-doll" aria-label="装备栏">
                    {EQUIPMENT_SLOTS.map(slot => {
                        const item = player.equipment[slot];
                        return <button key={slot} className={`equipment-slot slot-${slot} rarity-${item?.rarity ?? "common"}`} data-slot={slot}
                            aria-label={`${SLOT_NAMES[slot]}${item ? `：${item.name}` : "：空"}`} onClick={() => setInspected(item)}
                            onDoubleClick={() => !disabled && dispatch({ type: "unequip", slot })}>
                            <span className="slot-label">{SLOT_NAMES[slot]}</span><ItemIcon kind={slot} />
                            <span className="slot-value">{item ? `Lv.${item.itemLevel} ${"★".repeat(item.stars)}` : "—"}</span>
                        </button>;
                    })}
                </div>
                <div className="section-heading"><h3>宝珠</h3><small>{ORB_UNLOCK_LEVELS.filter(level => player.level >= level).length} / 6</small></div>
                <div className="orb-sockets" aria-label="宝珠栏">{ORB_UNLOCK_LEVELS.map((level, index) => {
                    const orb = player.orbs[index]; const locked = player.level < level;
                    return <button key={index} className={`orb-socket rarity-${orb?.rarity ?? "common"}${socket === index ? " selected" : ""}`}
                        disabled={locked} aria-label={`宝珠槽 ${index + 1}${locked ? `，${level}级解锁` : orb ? `，${orb.name}` : "，空"}`}
                        onClick={() => { onSocket(index); setInspected(orb); }} onDoubleClick={() => !disabled && dispatch({ type: "remove-orb", socket: index })}>
                        <ItemIcon kind="orb" /><small>{locked ? `Lv.${level}` : index + 1}</small>
                    </button>;
                })}</div>
                <div className="equipment-inspector">{inspected ? <><ItemDetails item={inspected} />
                    {inspected.kind === "equipment" && player.equipment[inspected.slot]?.id === inspected.id && <button disabled={disabled} onClick={() => { dispatch({ type: "unequip", slot: inspected.slot }); setInspected(undefined); }}>卸下装备</button>}
                    {inspected.kind === "orb" && player.orbs.some(orb => orb?.id === inspected.id) && <button disabled={disabled} onClick={() => { dispatch({ type: "remove-orb", socket: player.orbs.findIndex(orb => orb?.id === inspected.id) }); setInspected(undefined); }}>取下宝珠</button>}
                </> : <div className="empty-inspector">装备详情</div>}</div>
            </div>
            <div className="attributes-pane"><div className="section-heading"><h3>属性</h3><span className="attribute-points">{player.unspentAttributePoints} 点可用</span></div>
                <div className="attribute-list">{ATTRIBUTE_IDS.map(id => <div className="attribute-row" key={id}>
                    <span>{ATTRIBUTE_INFO[id].name}<Hint label={ATTRIBUTE_INFO[id].name}>{ATTRIBUTE_INFO[id].detail}。加点不改变掉落分布或战斗概率。</Hint></span>
                    <strong>{player.attributes[id]}</strong><button aria-label={`提升${ATTRIBUTE_INFO[id].name}`} disabled={disabled || !player.unspentAttributePoints} onClick={() => dispatch({ type: "allocate", attribute: id })}>+</button>
                </div>)}</div>
                <div className="loot-summary"><span>装备爆率 <Hint label="装备爆率"><strong>寻宝分布</strong>
                    <p>普通怪 {(player.lootProfile.normalDropChance * 100).toFixed(1)}% · 精英 {(player.lootProfile.eliteDropChance * 100).toFixed(1)}%</p>
                    <p>掉落判定后，品质从彩到白分层判断；宝珠寻宝收益递减。</p>
                    {RARITIES.map((rarity, index) => <div key={rarity}>{RARITY_NAMES[rarity]}品质 {(player.lootProfile.qualities[index] * 100).toFixed(2)}%</div>)}
                    <p>{player.lootProfile.stars.map((chance, index) => `${index + 1}星 ${(chance * 100).toFixed(1)}%`).join(" · ")}</p>
                    <small>宝箱与领主保底另行生效；寻宝不提高宝珠自身掉率。</small>
                </Hint></span><b>{(player.lootProfile.normalDropChance * 100).toFixed(1)}%</b></div>
                <dl className="character-stats"><div><dt>法力</dt><dd>{player.stats.maxMana}</dd></div><div><dt>法力回复</dt><dd>{player.stats.manaRegen.toFixed(1)}/0.5秒</dd></div>
                    {BONUS_IDS.map(id => <div key={id}><dt>{BONUS_INFO[id].name}{BONUS_INFO[id].unit !== "flat" && <Hint label={BONUS_INFO[id].name}>{BONUS_INFO[id].detail}</Hint>}</dt><dd>{statValue(id, player.stats[id])}</dd></div>)}
                </dl>
            </div>
        </div>
    </section>;
}

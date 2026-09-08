import type { Equipment } from "../core/Equipment";
import type { PlayerSnapshot } from "../core/CombatSimulation";
import { compareEquipment } from "../core/EquipmentEvaluation";
import { ItemIcon } from "./ItemView";
import { ItemTooltip, signed } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";

export function UpgradePrompt({ item, player, count, onEquip, onDismiss }: {
    readonly item: Equipment; readonly player: PlayerSnapshot; readonly count: number;
    readonly onEquip: () => void; readonly onDismiss: () => void;
}) {
    const comparison = compareEquipment(item, player);
    return <aside className={`upgrade-prompt panel rarity-${item.rarity}`} aria-label="更好装备" data-item-id={item.id}>
        <header><span>发现更好的装备{count > 1 && <small> · {count} 件可提升</small>}</span><button aria-label="忽略本件装备提示" className="close-button" onClick={onDismiss}><UiIcon name="close" /></button></header>
        <ItemTooltip item={item} player={player}><button className="upgrade-item" onClick={onEquip} aria-label={`穿戴${item.name}`}>
            <ItemIcon kind={item.slot} /><span><strong>{item.name}</strong><small>Lv.{item.itemLevel} · {"★".repeat(item.stars)} · 评分 {item.score}</small></span><b className="power-up">+{comparison.delta}<small>战力</small></b>
        </button></ItemTooltip>
        <footer><span>战力 {player.battlePower} → <b>{comparison.power}</b><small>装备评分 {signed(comparison.scoreDelta)}</small></span><button className="primary-action" onClick={onEquip}>一键穿戴</button></footer>
    </aside>;
}

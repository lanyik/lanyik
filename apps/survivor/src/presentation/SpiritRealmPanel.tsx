import { ATTRIBUTE_IDS, ATTRIBUTE_NAMES } from "../core/Equipment";
import { spiritLevel } from "../core/SpiritRealm";
import { GAME_CONFIG } from "../core/GameConfig";
import type { PlayerSnapshot } from "../core/CombatState";
import type { CombatCommand } from "../core/CombatCommand";
import { UiIcon } from "./UiIcon";

export function SpiritRealmPanel({ player, dispatch, disabled, onClose }: { player: PlayerSnapshot; dispatch: (command: CombatCommand) => void; disabled: boolean; onClose: () => void }) {
    const realm = player.spiritRealm, cost = GAME_CONFIG.spiritRealm.soulsPerLevel;
    return <aside className="spirit-window window" role="dialog" aria-label="灵境"><header className="window-heading"><div className="window-title"><UiIcon name="spirit" /><div><span className="eyebrow">SPIRIT REALM</span><h2>灵境 · {spiritLevel(realm)} 阶</h2></div></div><button className="close-button" aria-label="关闭灵境" onClick={onClose}><UiIcon name="close" /></button></header>
        <div className="spirit-body"><div className="spirit-souls"><UiIcon name="spirit" /><span>持有灵魂<strong>{realm.souls.toLocaleString("zh-CN")}</strong></span></div><p>每击杀一只怪物自动提取 1 灵魂。每次注入 {cost} 灵魂，选择一项基础属性永久 +1。</p>
            <div className="spirit-progress"><span style={{ width: `${Math.min(1, realm.souls / cost) * 100}%` }} /></div><small>{realm.souls >= cost ? `可成长 ${Math.floor(realm.souls / cost)} 次` : `距离下次成长还需 ${cost - realm.souls} 灵魂`}</small>
            <div className="spirit-paths">{ATTRIBUTE_IDS.map(attribute => <article key={attribute}><UiIcon name="spirit" /><h3>{ATTRIBUTE_NAMES[attribute]}</h3><p>永久加成 <b>+{realm.attributes[attribute]}</b></p><button disabled={disabled || realm.souls < cost} onClick={() => dispatch({ type: "cultivate-spirit", attribute })}>注入 {cost} 灵魂 · +1</button></article>)}</div>
            <p className="spirit-persistence">灵境自动保存到当前浏览器，死亡、重开和刷新后保留。</p></div></aside>;
}

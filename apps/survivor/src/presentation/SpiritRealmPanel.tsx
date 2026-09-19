import { ATTRIBUTE_IDS, ATTRIBUTE_NAMES } from "../core/Equipment";
import { spiritLevel } from "../core/SpiritRealm";
import { GAME_CONFIG } from "../core/GameConfig";
import type { PlayerSnapshot } from "../core/CombatState";
import type { CombatCommand } from "../core/CombatCommand";
import { UiIcon } from "./UiIcon";
import { useState } from "react";
import { WindowHeader } from "./WindowChrome";

export function SpiritRealmPanel({ player, dispatch, disabled, onClose }: { player: PlayerSnapshot; dispatch: (command: CombatCommand) => void; disabled: boolean; onClose: () => void }) {
    const realm = player.spiritRealm, cost = GAME_CONFIG.spiritRealm.soulsPerLevel;
    const [selected, select] = useState<typeof ATTRIBUTE_IDS[number]>("might");
    return <aside className="spirit-window window" role="dialog" aria-label="灵境">
        <WindowHeader title="灵境" icon="spirit" shortcut="L" close={onClose} help={<><p>每击杀一只怪物获得 1 灵魂。选择一项属性，注入 {cost} 灵魂获得永久 +1。</p><p>灵境保存在当前浏览器，死亡、重开和刷新后保留。</p></>}><span>{spiritLevel(realm)} 阶</span></WindowHeader>
        <div className="spirit-body"><div className="spirit-souls"><UiIcon name="spirit" /><span>持有灵魂<strong>{realm.souls.toLocaleString("zh-CN")}</strong></span></div>
            <div className="spirit-progress"><span style={{ width: `${Math.min(1, realm.souls / cost) * 100}%` }} /></div><small>{realm.souls >= cost ? `可成长 ${Math.floor(realm.souls / cost)} 次` : `距离下次成长还需 ${cost - realm.souls} 灵魂`}</small>
            <div className="spirit-paths" role="group" aria-label="成长属性">{ATTRIBUTE_IDS.map(attribute => <button key={attribute} className={selected === attribute ? "selected" : ""} aria-pressed={selected === attribute} onClick={() => select(attribute)}>
                <span>{ATTRIBUTE_NAMES[attribute]}</span><strong>+{realm.attributes[attribute]}</strong><small>永久加成</small></button>)}</div></div>
        <footer className="action-footer"><div className="selection-summary"><strong>{ATTRIBUTE_NAMES[selected]} +1</strong><small>{realm.souls < cost ? `还需 ${cost - realm.souls} 灵魂` : `消耗 ${cost} 灵魂 · 永久生效`}</small></div>
            <button className="primary-action" disabled={disabled || realm.souls < cost} onClick={() => dispatch({ type: "cultivate-spirit", attribute: selected })}>注入灵魂</button></footer>
    </aside>;
}

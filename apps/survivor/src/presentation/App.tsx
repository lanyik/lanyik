import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CombatSession } from "../app/CombatSession";
import { PULSE_MANA_COST } from "../core/CombatSimulation";
import type { InventoryItem } from "../core/InventoryItem";
import { CharacterPanel } from "./CharacterPanel";
import { InventoryPanel } from "./InventoryPanel";
import { RegionMap } from "./RegionMap";
import { ItemIcon } from "./ItemView";
import { UiIcon } from "./UiIcon";
import { UpgradePrompt } from "./UpgradePrompt";
import "./app.css";

const MENUS = [{ id: "character", name: "角色", key: "C", code: "KeyC" }, { id: "inventory", name: "背包", key: "B", code: "KeyB" },
    { id: "map", name: "地图", key: "M", code: "KeyM" }, { id: "skills", name: "技能", key: "K", code: "KeyK" }] as const;
type Menu = typeof MENUS[number]["id"];
function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function App({ session }: { readonly session: CombatSession }) {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const [panels, setPanels] = useState<Record<Menu, boolean>>({ character: false, inventory: false, map: false, skills: false });
    const [socket, setSocket] = useState(0);
    const [frontPanel, setFrontPanel] = useState<"character" | "inventory">("character");
    const [selectedId, setSelectedId] = useState<number>();
    const workspace = useRef<HTMLDivElement>(null);
    const combat = snapshot.combat;
    const player = combat?.player;
    const toggle = (menu: Menu) => {
        if (menu === "character" || menu === "inventory") setFrontPanel(menu);
        setPanels(current => ({ ...current, [menu]: !current[menu] }));
    };
    const close = (menu: Menu) => setPanels(current => ({ ...current, [menu]: false }));
    const useItem = (item: InventoryItem) => {
        if (item.kind === "equipment") session.dispatch({ type: "equip", itemId: item.id });
        else if (item.kind === "orb") session.dispatch({ type: "equip-orb", itemId: item.id, socket });
        else session.dispatch({ type: "use-consumable", itemId: item.id, effect: item.effect });
    };
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (snapshot.status !== "ready" || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
                || target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input:not([type=checkbox]), textarea, select"))) return;
            const menu = MENUS.find(item => item.code === event.code)?.id ?? (event.code === "KeyI" ? "inventory" : undefined);
            if (menu) toggle(menu);
            else if (event.code === "KeyP") session.dispatch({ type: "toggle-pause" });
            else if (event.code === "Escape") {
                const open = (["inventory", "character", "skills", "map"] as const).find(id => panels[id]);
                if (open) close(open); else session.dispatch({ type: "toggle-pause" });
            } else if (event.code === "Digit1") session.dispatch({ type: "cast-pulse" });
            else if (event.code === "Digit2") session.dispatch({ type: "use-consumable", effect: "health" });
            else if (event.code === "Digit3") session.dispatch({ type: "use-consumable", effect: "mana" });
            else if (event.code === "KeyF") session.dispatch({ type: "toggle-autocast" });
            else if (event.code === "KeyR" && combat?.gameOver) session.dispatch({ type: "restart" });
            else if (panels.inventory && selectedId !== undefined && !combat?.gameOver && (event.code === "Enter" || event.code === "Delete")) {
                // A narrow workspace keeps the other window mounted but hides it.
                if (!workspace.current?.querySelector(".inventory-window")?.getClientRects().length) return;
                // Focused buttons keep their native Enter activation instead of firing two actions.
                if (event.code === "Enter" && target instanceof HTMLButtonElement) return;
                const item = player?.inventory.find(candidate => candidate.id === selectedId);
                if (item) { if (event.code === "Enter") useItem(item); else session.dispatch({ type: "discard", itemId: item.id }); }
            } else return;
            event.preventDefault();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [panels, selectedId, socket, player, combat?.gameOver, snapshot.status, session]);

    const ready = snapshot.status === "ready" && combat && player;
    const potionCount = (effect: "health" | "mana") => player?.inventory.filter(item => item.kind === "consumable" && item.effect === effect).length ?? 0;
    return <main className="survivor" data-state={snapshot.status} data-paused={snapshot.paused} data-game-over={combat?.gameOver ?? false}>
        {ready && <>
            <section className="run-stats panel" aria-label="战斗记录"><header className="run-brand"><UiIcon name="rift" /><strong>荒原<span>RIFT</span></strong><span className={`run-state${snapshot.paused ? " paused" : ""}`}>{combat.gameOver ? "狩猎结束" : snapshot.paused ? "已暂停" : "探索中"}</span></header>
                <div className="run-metrics"><div><span>生存时间</span><strong data-testid="elapsed-time" data-tick={combat.tick}>{formatTime(combat.elapsedMs)}</strong></div>
                    <div><span>击杀</span><b data-testid="kill-count">{combat.kills}</b></div><div><span>区域怪物</span><b data-testid="enemy-count">{combat.livingEnemies}</b></div></div>
            </section>
            <RegionMap combat={combat} expanded={panels.map} onToggle={() => toggle("map")} />
            {combat.boss && <section className="boss-status panel"><strong>裂爪领主</strong><small>距离 {Math.round(Math.hypot(combat.boss.x - player.x, combat.boss.z - player.z))}</small>
                <div className="bar health-bar"><span style={{ width: `${combat.boss.health / combat.boss.maxHealth * 100}%` }} /><b>{Math.ceil(combat.boss.health)} / {Math.ceil(combat.boss.maxHealth)}</b></div></section>}
            {(panels.character || panels.inventory) && <div ref={workspace} className={`panel-workspace${panels.character && panels.inventory ? " paired" : ""}`} data-front={frontPanel}>
                {panels.character && panels.inventory && <nav className="workspace-switcher" aria-label="切换窗口">
                    <button className={frontPanel === "character" ? "active" : ""} aria-pressed={frontPanel === "character"} onClick={() => setFrontPanel("character")}><UiIcon name="character" />角色装备</button>
                    <button className={frontPanel === "inventory" ? "active" : ""} aria-pressed={frontPanel === "inventory"} onClick={() => setFrontPanel("inventory")}><UiIcon name="inventory" />背包物品</button>
                </nav>}
            {panels.character && <CharacterPanel player={player} disabled={combat.gameOver} dispatch={command => session.dispatch(command)} onClose={() => close("character")} socket={socket} onSocket={setSocket} />}
            {panels.inventory && <InventoryPanel player={player} selectedId={selectedId} onSelect={setSelectedId} onClose={() => close("inventory")}
                onUse={useItem} onDiscard={itemId => session.dispatch({ type: "discard", itemId })}
                onSort={() => session.dispatch({ type: "sort-inventory" })} onAutoClear={enabled => session.dispatch({ type: "set-auto-clear-equipment", enabled })}
                onClear={() => session.dispatch({ type: "clear-inferior-equipment" })}
                socket={socket} onSocket={setSocket} disabled={combat.gameOver} />}
            </div>}
            {panels.skills && <section className="skills-window window" role="dialog" aria-label="技能">
                <header className="window-heading"><div className="window-title"><UiIcon name="skills" /><div><span className="eyebrow">ABILITIES</span><h2>技能</h2></div></div><button className="close-button" aria-label="关闭技能" onClick={() => close("skills")}><UiIcon name="close" /></button></header>
                <article><UiIcon name="crossbow" /><div><h3>守夜弩击 <span>自动攻击</span></h3><p>攻击最近的敌人，每秒 <b>{player.stats.attackRate.toFixed(2)}</b> 次。可触发暴击、卓越与致命一击。</p></div></article>
                <article><UiIcon name="pulse" /><div><h3>裂隙脉冲 <kbd>1</kbd></h3><p>对周围 <b>3.2</b> 范围造成 <b>130%</b> 攻击伤害，消耗 <b>{PULSE_MANA_COST}</b> 法力，冷却 <b>{player.stats.skillInterval.toFixed(1)}</b> 秒。</p>
                    <button onClick={() => session.dispatch({ type: "toggle-autocast" })}>自动施法：{player.autoCast ? "开启" : "关闭"}<kbd>F</kbd></button></div></article>
                <article><UiIcon name="shield" /><div><h3>免伤盾 <span>被动</span></h3><p>抵挡一次命中后，经过 <b>{player.stats.shieldRecovery.toFixed(1)}</b> 秒恢复。</p></div></article>
            </section>}
            <section className="combat-dock" aria-label="角色状态与技能">
                <div className="hud-power"><span>战力 <strong data-testid="battle-power">{player.battlePower}</strong></span><small>装备 +{player.equipmentPower}</small></div>
                <div className="status-bar" aria-label="状态栏"><span className={player.shieldRemaining <= 0 ? "ready" : ""}><UiIcon name="shield" />免伤盾 {player.shieldRemaining > 0 ? `${player.shieldRemaining.toFixed(1)}s` : "就绪"}</span>
                    {snapshot.paused && <span className="dock-pause">战斗暂停</span>}
                    <button aria-pressed={player.autoCast} onClick={() => session.dispatch({ type: "toggle-autocast" })}><i className={player.autoCast ? "enabled" : ""} />自动施法 {player.autoCast ? "开" : "关"}<kbd>F</kbd></button></div>
                <div className="vitals"><div className="level-medallion"><small>等级</small><strong data-testid="player-level">{player.level}</strong></div>
                    <div className="vital-bars"><div className={`bar health-bar${player.health / player.stats.maxHealth <= .25 ? " critical" : ""}`} aria-label="生命"><span style={{ width: `${player.health / player.stats.maxHealth * 100}%` }} /><b><em>{player.health / player.stats.maxHealth <= .25 ? "生命危急" : "生命"}</em>{Math.ceil(player.health)} / {player.stats.maxHealth}</b></div>
                        <div className="bar mana-bar" aria-label="法力"><span style={{ width: `${player.mana / player.stats.maxMana * 100}%` }} /><b><em>法力</em>{Math.floor(player.mana)} / {player.stats.maxMana}</b></div>
                        <div className="experience-track" aria-label="经验"><div className="experience-label"><span>经验</span><b>{Math.floor(player.experience)} / {player.experienceToLevel}</b></div><div className="bar experience-bar"><span style={{ width: `${player.experience / player.experienceToLevel * 100}%` }} /></div></div></div></div>
                <div className="skill-slots"><div className="skill-slot passive"><UiIcon className="skill-symbol" name="crossbow" /><span>守夜弩击</span><small>自动攻击</small></div>
                    <button className="skill-slot pulse-skill" disabled={combat.gameOver || snapshot.paused || player.skillRemaining > 0 || player.mana < PULSE_MANA_COST} onClick={() => session.dispatch({ type: "cast-pulse" })}>
                        <kbd>1</kbd><UiIcon className="skill-symbol" name="pulse" /><span>裂隙脉冲</span><small>{player.skillRemaining > 0 ? `${player.skillRemaining.toFixed(1)}s` : `${PULSE_MANA_COST} 法力`}</small></button>
                    {(["health", "mana"] as const).map((effect, index) => <button key={effect} className={`skill-slot ${effect}-skill`}
                        disabled={combat.gameOver || snapshot.paused || player.potionRemaining > 0 || potionCount(effect) === 0 || (effect === "health" ? player.health >= player.stats.maxHealth : player.mana >= player.stats.maxMana)}
                        onClick={() => session.dispatch({ type: "use-consumable", effect })}><kbd>{index + 2}</kbd><ItemIcon className="skill-symbol" kind="consumable" /><span>{effect === "health" ? "生命药剂" : "法力药剂"}</span><small>{player.potionRemaining > 0 ? `${player.potionRemaining.toFixed(1)}s` : `× ${potionCount(effect)}`}</small></button>)}
                </div>
            </section>
            <nav className="interface-menu panel" aria-label="界面快捷键">{MENUS.map(menu => <button key={menu.id} className={panels[menu.id] ? "active" : ""} aria-expanded={panels[menu.id]} onClick={() => toggle(menu.id)}>
                <UiIcon name={menu.id} /><span>{menu.name}{menu.id === "character" && player.unspentAttributePoints > 0 && <i>{player.unspentAttributePoints}</i>}</span><kbd>{menu.key}</kbd></button>)}
                <button onClick={() => session.dispatch({ type: "toggle-pause" })}><UiIcon name={snapshot.paused ? "play" : "pause"} /><span>{snapshot.paused ? "继续" : "暂停"}</span><kbd>P</kbd></button></nav>
            <div className="notices" aria-live="polite">{snapshot.notices.map(notice => <div className={`notice ${notice.tone}`} key={notice.id}>{notice.message}</div>)}</div>
            {snapshot.upgrades[0] && !combat.gameOver && !Object.values(panels).some(Boolean) && <UpgradePrompt item={snapshot.upgrades[0]} player={player} count={snapshot.upgrades.length}
                onEquip={() => session.dispatch({ type: "equip", itemId: snapshot.upgrades[0].id })}
                onDismiss={() => session.dispatch({ type: "dismiss-upgrade", itemId: snapshot.upgrades[0].id })} />}
            {snapshot.paused && !combat.gameOver && <div className="pause-banner"><span>战斗暂停</span><button onClick={() => session.dispatch({ type: "toggle-pause" })}>继续<kbd>P</kbd></button></div>}
            {combat.gameOver && <div className="state-overlay death"><div><small>本次狩猎结束</small><h1>你已倒下</h1><p>坚持 {formatTime(combat.elapsedMs)} · 击杀 {combat.kills} · 达到 {player.level} 级</p><button onClick={() => session.dispatch({ type: "restart" })}>再次踏入荒原<kbd>R</kbd></button></div></div>}
        </>}
        {snapshot.status === "loading" && <div className="state-overlay loading"><div className="loading-rune" /><div><small>RIFT / 荒原</small><h1>荒原正在苏醒</h1><p>准备地域与角色资源…</p></div></div>}
        {snapshot.status === "failed" && <div className="state-overlay failed" role="alert"><div><h1>无法进入荒原</h1><p>{snapshot.error}</p><button onClick={() => void session.start(snapshot.seed)}>重新尝试</button></div></div>}
    </main>;
}

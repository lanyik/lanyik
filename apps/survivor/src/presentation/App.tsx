import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CombatSession, SessionSnapshot } from "../app/CombatSession";
import { GAME_CONFIG } from "../core/GameConfig";
import type { AttachRegionMap } from "../app/RegionMapBinding";
import { POTIONS, canUseConsumable, selectConsumable, type InventoryItem } from "../core/InventoryItem";
import { CharacterPanel } from "./CharacterPanel";
import { InventoryPanel } from "./InventoryPanel";
import { RegionMap } from "./RegionMap";
import { ItemIcon, QUALITY_CSS } from "./ItemView";
import { ItemTooltip, ItemTooltipProvider } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";
import { UpgradePrompt } from "./UpgradePrompt";
import { WorkerLoadPanel } from "./WorkerLoadPanel";
import { SkillsPanel } from "./SkillsPanel";
import { SkillDragProvider } from "./SkillDrag";
import { OrbDragProvider } from "./OrbDrag";
import { SkillSlot } from "./SkillSlot";
import { CraftingPanel } from "./CraftingPanel";
import { SpiritRealmPanel } from "./SpiritRealmPanel";
import { CraftConfirmation } from "./CraftConfirmation";
import type { CraftOperation } from "../core/Crafting";
import { recycleRef } from "../core/Recycling";
import { SessionMenu } from "./SessionMenu";
import "./app.css";
import "./menus.css";

const MENUS = [{ id: "character", name: "角色", key: "C", code: "KeyC" }, { id: "inventory", name: "背包", key: "B", code: "KeyB" },
    { id: "map", name: "地图", key: "M", code: "KeyM" }, { id: "skills", name: "技能", key: "K", code: "KeyK" },
    { id: "craft", name: "打造", key: "J", code: "KeyJ" }, { id: "spirit", name: "灵境", key: "L", code: "KeyL" }, { id: "system", name: "存档", key: "O", code: "KeyO" }] as const;
type Menu = typeof MENUS[number]["id"];
function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function App({ session, attachRegionMap, onHome }: { readonly session: CombatSession; readonly attachRegionMap: AttachRegionMap; readonly onHome: () => Promise<void> }) {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    return <SessionInterface key={snapshot.generation} session={session} snapshot={snapshot} attachRegionMap={attachRegionMap} onHome={onHome} />;
}

function SessionInterface({ session, snapshot, attachRegionMap, onHome }: {
    readonly session: CombatSession; readonly snapshot: SessionSnapshot; readonly attachRegionMap: AttachRegionMap;
    readonly onHome: () => Promise<void>;
}) {
    const [panels, setPanels] = useState<Record<Menu, boolean>>({ character: false, inventory: false, map: false, skills: false, craft: false, spirit: false, system: false });
    const resumeAfterMenu = useRef(false);
    const [craftItemId, setCraftItemId] = useState<number>();
    const [recycling, setRecycling] = useState<CraftOperation>();
    const [frontPanel, setFrontPanel] = useState<"character" | "inventory">("character");
    const [selectedId, setSelectedId] = useState<number>();
    const workspace = useRef<HTMLDivElement>(null);
    const combat = snapshot.combat;
    const player = combat?.player;
    const toggle = (menu: Menu) => {
        if (menu === "system") {
            if (panels.system) { close("system"); return; }
            resumeAfterMenu.current = !session.isPaused && !combat?.gameOver;
            if (resumeAfterMenu.current) session.dispatch({ type: "toggle-pause" });
        } else if (panels.system) return;
        if (menu === "inventory" && !panels.inventory) session.dispatch({ type: "sort-inventory" });
        if (menu === "character" || menu === "inventory") setFrontPanel(menu);
        setPanels(current => ({ ...current,
            ...(menu === "craft" || menu === "spirit" || menu === "system" ? { character: false, inventory: false, skills: false, craft: false, spirit: false } : { craft: false, spirit: false }), [menu]: !current[menu] }));
    };
    const close = (menu: Menu) => {
        if (menu === "system" && resumeAfterMenu.current && session.isPaused) session.dispatch({ type: "toggle-pause" });
        if (menu === "system") resumeAfterMenu.current = false;
        setPanels(current => ({ ...current, [menu]: false }));
    };
    const recycle = (item: InventoryItem) => { if (!(item.type === "equipment" && item.locked)) setRecycling({ kind: "recycle", item: recycleRef(item) }); };
    const useItem = (item: InventoryItem) => {
        if (item.type === "equipment") session.dispatch({ type: "equip", itemId: item.id });
        else if (item.type === "consumable") session.dispatch({ type: "use-consumable", itemId: item.id, effect: POTIONS[item.value].resource });
    };
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (snapshot.status !== "ready" || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
                || document.querySelector("dialog[open]")
                || target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input:not([type=checkbox]), textarea, select"))) return;
            const menu = MENUS.find(item => item.code === event.code)?.id ?? (event.code === "KeyI" ? "inventory" : undefined);
            if (panels.system && event.code !== "Escape" && menu !== "system") return;
            if (menu) toggle(menu);
            else if (event.code === "KeyP") session.dispatch({ type: "toggle-pause" });
            else if (event.code === "Escape") {
                const open = (["system", "craft", "spirit", "inventory", "character", "skills", "map"] as const).find(id => panels[id]);
                if (open) close(open); else session.dispatch({ type: "toggle-pause" });
            } else if (/^Digit[1-9]$/.test(event.code) && Number(event.code.slice(-1)) <= GAME_CONFIG.skills.slots && player) session.dispatch({ type: "cast-skill", skill: player.skills.loadout[Number(event.code.slice(-1)) - 1] });
            else if (event.code === "KeyQ") session.dispatch({ type: "use-consumable", effect: "health" });
            else if (event.code === "KeyE") session.dispatch({ type: "use-consumable", effect: "mana" });
            else if (event.code === "KeyF") session.dispatch({ type: "toggle-autocast" });
            else if (event.code === "KeyR" && combat?.gameOver) session.dispatch({ type: "restart" });
            else if (panels.inventory && selectedId !== undefined && !combat?.gameOver && (event.code === "Enter" || event.code === "Delete")) {
                // A narrow workspace keeps the other window mounted but hides it.
                if (!workspace.current?.querySelector(".inventory-window")?.getClientRects().length) return;
                // Focused buttons keep their native Enter activation instead of firing two actions.
                if (event.code === "Enter" && target instanceof HTMLButtonElement) return;
                const item = player?.inventory.find(candidate => candidate.id === selectedId);
                if (item) { if (event.code === "Enter") useItem(item); else recycle(item); }
            } else return;
            event.preventDefault();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [panels, selectedId, player, combat?.gameOver, snapshot.status, session]);

    const ready = snapshot.status === "ready" && combat && player;
    const potionSlots = (["health", "mana"] as const).map(effect => ({ effect,
        item: player ? selectConsumable(player.inventory, effect, player) : undefined,
        count: player?.inventory.reduce((count, item) => count + (item.type === "consumable" && POTIONS[item.value].resource === effect ? item.size : 0), 0) ?? 0 }));
    return <ItemTooltipProvider><SkillDragProvider player={player} disabled={!ready || combat.gameOver} dispatch={command => session.dispatch(command)}><OrbDragProvider player={player} disabled={!ready || combat.gameOver} dispatch={command => session.dispatch(command)}><main className="survivor" data-state={snapshot.status} data-paused={snapshot.paused} data-game-over={combat?.gameOver ?? false}>
        <style>{QUALITY_CSS}</style>
        {ready && <>
            <section className="run-stats panel" aria-label="战斗记录"><header className="run-brand"><UiIcon name="rift" /><strong>荒原<span>RIFT</span></strong><span className={`run-state${snapshot.paused ? " paused" : ""}`}>{combat.gameOver ? "狩猎结束" : snapshot.paused ? "已暂停" : "探索中"}</span></header>
                <div className="run-metrics"><div><span>生存时间</span><strong data-testid="elapsed-time" data-tick={combat.tick}>{formatTime(combat.elapsedMs)}</strong></div>
                    <div><span>击杀</span><b data-testid="kill-count">{combat.kills}</b></div><div><span>区域怪物</span><b data-testid="enemy-count">{combat.livingEnemies}</b></div></div>
                <WorkerLoadPanel workers={snapshot.workerLoads} performance={snapshot.performance} />
            </section>
            <RegionMap combat={combat} expanded={panels.map} onToggle={() => toggle("map")} attach={attachRegionMap} />
            {combat.boss && <section className="boss-status panel"><strong>裂爪领主{combat.boss.enraged ? " · 狂暴" : ""}</strong><small>距离 {Math.round(Math.hypot(combat.boss.x - player.x, combat.boss.z - player.z))}</small>
                <div className="bar health-bar"><span style={{ width: `${combat.boss.health / combat.boss.maxHealth * 100}%` }} /><b>{Math.ceil(combat.boss.health)} / {Math.ceil(combat.boss.maxHealth)}</b></div></section>}
            {(panels.character || panels.inventory) && <div ref={workspace} className={`panel-workspace${panels.character && panels.inventory ? " paired" : ""}`} data-front={frontPanel}>
                {panels.character && panels.inventory && <nav className="workspace-switcher" aria-label="切换窗口">
                    <button className={frontPanel === "character" ? "active" : ""} aria-pressed={frontPanel === "character"} onClick={() => setFrontPanel("character")}><UiIcon name="character" />角色装备</button>
                    <button className={frontPanel === "inventory" ? "active" : ""} aria-pressed={frontPanel === "inventory"} onClick={() => setFrontPanel("inventory")}><UiIcon name="inventory" />背包物品</button>
                </nav>}
            {panels.character && <CharacterPanel player={player} disabled={combat.gameOver} dispatch={command => session.dispatch(command)} onClose={() => close("character")} />}
            {panels.inventory && <InventoryPanel player={player} selectedId={selectedId} onSelect={setSelectedId} onClose={() => close("inventory")}
                onUse={useItem} onRecycle={recycle}
                onBulkRecycle={belowLevel => setRecycling({ kind: "recycle-equipment", belowLevel, items: player.inventory.filter(item => item.type === "equipment" && !item.locked && item.itemLevel < belowLevel).map(item => ({ id: item.id, revision: item.type === "equipment" ? item.revision : 0 })) })}
                onSort={() => session.dispatch({ type: "sort-inventory" })} onAutoRecycle={(itemType, maximum) => session.dispatch({ type: "set-auto-recycle", itemType, maximum })}
                onMerge={() => session.dispatch({ type: "merge-consumables" })}
                onLock={(itemId, locked) => session.dispatch({ type: "set-equipment-lock", itemId, locked })}
                onCraft={item => { setCraftItemId(item.id); toggle("craft"); }} onRemoveOrb={socket => session.dispatch({ type: "remove-orb", socket })}
                disabled={combat.gameOver} paused={snapshot.paused} />}
            </div>}
            {panels.skills && <SkillsPanel player={player} disabled={combat.gameOver} dispatch={command => session.dispatch(command)} onClose={() => close("skills")} />}
            {panels.craft && <CraftingPanel key={craftItemId ?? "forge"} player={player} initialItem={player.inventory.find(item => item.id === craftItemId)} disabled={combat.gameOver} dispatch={command => session.dispatch(command)} onClose={() => close("craft")} />}
            {panels.spirit && <SpiritRealmPanel player={player} disabled={combat.gameOver} dispatch={command => session.dispatch(command)} onClose={() => close("spirit")} />}
            {panels.system && <SessionMenu session={session} snapshot={snapshot} close={() => close("system")} home={onHome} />}
            <span className="save-status" role="status">{snapshot.saveStatus.busy ? "正在保存…" : snapshot.saveStatus.error ? `保存失败：${snapshot.saveStatus.error}` : snapshot.saveStatus.savedAt ? `已保存 ${new Date(snapshot.saveStatus.savedAt).toLocaleTimeString("zh-CN")}` : ""}</span>
            {recycling && <CraftConfirmation operation={recycling} player={player} disabled={combat.gameOver} close={() => setRecycling(undefined)} confirm={operation => session.dispatch({ type: "craft", operation })} />}
            <section className="combat-dock" aria-label="角色状态与技能">
                <div className="hud-power"><span>战力 <strong data-testid="battle-power">{player.battlePower}</strong></span><small>装备 +{player.equipmentPower}</small></div>
                <div className="status-bar" aria-label="状态栏"><span className={player.shieldRemaining <= 0 ? "ready" : ""}><UiIcon name="shield" />免伤盾 {player.shieldRemaining > 0 ? `${player.shieldRemaining.toFixed(1)}s` : "就绪"}</span>
                    {snapshot.paused && <span className="dock-pause">战斗暂停</span>}
                    {player.skills.ward > 0 && <span>结界 {Math.ceil(player.skills.ward)}</span>}
                    <button aria-pressed={player.autoCast} onClick={() => session.dispatch({ type: "toggle-autocast" })}><i className={player.autoCast ? "enabled" : ""} />自动施法 {player.autoCast ? "开" : "关"}<kbd>F</kbd></button></div>
                <div className="vitals"><div className="level-medallion"><small>等级</small><strong data-testid="player-level">{player.level}</strong></div>
                    <div className="vital-bars"><div className={`bar health-bar${player.health / player.stats.maxHealth <= .25 ? " critical" : ""}`} aria-label="生命"><span style={{ width: `${player.health / player.stats.maxHealth * 100}%` }} /><b><em>{player.health / player.stats.maxHealth <= .25 ? "生命危急" : "生命"}</em>{Math.ceil(player.health)} / {player.stats.maxHealth}</b></div>
                        <div className="bar mana-bar" aria-label="法力"><span style={{ width: `${player.mana / player.stats.maxMana * 100}%` }} /><b><em>法力</em>{Math.floor(player.mana)} / {player.stats.maxMana}</b></div>
                        <div className="experience-track" aria-label="经验"><div className="experience-label"><span>经验</span><b>{Math.floor(player.experience)} / {player.experienceToLevel}</b></div><div className="bar experience-bar"><span style={{ width: `${player.experience / player.experienceToLevel * 100}%` }} /></div></div></div></div>
                <div className="skill-slots">
                    {player.skills.loadout.map((id, index) => <SkillSlot key={index} index={index} player={player} blocked={combat.gameOver || snapshot.paused} cast={() => session.dispatch({ type: "cast-skill", skill: id })} />)}
                    {potionSlots.map(({ effect, item, count }, index) => <div key={effect} className={`skill-slot ${effect}-skill`}>
                        <kbd>{index === 0 ? "Q" : "E"}</kbd><ItemTooltip item={item} player={player}><button className="item-icon-trigger" aria-label={effect === "health" ? "使用生命药剂" : "使用法力药剂"}
                        disabled={combat.gameOver || snapshot.paused || player.potionRemaining > 0 || !item || !canUseConsumable(item, player)}
                        onClick={() => session.dispatch({ type: "use-consumable", effect })}><ItemIcon item={item} type="consumable" value={effect} className="skill-symbol" /></button></ItemTooltip><span>{effect === "health" ? "生命药剂" : "法力药剂"}</span><small>{player.potionRemaining > 0 ? `${player.potionRemaining.toFixed(1)}s` : `× ${count}`}</small></div>)}
                </div>
            </section>
            <nav className="interface-menu panel" aria-label="界面快捷键">{MENUS.map(menu => <button key={menu.id} className={panels[menu.id] ? "active" : ""} aria-expanded={panels[menu.id]} onClick={() => toggle(menu.id)}>
                <UiIcon name={menu.id} /><span>{menu.name}{menu.id === "character" && player.unspentAttributePoints > 0 && <i>{player.unspentAttributePoints}</i>}{menu.id === "skills" && player.skills.points > 0 && <i>{player.skills.points}</i>}</span><kbd>{menu.key}</kbd></button>)}
                <button onClick={() => session.dispatch({ type: "toggle-pause" })}><UiIcon name={snapshot.paused ? "play" : "pause"} /><span>{snapshot.paused ? "继续" : "暂停"}</span><kbd>P</kbd></button></nav>
            <div className="notices" aria-live="polite">{snapshot.notices.map(notice => <div className={`notice ${notice.tone}`} key={notice.id}>{notice.message}</div>)}</div>
            {snapshot.upgrades[0] && !combat.gameOver && !Object.values(panels).some(Boolean) && <UpgradePrompt item={snapshot.upgrades[0]} player={player} count={snapshot.upgrades.length}
                onEquip={() => session.dispatch({ type: "equip", itemId: snapshot.upgrades[0].id })}
                onDismiss={() => session.dispatch({ type: "dismiss-upgrade", itemId: snapshot.upgrades[0].id })} />}
            {snapshot.paused && !combat.gameOver && !panels.system && <div className="pause-banner"><span>战斗暂停</span><button onClick={() => session.dispatch({ type: "toggle-pause" })}>继续<kbd>P</kbd></button></div>}
            {combat.gameOver && !panels.system && <div className="state-overlay death"><div><small>本次狩猎结束</small><h1>你已倒下</h1><p>坚持 {formatTime(combat.elapsedMs)} · 击杀 {combat.kills} · 达到 {player.level} 级</p><button onClick={() => session.dispatch({ type: "restart" })}>再次踏入荒原<kbd>R</kbd></button><button onClick={() => toggle("system")}>读取存档</button><button onClick={() => void onHome()}>返回主界面</button></div></div>}
        </>}
        {snapshot.status === "loading" && <div className="state-overlay loading"><div className="loading-rune" /><div><small>RIFT / 荒原</small><h1>荒原正在苏醒</h1><p>准备地域与角色资源…</p></div></div>}
        {snapshot.status === "failed" && <div className="state-overlay failed" role="alert"><div><h1>无法进入荒原</h1><p>{snapshot.error}</p><button onClick={() => void session.retry()}>重新尝试</button><button onClick={() => void onHome()}>返回主界面</button></div></div>}
    </main></OrbDragProvider></SkillDragProvider></ItemTooltipProvider>;
}

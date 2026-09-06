import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ATTRIBUTE_IDS, EQUIPMENT_SLOTS, type AttributeId, type Equipment, type EquipmentBonuses, type EquipmentSlot } from "../core/Equipment";
import { INVENTORY_CAPACITY } from "../core/CombatSimulation";
import type { CombatSession } from "../app/CombatSession";
import "./app.css";

const SLOT_NAMES: Readonly<Record<EquipmentSlot, string>> = Object.freeze({ weapon: "武器", armor: "护甲", ring: "指环" });
const ATTRIBUTE_INFO: Readonly<Record<AttributeId, { readonly name: string; readonly detail: string }>> = Object.freeze({
    might: { name: "力量", detail: "提高基础伤害" },
    vitality: { name: "体魄", detail: "提高生命、护甲和恢复" },
    agility: { name: "敏捷", detail: "提高移速、攻速和暴击" },
    fortune: { name: "寻宝", detail: "提高拾取范围和装备品质" }
});
const BONUS_INFO: Readonly<Record<keyof EquipmentBonuses, { readonly name: string; readonly percent?: boolean }>> = Object.freeze({
    damage: { name: "伤害" },
    maxHealth: { name: "生命" },
    armor: { name: "护甲" },
    moveSpeed: { name: "移动速度", percent: true },
    attackSpeed: { name: "攻击速度", percent: true },
    criticalChance: { name: "暴击率", percent: true },
    pickupRadius: { name: "拾取范围" },
    healthRegen: { name: "生命恢复" }
});

function formatTime(elapsedMs: number): string {
    const total = Math.floor(elapsedMs / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function bonusLines(item: Equipment): readonly string[] {
    return (Object.keys(item.bonuses) as (keyof EquipmentBonuses)[])
        .filter(id => item.bonuses[id] > 0)
        .map(id => {
            const info = BONUS_INFO[id];
            const value = info.percent ? `${Math.round(item.bonuses[id] * 100)}%` : Number.isInteger(item.bonuses[id])
                ? String(item.bonuses[id]) : item.bonuses[id].toFixed(1);
            return `+${value} ${info.name}`;
        });
}

function GearCard({ item, current, onEquip, onDiscard }: {
    readonly item: Equipment;
    readonly current?: Equipment;
    readonly onEquip?: () => void;
    readonly onDiscard?: () => void;
}) {
    const delta = item.score - (current?.score ?? 0);
    return <article className={`gear-card rarity-${item.rarity}`} data-testid="inventory-item">
        <header>
            <div>
                <span className="gear-level">物品等级 {item.itemLevel}</span>
                <h4>{item.name}</h4>
            </div>
            <span className="gear-score">{item.score}</span>
        </header>
        <div className="gear-meta"><span>{SLOT_NAMES[item.slot]}</span>{onEquip && <span className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{delta} 战力</span>}</div>
        <ul>{bonusLines(item).map(line => <li key={line}>{line}</li>)}</ul>
        {(onEquip || onDiscard) && <footer>
            {onEquip && <button className="equip-button" onClick={onEquip}>装备</button>}
            {onDiscard && <button className="discard-button" onClick={onDiscard}>丢弃</button>}
        </footer>}
    </article>;
}

export function App({ session }: { readonly session: CombatSession }) {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const [inventoryOpen, setInventoryOpen] = useState(false);
    const combat = snapshot.combat;
    const player = combat?.player;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
                || target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"))) return;
            if (event.code === "KeyI") {
                event.preventDefault();
                setInventoryOpen(open => !open);
            } else if (event.code === "KeyP") {
                event.preventDefault();
                session.dispatch({ type: "toggle-pause" });
            } else if (event.code === "Escape" && inventoryOpen) {
                event.preventDefault();
                setInventoryOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [inventoryOpen, session]);

    const inventoryBySlot = useMemo(() => {
        const result: Record<EquipmentSlot, Equipment[]> = { weapon: [], armor: [], ring: [] };
        for (const item of player?.inventory ?? []) result[item.slot].push(item);
        for (const slot of EQUIPMENT_SLOTS) result[slot].sort((first, second) => second.score - first.score || first.id - second.id);
        return result;
    }, [player?.inventory]);

    const ready = snapshot.status === "ready" && combat && player;
    return <main className="survivor" data-state={snapshot.status} data-paused={snapshot.paused} data-game-over={combat?.gameOver ?? false}>
        {ready && <>
            <section className="top-hud" aria-label="战斗状态">
                <div className="level-medallion"><small>等级</small><strong data-testid="player-level">{player.level}</strong></div>
                <div className="vitals">
                    <div className="bar health-bar"><span style={{ width: `${player.health / player.stats.maxHealth * 100}%` }} /><b>{Math.ceil(player.health)} / {player.stats.maxHealth}</b></div>
                    <div className="bar experience-bar"><span style={{ width: `${player.experience / player.experienceToLevel * 100}%` }} /><b>{Math.floor(player.experience)} / {player.experienceToLevel} 经验</b></div>
                </div>
                <div className="run-stats">
                    <span><small>存活</small><strong data-testid="elapsed-time" data-tick={combat.tick}>{formatTime(combat.elapsedMs)}</strong></span>
                    <span><small>击杀</small><strong data-testid="kill-count">{combat.kills}</strong></span>
                    <span><small>怪群</small><strong data-testid="enemy-count">{combat.livingEnemies}</strong></span>
                </div>
            </section>

            <section className="character-panel panel">
                <header><div><small>流亡猎手</small><h2>守夜人</h2></div><span className="power">战力 {Math.round(player.stats.damage * player.stats.attackRate)}</span></header>
                <div className="stat-grid">
                    <span><small>伤害</small><b>{player.stats.damage.toFixed(1)}</b></span>
                    <span><small>攻速</small><b>{player.stats.attackRate.toFixed(2)}/秒</b></span>
                    <span><small>暴击</small><b>{Math.round(player.stats.criticalChance * 100)}%</b></span>
                    <span><small>护甲</small><b>{player.stats.armor.toFixed(1)}</b></span>
                </div>
                <div className="attribute-heading"><span>角色属性</span>{player.unspentAttributePoints > 0 && <b>{player.unspentAttributePoints} 点可用</b>}</div>
                <div className="attribute-list">
                    {ATTRIBUTE_IDS.map(attribute => <div className="attribute-row" key={attribute}>
                        <div><span>{ATTRIBUTE_INFO[attribute].name}</span><small>{ATTRIBUTE_INFO[attribute].detail}</small></div>
                        <strong>{player.attributes[attribute]}</strong>
                        <button aria-label={`提升${ATTRIBUTE_INFO[attribute].name}`} disabled={player.unspentAttributePoints === 0 || combat.gameOver}
                            onClick={() => session.dispatch({ type: "allocate", attribute })}>+</button>
                    </div>)}
                </div>
            </section>

            <div className="action-cluster">
                <button className="round-action" aria-label={snapshot.paused ? "继续" : "暂停"} onClick={() => session.dispatch({ type: "toggle-pause" })}>
                    <span>{snapshot.paused ? "▶" : "Ⅱ"}</span><small>{snapshot.paused ? "继续" : "暂停"} · P</small>
                </button>
                <button className={`round-action inventory-action${inventoryOpen ? " active" : ""}`} aria-label="装备背包" aria-expanded={inventoryOpen}
                    onClick={() => setInventoryOpen(open => !open)}>
                    <span>◆</span><small>装备 · I</small><b>{player.inventory.length}</b>
                </button>
            </div>

            <aside className={`inventory panel${inventoryOpen ? " open" : ""}`} aria-label="装备背包" aria-hidden={!inventoryOpen}>
                <header><div><small>猎物战利品</small><h2>装备背包</h2></div><button aria-label="关闭装备背包" onClick={() => setInventoryOpen(false)}>×</button></header>
                <div className="bag-capacity"><span>容量</span><b>{player.inventory.length} / {INVENTORY_CAPACITY}</b></div>
                <section className="equipped-grid">
                    {EQUIPMENT_SLOTS.map(slot => <div className="equipped-slot" key={slot}>
                        <small>{SLOT_NAMES[slot]}</small>
                        {player.equipment[slot] ? <GearCard item={player.equipment[slot]!} /> : <div className="empty-slot">尚未装备</div>}
                    </div>)}
                </section>
                <div className="bag-items">
                    {player.inventory.length === 0 && <div className="empty-bag"><span>◇</span><p>击杀怪物后，靠近发光装备即可拾取。</p></div>}
                    {EQUIPMENT_SLOTS.flatMap(slot => inventoryBySlot[slot].map(item => <GearCard key={item.id} item={item} current={player.equipment[item.slot]}
                        onEquip={() => session.dispatch({ type: "equip", itemId: item.id })}
                        onDiscard={() => session.dispatch({ type: "discard", itemId: item.id })} />))}
                </div>
            </aside>

            <div className="control-hint"><span className="keys"><b>W</b><b>A</b><b>S</b><b>D</b></span><span>移动躲避 · 武器自动攻击最近目标 · 靠近光点拾取</span></div>

            <div className="notices" aria-live="polite">
                {snapshot.notices.map(notice => <div className={`notice ${notice.tone}`} key={notice.id}>{notice.message}</div>)}
            </div>

            {snapshot.paused && !combat.gameOver && <div className="state-overlay compact"><div><small>荒原时间冻结</small><h1>战斗暂停</h1><button onClick={() => session.dispatch({ type: "toggle-pause" })}>返回战斗</button></div></div>}
            {combat.gameOver && <div className="state-overlay death"><div><small>本次猎杀结束</small><h1>你已倒下</h1><p>坚持 {formatTime(combat.elapsedMs)} · 击杀 {combat.kills} · 达到 {player.level} 级</p><button onClick={() => session.dispatch({ type: "restart" })}>再次踏入荒原</button></div></div>}
        </>}

        {snapshot.status === "loading" && <div className="state-overlay loading"><div className="loading-rune" /><div><small>正在撕开世界裂隙</small><h1>荒原正在苏醒</h1><p>准备怪群、战利品与战斗地形……</p></div></div>}
        {snapshot.status === "failed" && <div className="state-overlay failed" role="alert"><div><small>世界加载中断</small><h1>无法进入荒原</h1><p>{snapshot.error}</p><button onClick={() => void session.start(snapshot.seed)}>重新尝试</button></div></div>}
    </main>;
}

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BONUS_INFO, SLOT_NAMES, EQUIPMENT_SLOTS, type Equipment, type EquipmentAffix } from "../core/Equipment";
import { quoteCraft, type CraftOperation, type CraftQuote } from "../core/Crafting";
import type { CombatCommand } from "../core/CombatCommand";
import type { PlayerSnapshot } from "../core/CombatState";
import { compareInventoryItems, type InventoryItem } from "../core/InventoryItem";
import { orbDust } from "../core/Orbs";
import { recycleRef } from "../core/Recycling";
import { RARITIES, RARITY_NAMES } from "../core/Loot";
import { ItemIcon, ItemDetails, statValue } from "./ItemView";
import { ItemTooltip, useDismissItemTooltip } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";
import { useSlotDrag } from "./useSlotDrag";
import { CraftConfirmation, SKIP_EXTRACTION } from "./CraftConfirmation";
import { VirtualItemGrid } from "./VirtualItemGrid";

type Tab = "extract" | "imbue" | "inherit" | "orbs";
type BenchSlot = "source" | "target" | "affix" | "orb";
const TABS = [{ id: "extract", name: "词条提取" }, { id: "imbue", name: "词条打入" }, { id: "inherit", name: "装备继承" }, { id: "orbs", name: "宝珠工坊" }] as const;
function affixText(affix: EquipmentAffix) { return `${BONUS_INFO[affix.stat].name} ${affix.stat === "shieldRecovery" ? "−" : "+"}${statValue(affix.stat, affix.value)}`; }
function CraftAction({ quote, title, disabled, action }: { quote?: CraftQuote; title: string; disabled: boolean; action: () => void }) {
    return <footer className="craft-action"><div>{quote?.ok ? <><span>{quote.description}</span><b>{quote.gold ? `${quote.gold} 金币` : quote.dust ? `${quote.dust} 宝珠粉尘` : quote.dustGain ? `获得 ${quote.dustGain} 宝珠粉尘` : "无额外费用"}</b></> : <span>{quote ? quote.reason : "将物品放入打造台"}</span>}</div>
        <button className="primary-action" disabled={disabled || !quote?.ok} onClick={action}>{title}</button></footer>;
}

export function CraftingPanel({ player, disabled, dispatch, onClose, initialItem }: { player: PlayerSnapshot; disabled: boolean;
    dispatch: (command: CombatCommand) => void; onClose: () => void; initialItem?: InventoryItem }) {
    const dismissTooltip = useDismissItemTooltip();
    const initialTab = initialItem?.type === "affix" ? "imbue" : initialItem?.type === "orb" ? "orbs" : "extract";
    const [tab, setTab] = useState<Tab>(initialTab), [activeSlot, setActiveSlot] = useState<BenchSlot>(initialTab === "orbs" ? "orb" : initialTab === "imbue" ? "target" : "source");
    const [sourceId, setSourceId] = useState(initialItem?.type === "equipment" ? initialItem.id : undefined);
    const [targetId, setTargetId] = useState<number>(), [affixIndex, setAffixIndex] = useState(0), [targetSlot, setTargetSlot] = useState(0);
    const [affixId, setAffixId] = useState(initialItem?.type === "affix" ? initialItem.id : undefined), [orbId, setOrbId] = useState(initialItem?.type === "orb" ? initialItem.id : undefined);
    const [search, setSearch] = useState(""), [slotFilter, setSlotFilter] = useState("all"), [rarity, setRarity] = useState("all"), [pending, setPending] = useState<CraftOperation>();
    const [lockMode, setLockMode] = useState(false);
    const equipment = useMemo(() => [...Object.values(player.equipment).filter((item): item is Equipment => Boolean(item)), ...player.inventory.filter(item => item.type === "equipment")].sort(compareInventoryItems), [player.inventory, player.equipment]);
    const source = player.inventory.find((item): item is Equipment => item.type === "equipment" && item.id === sourceId), target = equipment.find(item => item.id === targetId);
    const affix = player.inventory.find(item => item.type === "affix" && item.id === affixId), orb = player.inventory.find(item => item.type === "orb" && item.id === orbId);
    const request = (operation: CraftOperation) => {
        if (disabled || !quoteCraft(player, operation).ok) return;
        dismissTooltip();
        if (operation.kind === "extract" && localStorage.getItem(SKIP_EXTRACTION) === "1") dispatch({ type: "craft", operation }); else setPending(operation);
    };
    const imbue = (id: number, slot: number): CraftOperation | undefined => target ? { kind: "imbue", target: { id: target.id, revision: target.revision }, affixId: id, slot } : undefined;
    const operation: CraftOperation | undefined = tab === "extract" && source ? { kind: "extract", source: { id: source.id, revision: source.revision }, affix: affixIndex }
        : tab === "imbue" && affix ? imbue(affix.id, targetSlot)
        : tab === "inherit" && source && target ? { kind: "inherit", source: { id: source.id, revision: source.revision }, target: { id: target.id, revision: target.revision } } : undefined;
    const quote = operation ? quoteCraft(player, operation) : undefined;
    const slots: BenchSlot[] = tab === "inherit" ? ["source", "target"] : tab === "imbue" ? ["affix", "target"] : tab === "orbs" ? ["orb"] : ["source"];
    const slotItem = (slot: BenchSlot) => slot === "source" ? source : slot === "target" ? target : slot === "affix" ? affix : orb;
    const slotName = (slot: BenchSlot) => slot === "source" ? "来源装备" : slot === "target" ? "目标装备" : slot === "affix" ? "词条精粹" : "待处理宝珠";
    const canPlace = (item: InventoryItem, slot: BenchSlot) => slot === "source" ? item.type === "equipment" && !item.locked && player.equipment[item.value]?.id !== item.id && (tab !== "inherit" || item.id !== targetId)
        : slot === "target" ? item.type === "equipment" && (tab !== "inherit" || item.id !== sourceId) : slot === "affix" ? item.type === "affix" : item.type === "orb";
    const place = (item: InventoryItem, slot: BenchSlot) => {
        if (!canPlace(item, slot)) return;
        if (slot === "source") { setSourceId(item.id); setAffixIndex(0); if (tab === "inherit") setActiveSlot("target"); }
        else if (slot === "target") { setTargetId(item.id); setTargetSlot(0); if (tab === "imbue" && !affix) setActiveSlot("affix"); }
        else if (slot === "affix") { setAffixId(item.id); if (!target) setActiveSlot("target"); }
        else setOrbId(item.id);
    };
    const candidates = (activeSlot === "source" || activeSlot === "target" ? equipment : player.inventory.filter(item => item.type === (activeSlot === "affix" ? "affix" : "orb")))
        .filter(item => (rarity === "all" || item.rarity === rarity) && (slotFilter === "all" || item.type !== "equipment" || item.value === slotFilter) && item.name.includes(search.trim())).slice().sort(compareInventoryItems);
    // Equipment goes into bench sockets; essences can also land directly on a target affix.
    const drag = useSlotDrag<number>({ attribute: "forge", slots: slots.length + (tab === "imbue" ? target?.affixes.length ?? 0 : 0), disabled: disabled || Boolean(pending),
        name: id => [...equipment, ...player.inventory].find(item => item.id === id)?.name ?? "物品",
        canEquip: (id, index) => {
            const item = [...equipment, ...player.inventory].find(item => item.id === id);
            if (!item) return false;
            if (index === undefined) return slots.some(slot => canPlace(item, slot));
            if (index < slots.length) return canPlace(item, slots[index]);
            const op = item.type === "affix" ? imbue(id, index - slots.length) : undefined;
            return Boolean(op && quoteCraft(player, op).ok);
        }, equip: (id, index) => {
            const item = [...equipment, ...player.inventory].find(item => item.id === id)!;
            if (index < slots.length) place(item, slots[index]);
            else { setAffixId(id); setTargetSlot(index - slots.length); const op = imbue(id, index - slots.length); if (op) request(op); }
        } });
    const changeTab = (id: Tab) => { setTab(id); setActiveSlot(id === "orbs" ? "orb" : id === "imbue" ? "target" : "source"); setSearch(""); setRarity("all"); setSlotFilter("all"); };
    return <aside className="craft-window window" role="dialog" aria-label="打造">
        <header className="window-heading"><div className="window-title"><UiIcon name="craft" /><div><span className="eyebrow">FORGE / 打造</span><h2>荒原工坊</h2></div></div>
            <div className="craft-wallet"><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span><span>宝珠粉尘 <b>{player.orbDust}</b></span></div>
            <button className="close-button" aria-label="关闭打造" onClick={onClose}><UiIcon name="close" /></button></header>
        <nav className="craft-tabs">{TABS.map(entry => <button key={entry.id} className={tab === entry.id ? "active" : ""} aria-pressed={tab === entry.id} onClick={() => changeTab(entry.id)}>{entry.name}</button>)}</nav>
        <div className="craft-body">
            <section className="craft-picker" aria-label="打造物品库"><h3>选择{slotName(activeSlot)}<small>{candidates.length} 格 · 自动整理</small></h3>
                <input aria-label="搜索打造物品" placeholder="搜索名称" value={search} onChange={event => setSearch(event.target.value)} />
                <div className="craft-filters">{(activeSlot === "source" || activeSlot === "target") && <select aria-label="筛选装备部位" value={slotFilter} onChange={event => setSlotFilter(event.target.value)}><option value="all">全部部位</option>{EQUIPMENT_SLOTS.map(id => <option key={id} value={id}>{SLOT_NAMES[id]}</option>)}</select>}
                    <select aria-label="筛选物品品质" value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">全部品质</option>{RARITIES.map(id => <option key={id} value={id}>{RARITY_NAMES[id]}</option>)}</select></div>
                <button aria-pressed={lockMode} onClick={() => setLockMode(!lockMode)}>锁定模式 · Shift＋点击也可切换</button>
                <VirtualItemGrid key={`${activeSlot}:${search}:${slotFilter}:${rarity}`} className="craft-item-grid" label="打造物品格" items={candidates} minWidth={82} rowHeight={130} renderItem={item => <ItemTooltip key={item.id} item={item} player={player}><button
                    className={`craft-cell rarity-${item.rarity}${slots.some(slot => slotItem(slot)?.id === item.id) ? " selected" : ""}${item.type === "equipment" && item.locked ? " item-locked" : ""}`}
                    aria-label={`放入${slotName(activeSlot)}：${item.name}`} aria-disabled={disabled} data-unplaceable={!canPlace(item, activeSlot)}
                    data-craft-equipment={item.type === "equipment" ? item.id : undefined} data-craft-affix={item.type === "affix" ? item.id : undefined} data-craft-orb={item.type === "orb" ? item.id : undefined}
                    onClick={event => { if (disabled) return; if (item.type === "equipment" && (event.shiftKey || lockMode)) { dismissTooltip(); dispatch({ type: "set-equipment-lock", itemId: item.id, locked: !item.locked || item.autoEquipped }); } else place(item, activeSlot); }}
                    onPointerDown={event => { if (event.shiftKey || lockMode) event.preventDefault(); else drag.begin(event, item.id); }} onKeyDown={event => { if (event.shiftKey && event.code === "Space" && item.type === "equipment") { event.preventDefault(); event.stopPropagation(); dismissTooltip(); if (!disabled && !event.repeat) dispatch({ type: "set-equipment-lock", itemId: item.id, locked: !item.locked || item.autoEquipped }); } else drag.keyboard(event, item.id); }}>
                    {item.type === "equipment" && item.locked && <UiIcon name="lock" className="cell-lock-watermark" />}<ItemIcon item={item} /><b>{item.name}</b>
                    <small>{item.type === "equipment" ? `Lv.${item.itemLevel} · ${"★".repeat(item.stars)}` : item.type === "affix" ? statValue(item.value, item.amount) : item.type === "orb" ? `${orbDust(item)} 粉尘` : ""}</small>
                    {item.type === "equipment" && <small>{player.equipment[item.value]?.id === item.id ? "已穿戴" : item.locked ? "已锁定" : `评分 ${item.score}`}</small>}
                </button></ItemTooltip>} empty={<p className="craft-empty">暂无符合条件的物品</p>} />
                <p className="craft-hint">点击台上槽位切换选材。点击物品放入，或拖到槽位；空格拿起后按数字放置。</p>
            </section>
            <section className="craft-workbench" aria-label="打造台"><div className="bench-sockets">{slots.map((slot, index) => <div key={slot} className="bench-socket-wrap">
                {index > 0 && <span className="bench-arrow" aria-hidden="true">→</span>}
                <button data-forge-slot={index} data-bench-slot={slot} aria-label={`选择${slotName(slot)}`} aria-pressed={activeSlot === slot}
                    className={`bench-socket${activeSlot === slot ? " selected" : ""}${drag.over === index ? " drag-over" : ""} rarity-${slotItem(slot)?.rarity ?? "common"}`}
                    onClick={() => { setActiveSlot(slot); setSlotFilter("all"); setRarity("all"); setSearch(""); }}>
                    <small>{index + 1} · {slotName(slot)}</small><ItemIcon item={slotItem(slot)} /><b>{slotItem(slot)?.name ?? "点击选材 / 拖入物品"}</b>
                    <small>{slot === "source" ? "操作后消耗" : slot === "target" ? "保留基础属性" : slot === "affix" ? "每次消耗 1 份" : "精炼或分解"}</small>
                </button></div>)}</div>
                <div className="bench-details">
                    {tab === "extract" && <><h3>选择保留的词条</h3>{source ? <><div className="craft-affix-slots">{source.affixes.map((entry, index) => <button key={entry.stat} className={affixIndex === index ? "selected" : ""} aria-pressed={affixIndex === index} onClick={() => setAffixIndex(index)}>{affixText(entry)}<small>仅提取这一条</small></button>)}</div>
                        <div className="bench-result"><UiIcon name="craft" /><span>整件装备 → 1 份词条精粹</span><b>{source.affixes[affixIndex] && affixText(source.affixes[affixIndex])}</b></div></> : <p className="craft-empty">放入一件未锁定的背包装备。</p>}
                        <button className="craft-reset-confirm" onClick={() => localStorage.removeItem(SKIP_EXTRACTION)}>恢复提取确认提示</button></>}
                    {tab === "imbue" && <><h3>选择要覆盖的词条</h3>{target ? <div className="craft-affix-slots">{target.affixes.map((entry, index) => <button key={entry.stat} data-craft-slot={index} data-forge-slot={slots.length + index}
                        className={`${targetSlot === index ? "selected" : ""}${drag.over === slots.length + index ? " drag-over" : ""}`} aria-pressed={targetSlot === index} onClick={() => setTargetSlot(index)}>
                        <kbd>{slots.length + index + 1}</kbd>{affixText(entry)}<small>{targetSlot === index && affix?.type === "affix" ? `→ ${BONUS_INFO[affix.value].name} ${statValue(affix.value, affix.amount)}` : "点选或拖入精粹"}</small></button>)}</div> : <p className="craft-empty">放入目标装备，再选择词条精粹。已穿戴装备可直接打造。</p>}</>}
                    {tab === "inherit" && <><h3>全部附加词条继承</h3><div className="inherit-comparison"><div><h4>目标当前</h4>{target ? target.affixes.map(entry => <p key={entry.stat}>{affixText(entry)}</p>) : <p className="craft-empty">选择右侧目标</p>}</div>
                        <div><h4>继承后</h4>{source ? source.affixes.map(entry => <p className="positive" key={entry.stat}>{affixText(entry)}</p>) : <p className="craft-empty">选择左侧来源</p>}</div></div>
                        {source && target && <p className="craft-hint">品质差 {Math.abs(RARITIES.indexOf(source.rarity) - RARITIES.indexOf(target.rarity))} · 星级差 {Math.abs(source.stars - target.stars)} · 来源销毁，目标保留</p>}</>}
                    {tab === "orbs" && <>{orb?.type === "orb" ? <><ItemDetails item={orb} /><div className="bench-result"><ItemIcon item={orb} /><span>分解 → <b>{orbDust(orb)} 宝珠粉尘</b><br />精炼 → 提高一级品质，类型不变</span></div>
                        {(["refine-orb", "recycle"] as const).map(kind => { const op: CraftOperation = kind === "recycle" ? { kind, item: recycleRef(orb) } : { kind, orbId: orb.id, rarity: orb.rarity };
                            return <CraftAction key={kind} title={kind === "recycle" ? "分解宝珠" : "精炼品质"} quote={quoteCraft(player, op)} disabled={disabled} action={() => request(op)} />; })}</> : <p className="craft-empty">放入宝珠查看精炼结果和分解收益。已嵌宝珠需先取下。</p>}
                        <h3>寻宝共鸣</h3><p className="craft-hint">同类两颗：该类寻宝评分 +25%；三种类型：金币 +25%；四种类型：打造消耗 −15%。</p>
                        <p>当前类型 {player.orbResonance.diversity}/4 · 金币 +{player.orbResonance.goldBonus * 100}% · 打造 −{player.orbResonance.craftDiscount * 100}%</p></>}
                </div>
                {tab !== "orbs" && <CraftAction quote={quote} disabled={disabled} title={tab === "extract" ? "提取选中词条" : tab === "imbue" ? "打入选中词条" : "继承全部词条"} action={() => { if (operation) request(operation); }} />}
            </section>
        </div>
        <p className="sr-only" role="status">{drag.announcement}</p>
        {drag.dragging !== undefined && createPortal(<div ref={drag.ghost} className="skill-drag-ghost" style={{ transform: `translate(${drag.position.x + 14}px, ${drag.position.y + 14}px)` }}><ItemIcon item={[...equipment, ...player.inventory].find(item => item.id === drag.dragging)} /><span>放入打造台</span></div>, document.body)}
        {pending && <CraftConfirmation operation={pending} player={player} disabled={disabled} close={() => setPending(undefined)} confirm={op => dispatch({ type: "craft", operation: op })} />}
    </aside>;
}

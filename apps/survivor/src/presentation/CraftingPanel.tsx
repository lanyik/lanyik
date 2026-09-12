import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BONUS_INFO, SLOT_NAMES, EQUIPMENT_SLOTS, type Equipment, type EquipmentAffix } from "../core/Equipment";
import { quoteCraft, type CraftOperation, type CraftQuote } from "../core/Crafting";
import type { CombatCommand } from "../core/CombatCommand";
import type { PlayerSnapshot } from "../core/CombatState";
import type { InventoryItem } from "../core/InventoryItem";
import { ORB_NAMES, ORB_TYPES, orbDust, type Orb } from "../core/Orbs";
import { RARITIES, RARITY_NAMES } from "../core/Loot";
import { ItemIcon, ItemDetails, statValue } from "./ItemView";
import { ItemTooltip, useDismissItemTooltip } from "./ItemTooltip";
import { UiIcon } from "./UiIcon";
import { useSlotDrag } from "./useSlotDrag";

type Tab = "extract" | "imbue" | "inherit" | "orbs";
const TABS = [{ id: "extract", name: "词条提取" }, { id: "imbue", name: "词条打入" }, { id: "inherit", name: "装备继承" }, { id: "orbs", name: "宝珠工坊" }] as const;
const SKIP_EXTRACTION = "survivor.skip-extraction-confirm";
function affixText(affix: EquipmentAffix) { return `${BONUS_INFO[affix.stat].name} ${affix.stat === "shieldRecovery" ? "−" : "+"}${statValue(affix.stat, affix.value)}`; }

function EquipmentPicker({ title, items, selected, choose, player }: { title: string; items: readonly Equipment[];
    selected?: number; choose: (id: number) => void; player: PlayerSnapshot }) {
    const [search, setSearch] = useState(""), [slot, setSlot] = useState("all"), [rarity, setRarity] = useState("all");
    const visible = items.filter(item => (slot === "all" || item.value === slot) && (rarity === "all" || item.rarity === rarity) && item.name.includes(search.trim()));
    return <section className="craft-picker" aria-label={title}><h3>{title}<small>{visible.length} 件</small></h3>
        <input aria-label={`${title}搜索`} placeholder="搜索装备名称" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="craft-filters"><select aria-label={`${title}部位`} value={slot} onChange={event => setSlot(event.target.value)}><option value="all">全部部位</option>{EQUIPMENT_SLOTS.map(id => <option key={id} value={id}>{SLOT_NAMES[id]}</option>)}</select>
            <select aria-label={`${title}品质`} value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">全部品质</option>{RARITIES.map(id => <option key={id} value={id}>{RARITY_NAMES[id]}</option>)}</select></div>
        <div className="craft-picker-list">{visible.map(item => <button key={item.id} className={`craft-item rarity-${item.rarity}${selected === item.id ? " selected" : ""}`} aria-pressed={selected === item.id} onClick={() => choose(item.id)} data-craft-equipment={item.id}>
            <ItemTooltip item={item} player={player}><span className="item-icon-trigger" tabIndex={0}><ItemIcon item={item} /></span></ItemTooltip>
            <span><b>{item.name}</b><small>{SLOT_NAMES[item.value]} · {RARITY_NAMES[item.rarity]} · {"★".repeat(item.stars)} · Lv.{item.itemLevel}</small><small>评分 {item.score}{item.locked ? " · 已锁定" : ""}{player.equipment[item.value]?.id === item.id ? " · 已穿戴" : ""}</small></span>
        </button>)}{!visible.length && <p className="craft-empty">没有符合条件的装备</p>}</div></section>;
}

function CraftConfirmation({ operation, player, disabled, close, confirm }: { operation: CraftOperation; player: PlayerSnapshot; disabled: boolean;
    close: () => void; confirm: (operation: CraftOperation) => void }) {
    const dialog = useRef<HTMLDialogElement>(null), [step, setStep] = useState(1), [skip, setSkip] = useState(false);
    const quote = quoteCraft(player, operation);
    useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
    const signature = quote.ok ? `${quote.gold}:${quote.dust}:${quote.description}` : quote.reason;
    useEffect(() => setStep(1), [signature]);
    return createPortal(<dialog ref={dialog} className="craft-confirm" aria-label={step === 1 ? "核对打造操作" : "最终确认打造"}
        onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
        <span className="eyebrow">确认 {step} / 2</span><h2>{quote.ok ? quote.title : "操作已失效"}</h2>
        {quote.ok ? <><p className="craft-danger">{quote.description}</p><p className="craft-cost">消耗：{quote.gold ? `${quote.gold} 金币` : quote.dust ? `${quote.dust} 宝珠粉尘` : "无额外费用"}{quote.dustGain ? ` · 获得 ${quote.dustGain} 粉尘` : ""}</p>
            {quote.extracted && <div className="craft-confirm-affix">保留：{affixText(quote.extracted)}</div>}
            {quote.replacement?.type === "equipment" && <div className="craft-confirm-affix"><strong>完成后的附加词条</strong>{quote.replacement.affixes.map(affix => <p key={affix.stat}>{affixText(affix)}</p>)}</div>}
            {step === 2 && <p>此操作立即生效，无法撤销。</p>}
            {step === 2 && operation.kind === "extract" && <label><input type="checkbox" checked={skip} onChange={event => setSkip(event.target.checked)} />以后提取词条不再显示确认</label>}
        </> : <p role="alert">{quote.reason}</p>}
        <footer><button autoFocus onClick={close}>取消</button>{quote.ok && <button className={step === 2 ? "danger-action" : "primary-action"} disabled={disabled} onClick={() => {
            if (step === 1) { setStep(2); return; }
            if (operation.kind === "extract" && skip) localStorage.setItem(SKIP_EXTRACTION, "1");
            confirm(operation); close();
        }}>{step === 1 ? "继续核对" : `确认${quote.title}`}</button>}</footer>
    </dialog>, document.body);
}

function CraftAction({ quote, title, disabled, action }: { quote?: CraftQuote; title: string; disabled: boolean; action: () => void }) {
    return <footer className="craft-action"><div>{quote?.ok ? <><span>{quote.description}</span><b>{quote.gold ? `${quote.gold} 金币` : quote.dust ? `${quote.dust} 宝珠粉尘` : quote.dustGain ? `获得 ${quote.dustGain} 宝珠粉尘` : "无额外费用"}</b></> : <span>{quote ? quote.reason : "先选择物品与词条"}</span>}</div>
        <button className="primary-action" disabled={disabled || !quote?.ok} onClick={action}>{title}</button></footer>;
}

export function CraftingPanel({ player, disabled, dispatch, onClose, initialItem }: { player: PlayerSnapshot; disabled: boolean;
    dispatch: (command: CombatCommand) => void; onClose: () => void; initialItem?: InventoryItem }) {
    const dismissTooltip = useDismissItemTooltip();
    const [tab, setTab] = useState<Tab>(initialItem?.type === "affix" ? "imbue" : initialItem?.type === "orb" ? "orbs" : "extract");
    const [sourceId, setSourceId] = useState<number | undefined>(initialItem?.type === "equipment" ? initialItem.id : undefined);
    const [targetId, setTargetId] = useState<number>(), [affixIndex, setAffixIndex] = useState(0), [targetSlot, setTargetSlot] = useState(0);
    const [affixId, setAffixId] = useState<number | undefined>(initialItem?.type === "affix" ? initialItem.id : undefined);
    const [orbId, setOrbId] = useState<number | undefined>(initialItem?.type === "orb" ? initialItem.id : undefined);
    const [search, setSearch] = useState(""), [pending, setPending] = useState<CraftOperation>();
    const inventoryEquipment = player.inventory.filter(item => item.type === "equipment"), allEquipment = [...Object.values(player.equipment).filter((item): item is Equipment => Boolean(item)), ...inventoryEquipment];
    const source = inventoryEquipment.find(item => item.id === sourceId), target = allEquipment.find(item => item.id === targetId);
    const affixes = player.inventory.filter(item => item.type === "affix"), orbs = player.inventory.filter((item): item is Orb => item.type === "orb");
    const orb = orbs.find(item => item.id === orbId);
    const request = (operation: CraftOperation) => {
        if (disabled || !quoteCraft(player, operation).ok) return;
        dismissTooltip();
        if (operation.kind === "extract" && localStorage.getItem(SKIP_EXTRACTION) === "1") dispatch({ type: "craft", operation });
        else setPending(operation);
    };
    const imbue = (id: number, slot: number): CraftOperation | undefined => target ? { kind: "imbue", target: { id: target.id, revision: target.revision }, affixId: id, slot } : undefined;
    const drag = useSlotDrag<number>({ attribute: "craft", slots: target?.affixes.length ?? 4, disabled: disabled || tab !== "imbue" || Boolean(pending),
        name: id => affixes.find(item => item.id === id)?.name ?? "词条", canEquip: (id, slot) => {
            if (!affixes.some(item => item.id === id)) return false;
            const operation = slot === undefined ? undefined : imbue(id, slot);
            return slot === undefined || Boolean(operation && quoteCraft(player, operation).ok);
        }, equip: (id, slot) => { setAffixId(id); setTargetSlot(slot); const operation = imbue(id, slot); if (operation) request(operation); } });
    const operation: CraftOperation | undefined = tab === "extract" && source ? { kind: "extract", source: { id: source.id, revision: source.revision }, affix: affixIndex }
        : tab === "imbue" && affixId !== undefined ? imbue(affixId, targetSlot)
        : tab === "inherit" && source && target ? { kind: "inherit", source: { id: source.id, revision: source.revision }, target: { id: target.id, revision: target.revision } } : undefined;
    const quote = operation ? quoteCraft(player, operation) : undefined;
    const pickSource = (id: number) => { setSourceId(id); setAffixIndex(0); };
    return <aside className="craft-window window" role="dialog" aria-label="打造">
        <header className="window-heading"><div className="window-title"><UiIcon name="craft" /><div><span className="eyebrow">FORGE / 打造</span><h2>荒原工坊</h2></div></div>
            <div className="craft-wallet"><span>金币 <b>{player.gold.toLocaleString("zh-CN")}</b></span><span>宝珠粉尘 <b>{player.orbDust}</b></span></div>
            <button className="close-button" aria-label="关闭打造" onClick={onClose}><UiIcon name="close" /></button></header>
        <nav className="craft-tabs" aria-label="打造类别">{TABS.map(entry => <button key={entry.id} aria-pressed={entry.id === tab} className={entry.id === tab ? "active" : ""} onClick={() => setTab(entry.id)}>{entry.name}</button>)}</nav>
        <div className={`craft-body craft-${tab}`}>
            {(tab === "extract" || tab === "inherit") && <EquipmentPicker title="来源装备" player={player} items={inventoryEquipment} selected={sourceId} choose={pickSource} />}
            {tab === "imbue" && <section className="craft-picker" aria-label="词条精粹列表"><h3>词条精粹<small>{affixes.length} / 80</small></h3><input aria-label="搜索词条" placeholder="搜索属性名称" value={search} onChange={event => setSearch(event.target.value)} />
                <p className="craft-hint">选好目标装备后，拖动精粹到右侧词条。也可点选精粹和覆盖位置。</p>
                <div className="craft-picker-list">{affixes.filter(item => item.name.includes(search.trim())).map(item => <button key={item.id} className={`craft-item craft-affix rarity-${item.rarity}${item.id === affixId ? " selected" : ""}`} aria-pressed={item.id === affixId} data-affix-id={item.id}
                    onClick={() => setAffixId(item.id)} onPointerDown={event => drag.begin(event, item.id)} onKeyDown={event => drag.keyboard(event, item.id)}>
                    <ItemIcon item={item} /><span><b>{BONUS_INFO[item.value].name} {statValue(item.value, item.amount)}</b><small>{RARITY_NAMES[item.rarity]}品质 · ×{item.size}</small></span></button>)}
                    {!affixes.length && <p className="craft-empty">从装备提取词条后，精粹会出现在这里。</p>}</div></section>}
            {(tab === "inherit" || tab === "imbue") && <EquipmentPicker title="目标装备" player={player} items={allEquipment} selected={targetId} choose={id => { setTargetId(id); setTargetSlot(0); }} />}
            {tab === "extract" && <section className="craft-detail"><h3>选择要保留的词条</h3>{source ? <><ItemDetails item={source} />
                <div className="craft-affix-slots">{source.affixes.map((affix, index) => <button key={affix.stat} className={affixIndex === index ? "selected" : ""} aria-pressed={affixIndex === index} onClick={() => setAffixIndex(index)}>{affixText(affix)}<small>提取这一条</small></button>)}</div>
                {source.locked && <p className="craft-danger">来源装备已锁定，请先在背包解锁。解锁后会应用自动清理规则。</p>}</> : <p className="craft-empty">从左侧选择一件背包装备。提取会销毁整件装备。</p>}
                <button className="craft-reset-confirm" onClick={() => { localStorage.removeItem(SKIP_EXTRACTION); }}>恢复提取确认提示</button></section>}
            {tab === "imbue" && <section className="craft-detail"><h3>覆盖位置</h3>{target ? <><p>{target.name} · 基础属性保留</p><div className="craft-affix-slots">{target.affixes.map((affix, index) => <button key={affix.stat} data-craft-slot={index}
                className={`${targetSlot === index ? "selected" : ""}${drag.over === index ? " drag-over" : ""}`} aria-pressed={targetSlot === index} onClick={() => setTargetSlot(index)}>
                <kbd>{index + 1}</kbd>{affixText(affix)}<small>拖入精粹或点选覆盖</small></button>)}</div>
                {quote?.ok && quote.replacement?.type === "equipment" && <div className="craft-preview"><small>打入后</small><b>{affixText(quote.replacement.affixes[targetSlot])}</b></div>}</> : <p className="craft-empty">先选择目标装备，可直接选择已穿戴装备。</p>}</section>}
            {tab === "inherit" && <section className="craft-detail"><h3>继承预览</h3>{source && target ? <><p className="craft-danger">来源销毁，目标全部附加词条被覆盖。</p><h4>目标当前 · {target.affixes.length} 条</h4>{target.affixes.map(affix => <p key={affix.stat}>{affixText(affix)}</p>)}
                <h4>继承后 · {source.affixes.length} 条</h4>{source.affixes.map(affix => <p className="positive" key={affix.stat}>{affixText(affix)}</p>)}<p>品质差 {Math.abs(RARITIES.indexOf(source.rarity) - RARITIES.indexOf(target.rarity))} · 星级差 {Math.abs(source.stars - target.stars)}</p></> : <p className="craft-empty">分别选择来源和目标。品质差、星级差越大，粉尘消耗越多。</p>}</section>}
            {tab === "orbs" && <><section className="craft-picker"><h3>背包宝珠<small>{orbs.length} 颗</small></h3><div className="craft-picker-list">{orbs.map(item => <button key={item.id} className={`craft-item rarity-${item.rarity}${orbId === item.id ? " selected" : ""}`} aria-pressed={orbId === item.id} data-craft-orb={item.id} onClick={() => setOrbId(item.id)}><ItemIcon item={item} /><span><b>{item.name}</b><small>分解可得 {orbDust(item)} 粉尘</small></span></button>)}{!orbs.length && <p className="craft-empty">先从宝箱或领主获得宝珠。已嵌宝珠需先取下。</p>}</div></section>
                <section className="craft-detail">{orb ? <><ItemDetails item={orb} />{(["refine-orb", "salvage-orb"] as const).map(kind => { const op: CraftOperation = { kind, orbId: orb.id, rarity: orb.rarity }; return <CraftAction key={kind} title={kind === "refine-orb" ? "精炼品质" : "分解宝珠"} quote={quoteCraft(player, op)} disabled={disabled} action={() => request(op)} />; })}</> : <p className="craft-empty">选择宝珠以精炼或分解</p>}
                    <h3>寻宝共鸣</h3><p>同类两颗：该类寻宝评分 +25%；三种类型：金币 +25%；四种类型：提取、打入、继承与精炼消耗 −15%。</p>
                    <div className="orb-resonances">{ORB_TYPES.map(type => <span className={player.orbResonance.pairs.includes(type) ? "positive" : ""} key={type}>{ORB_NAMES[type]} {player.orbs.filter(item => item?.value === type).length}/2</span>)}</div>
                    <p>当前类型 {player.orbResonance.diversity}/4 · 金币 +{player.orbResonance.goldBonus * 100}% · 打造 −{player.orbResonance.craftDiscount * 100}%</p></section></>}
        </div>
        {tab !== "orbs" && <CraftAction quote={quote} disabled={disabled} title={tab === "extract" ? "提取选中词条" : tab === "imbue" ? "打入选中词条" : "继承全部词条"} action={() => { if (operation) request(operation); }} />}
        <p className="sr-only" role="status">{drag.announcement}</p>
        {drag.dragging !== undefined && createPortal(<div ref={drag.ghost} className="skill-drag-ghost" style={{ transform: `translate(${drag.position.x + 14}px, ${drag.position.y + 14}px)` }}><ItemIcon item={affixes.find(item => item.id === drag.dragging)} /><span>放到目标词条后确认</span></div>, document.body)}
        {pending && <CraftConfirmation operation={pending} player={player} disabled={disabled} close={() => setPending(undefined)} confirm={op => dispatch({ type: "craft", operation: op })} />}
    </aside>;
}

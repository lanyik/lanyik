import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { quoteCraft, type CraftOperation } from "../core/Crafting";
import type { PlayerSnapshot } from "../core/CombatState";
import { ItemDetails } from "./ItemView";
import { useDismissItemTooltip } from "./ItemTooltip";
import { createAffixItem } from "../core/AffixItem";

export const SKIP_EXTRACTION = "survivor.skip-extraction-confirm";

/** One modal combines the result preview, cost and irreversible-operation warning. */
export function CraftConfirmation({ operation, player, disabled, close, confirm }: { operation: CraftOperation; player: PlayerSnapshot; disabled: boolean;
    close: () => void; confirm: (operation: CraftOperation) => void }) {
    const dialog = useRef<HTMLDialogElement>(null), [skip, setSkip] = useState(false);
    const dismissTooltip = useDismissItemTooltip();
    const quote = quoteCraft(player, operation);
    useEffect(() => { dismissTooltip(); const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
    const original = operation.kind === "recycle" ? player.inventory.find(item => item.id === operation.item.id) : undefined;
    return createPortal(<dialog ref={dialog} className="craft-confirm" aria-label="确认物品操作"
        onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
        <span className="eyebrow">操作预览</span><h2>{quote.ok ? quote.title : "操作已失效"}</h2>
        {quote.ok ? <>
            {original && <ItemDetails item={original} />}
            {quote.replacement && <div className="craft-confirm-affix"><strong>完成后的物品</strong><ItemDetails item={quote.replacement} /></div>}
            {quote.extracted && <div className="craft-confirm-affix"><ItemDetails item={createAffixItem(0, quote.extracted)} /></div>}
            <p className="craft-cost">{quote.gold ? `消耗 ${quote.gold} 金币` : quote.dust ? `消耗 ${quote.dust} 宝珠粉尘` : "无额外费用"}
                {quote.goldGain ? ` · 获得 ${quote.goldGain} 金币` : quote.dustGain ? ` · 获得 ${quote.dustGain} 宝珠粉尘` : ""}</p>
            <p className="craft-danger">{quote.description} 此操作立即生效，无法撤销。</p>
            {operation.kind === "extract" && <label><input type="checkbox" checked={skip} onChange={event => setSkip(event.target.checked)} />以后提取词条不再显示确认</label>}
        </> : <p role="alert">{quote.reason}</p>}
        <footer><button autoFocus onClick={close}>取消</button>{quote.ok && <button className="danger-action" disabled={disabled} onClick={() => {
            if (operation.kind === "extract" && skip) localStorage.setItem(SKIP_EXTRACTION, "1");
            confirm(operation); close();
        }}>确认{quote.title}</button>}</footer>
    </dialog>, document.body);
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CombatSession, SessionSnapshot } from "../app/CombatSession";
import { SAVE_NAMES, type CharacterSave, type SaveEntry, type SaveSlot } from "../app/CharacterRepository";
import { SaveSummary } from "./StartScreen";
import { UiIcon } from "./UiIcon";
import type { RuntimeLog } from "../app/RuntimeLog";
import { RuntimeLogExport } from "./RuntimeLogExport";

function SaveConfirmation({ pending, close, act }: { pending: { load?: CharacterSave; slot: SaveSlot }; close: () => void; act: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialog.current!.showModal(); return () => dialog.current?.close(); }, []);
    return createPortal(<dialog className="craft-confirm" ref={dialog} aria-label="确认存档操作" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
        <h2>{pending.load ? "读取角色存档" : "覆盖手动存档"}</h2>
        {pending.load && <div className="save-card"><SaveSummary save={pending.load} /></div>}
        <p>{pending.load ? "当前未保存进度会被替换。读档恢复角色与位置，附近怪物、宝箱和地面掉落重新生成；永久灵境成长保留。" : `用当前角色进度覆盖「${SAVE_NAMES[pending.slot]}」，该槽原记录不再保留。`}</p>
        <footer><button autoFocus onClick={close}>取消</button><button onClick={act}>确认{pending.load ? "读档" : "覆盖"}</button></footer>
    </dialog>, document.body);
}

export function SessionMenu({ session, snapshot, close, home, log }: { session: CombatSession; snapshot: SessionSnapshot; close: () => void; home: () => Promise<void>; log: RuntimeLog }) {
    const [entries, setEntries] = useState<readonly SaveEntry[]>([]), [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false), [pending, setPending] = useState<{ load?: CharacterSave; slot: SaveSlot }>();
    useEffect(() => { let alive = true; void session.listSaves().then(value => { if (alive) setEntries(value); }, reason => { if (alive) setError(String(reason)); }); return () => { alive = false; }; }, [session, snapshot.saveStatus.savedAt]);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true); setPending(undefined); setError(undefined);
        try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
    };
    const blocked = busy || snapshot.saveStatus.busy || snapshot.travelling;
    return <aside className="session-menu window" role="dialog" aria-label="游戏与存档"><header><div><span className="eyebrow">JOURNEY / 旅程</span><h2>游戏与存档</h2></div><button aria-label="关闭存档界面" onClick={close} disabled={blocked}><UiIcon name="close" /></button></header>
        <p className="save-note">已暂停战斗。保存角色、物品、技能、家园/荒野位置与探索迷雾；自动存档每 60 秒更新。</p>
        <div className="save-slots">{entries.map(entry => <article key={entry.slot} className="save-card"><header><b>{SAVE_NAMES[entry.slot]}</b></header>
            {entry.save ? <SaveSummary save={entry.save} /> : <p>{entry.error ?? "空存档槽"}</p>}
            {entry.slot !== "auto" && <button disabled={blocked || snapshot.combat?.gameOver} onClick={() => entry.save || entry.error ? setPending({ slot: entry.slot }) : void run(() => session.save(entry.slot))}>保存到{SAVE_NAMES[entry.slot]}</button>}
            {entry.save && <button disabled={blocked} onClick={() => setPending({ load: entry.save, slot: entry.slot })}>读取{SAVE_NAMES[entry.slot]}</button>}
        </article>)}</div>
        {(error || snapshot.saveStatus.error) && <p className="menu-error" role="alert">{error || snapshot.saveStatus.error}</p>}
        <footer><button disabled={blocked} onClick={() => void run(home)}>保存并返回主界面</button><button disabled={blocked} onClick={close}>继续游戏</button></footer>
        <RuntimeLogExport log={log} />
        {pending && <SaveConfirmation pending={pending} close={() => setPending(undefined)} act={() => void run(() => pending.load ? session.load(pending.load.checkpoint) : session.save(pending.slot))} />}
    </aside>;
}

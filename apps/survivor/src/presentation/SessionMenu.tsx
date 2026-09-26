import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CombatSession, SessionSnapshot } from "../app/CombatSession";
import { SAVE_NAMES, type CharacterSave, type SaveEntry, type SaveSlot } from "../app/CharacterRepository";
import { SaveSummary } from "./StartScreen";
import type { RuntimeLog } from "../app/RuntimeLog";
import { RuntimeLogExport } from "./RuntimeLogExport";
import { WindowHeader } from "./WindowChrome";
import { AudioControls } from "./AudioControls";
import type { CombatAudio } from "./CombatAudio";

function SaveConfirmation({ pending, close, act }: { pending: { load?: CharacterSave; slot: SaveSlot }; close: () => void; act: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { dialog.current!.showModal(); return () => dialog.current?.close(); }, []);
    return createPortal(<dialog className="craft-confirm" ref={dialog} aria-label="确认存档操作" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
        <h2>{pending.load ? "读取角色存档" : "覆盖手动存档"}</h2>
        {pending.load && <div className="save-card"><SaveSummary save={pending.load} /></div>}
        <p>{pending.load ? "荒野遭遇会重新生成；副本击杀、卷轴消耗与领奖不可回退。若本槽早于已提交的副本进度，将恢复该角色最新提交的完整状态。永久灵境成长保留。" : `用当前角色进度覆盖「${SAVE_NAMES[pending.slot]}」，该槽原记录不再保留。`}</p>
        <footer><button autoFocus onClick={close}>取消</button><button onClick={act}>确认{pending.load ? "读档" : "覆盖"}</button></footer>
    </dialog>, document.body);
}

export function SessionMenu({ session, snapshot, close, home, log, audio }: { session: CombatSession; snapshot: SessionSnapshot; close: () => void; home: () => Promise<void>; log: RuntimeLog; audio: CombatAudio }) {
    const [entries, setEntries] = useState<readonly SaveEntry[]>([]), [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false), [pending, setPending] = useState<{ load?: CharacterSave; slot: SaveSlot }>();
    const [selectedSlot, setSelectedSlot] = useState<SaveSlot>("manual-1");
    useEffect(() => { let alive = true; void session.listSaves().then(value => { if (alive) setEntries(value); }, reason => { if (alive) setError(String(reason)); }); return () => { alive = false; }; }, [session, snapshot.saveStatus.savedAt]);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true); setPending(undefined); setError(undefined);
        try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
    };
    const blocked = busy || snapshot.saveStatus.busy || snapshot.travelling;
    const selected = entries.find(entry => entry.slot === selectedSlot);
    return <aside className="session-menu window" role="dialog" aria-label="游戏与存档">
        <WindowHeader title="游戏与存档" icon="system" shortcut="O" close={close} disabled={blocked} closeLabel="关闭存档界面" help={<p>保存角色、物品、技能、世界位置、探索迷雾与各副本进度。常规每 60 秒自动保存；副本击杀和领奖即时提交，旧档不能回退。读取与覆盖已有存档均需确认。</p>}><span>战斗已暂停</span></WindowHeader>
        <div className="session-body"><div className="session-toolbar"><span role="status">{snapshot.saveStatus.busy ? "正在保存…" : snapshot.saveStatus.savedAt ? `已保存 ${new Date(snapshot.saveStatus.savedAt).toLocaleTimeString("zh-CN")}` : "选择存档槽"}</span><details><summary>诊断与日志</summary><RuntimeLogExport log={log} /></details></div>
        <div className="save-slots">{entries.map(entry => <button key={entry.slot} className={`save-card${selectedSlot === entry.slot ? " selected" : ""}`} aria-label={`选择${SAVE_NAMES[entry.slot]}`} aria-pressed={selectedSlot === entry.slot} disabled={blocked} onClick={() => setSelectedSlot(entry.slot)}><b>{SAVE_NAMES[entry.slot]}</b>
            {entry.save ? <SaveSummary save={entry.save} /> : <p>{entry.error ?? "空存档槽"}</p>}
        </button>)}</div>
        <div className="save-slot-actions"><span>{SAVE_NAMES[selectedSlot]}</span><button disabled={blocked || !selected?.save} onClick={() => { if (selected?.save) setPending({ load: selected.save, slot: selectedSlot }); }}>读取{SAVE_NAMES[selectedSlot]}</button><button className="primary-action" disabled={blocked || !selected || selectedSlot === "auto" || snapshot.combat?.gameOver} onClick={() => selected?.save || selected?.error ? setPending({ slot: selectedSlot }) : void run(() => session.save(selectedSlot))}>保存到{SAVE_NAMES[selectedSlot]}</button></div>
        <AudioControls audio={audio} />
        {(error || snapshot.saveStatus.error) && <p className="menu-error" role="alert">{error || snapshot.saveStatus.error}</p>}
        </div>
        <footer className="action-footer"><button className="quiet-action" disabled={blocked} onClick={() => void run(home)}>保存并返回主界面</button><button disabled={blocked} onClick={close}>继续游戏<kbd>O</kbd></button></footer>
        {pending && <SaveConfirmation pending={pending} close={() => setPending(undefined)} act={() => void run(() => pending.load ? session.load(pending.load.checkpoint) : session.save(pending.slot))} />}
    </aside>;
}

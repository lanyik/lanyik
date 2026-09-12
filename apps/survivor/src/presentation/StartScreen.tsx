import { useEffect, useRef, useState } from "react";
import type { CharacterCheckpoint } from "../core/CharacterCheckpoint";
import { SAVE_NAMES, type CharacterRepository, type CharacterSave, type SaveEntry } from "../app/CharacterRepository";
import { UiIcon } from "./UiIcon";
import "./app.css";
import "./menus.css";

export function SaveSummary({ save }: { save: CharacterSave }) {
    const p = save.checkpoint.player;
    return <><strong>Lv.{p.level} · 击杀 {save.checkpoint.kills}</strong><span>{save.checkpoint.seed}</span>
        <small>金币 {p.gold.toLocaleString("zh-CN")} · 背包 {p.inventory.length} 格</small><time>{new Date(save.savedAt).toLocaleString("zh-CN")}</time></>;
}

export function StartScreen({ repository, start, error, blocked = false }: { repository: CharacterRepository; start: (seed: string, checkpoint?: CharacterCheckpoint) => Promise<void>; error?: string; blocked?: boolean }) {
    const [seed, setSeed] = useState("rift-ember-1"), [entries, setEntries] = useState<readonly SaveEntry[]>([]), [failure, setFailure] = useState(error);
    const [busy, setBusy] = useState(blocked), [preview, setPreview] = useState<"loading" | "ready" | "failed">("loading"), [previewError, setPreviewError] = useState("");
    const canvas = useRef<HTMLCanvasElement>(null);
    const validSeed = !!seed.trim() && seed.trim().length <= 128;
    useEffect(() => { let live = true; void repository.list().then(value => { if (live) setEntries(value); }, reason => { if (live) setFailure(String(reason)); }); return () => { live = false; }; }, [repository]);
    useEffect(() => {
        setPreview("loading"); setPreviewError("");
        if (!validSeed) { setPreview("failed"); return; }
        let worker: Worker | undefined;
        const timer = setTimeout(() => {
            worker = new Worker(new URL("../worker/WorldPreview.worker.ts", import.meta.url), { type: "module", name: "survivor-world-preview" });
            worker.onmessage = event => {
                if (event.data.error) { setPreview("failed"); setPreviewError(event.data.error); }
                else {
                    const context = canvas.current?.getContext("2d");
                    if (context) context.putImageData(new ImageData(event.data.pixels as Uint8ClampedArray<ArrayBuffer>, 192, 192), 0, 0);
                    setPreview("ready");
                }
                worker?.terminate();
            };
            worker.onerror = event => { event.preventDefault(); setPreview("failed"); setPreviewError("世界预览加载失败"); worker?.terminate(); };
            worker.postMessage(seed.trim());
        }, 300);
        return () => { clearTimeout(timer); worker?.terminate(); };
    }, [seed, validSeed]);
    const launch = async (checkpoint?: CharacterCheckpoint) => {
        if (busy || !checkpoint && !validSeed) return;
        setBusy(true); setFailure(undefined);
        try { await start(checkpoint?.seed ?? seed.trim(), checkpoint); } catch (reason) { setFailure(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
    };
    const latest = entries.flatMap(entry => entry.save ? [entry.save] : []).sort((a, b) => b.savedAt - a.savedAt)[0];
    return <main className="survivor start-screen" data-state="menu"><div className="start-shell">
        <header className="start-brand"><UiIcon name="rift" /><div><span className="eyebrow">RIFT / 荒原</span><h1>踏入未知，带回力量。</h1><p>选择一片荒原，开始新的探索，或继续你的旅程。</p></div></header>
        <div className="start-columns"><section className="world-setup"><header><h2>新的世界</h2><small>无限地域 · 同种子生成相同地形</small></header>
            <div className="world-preview" data-state={preview}><canvas ref={canvas} width="192" height="192" aria-label="世界大致预览" />
                {preview !== "ready" && <span>{preview === "loading" ? "正在描绘世界…" : previewError || "请输入世界种子"}</span>}<b>北 ↑</b></div>
            <div className="preview-legend"><span>水域</span><span>森林与平原</span><span>山脉与雪地</span></div>
            <label className="seed-label">世界种子<input aria-label="世界种子" value={seed} maxLength={128} disabled={busy} onChange={event => setSeed(event.target.value)} /></label>
            <div className="start-actions"><button disabled={busy} onClick={() => setSeed(`rift-${crypto.randomUUID().slice(0, 8)}`)}>随机种子</button><button className="primary-action" disabled={busy || !validSeed} onClick={() => void launch()}>{busy ? "准备进入…" : "开始新游戏"}</button></div>
            <small>预览展示中心 512×512 地格。新游戏更新自动存档，手动存档保留。</small></section>
            <section className="start-saves"><header><h2>你的旅程</h2>{latest && <button className="primary-action" disabled={busy} onClick={() => void launch(latest.checkpoint)}>继续游戏</button>}</header>
                <div className="save-slots">{entries.map(entry => <article key={entry.slot} className="save-card"><header><b>{SAVE_NAMES[entry.slot]}</b><UiIcon name="character" /></header>
                    {entry.save ? <><SaveSummary save={entry.save} /><button disabled={busy} onClick={() => void launch(entry.save!.checkpoint)}>读取{SAVE_NAMES[entry.slot]}</button></> : <p>{entry.error ?? "暂无存档"}</p>}</article>)}</div>
                <p className="save-note">自动存档每 60 秒更新，也会在切出页面和返回主界面时保存。角色进度存于当前浏览器；灵境成长永久保留。</p>
            </section></div>{failure && <p className="menu-error" role="alert">{failure}</p>}
    </div></main>;
}

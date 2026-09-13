import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexCombatView } from "../adapters/HexCombatView";
import { App } from "../presentation/App";
import { StartScreen } from "../presentation/StartScreen";
import { CombatSession } from "./CombatSession";
import { CombatWorkerClient } from "../worker/CombatWorkerClient";
import { workerBudget } from "../worker/WorkerBudget";
import { IndexedDBCharacterRepository } from "./CharacterRepository";
import type { CharacterCheckpoint } from "../core/CharacterCheckpoint";
import { RuntimeLog } from "./RuntimeLog";

export interface SurvivorOptions {
    /** Explicitly opt into query workers after measuring the target browser and scene. */
    readonly collisionQueries?: boolean;
}

export function bootstrap(options: SurvivorOptions = {}): { readonly session: CombatSession; readonly runtimeLog: RuntimeLog; dispose(): Promise<void> } {
    const element = document.getElementById("survivor-ui");
    if (!element) throw new Error("Survivor UI element is missing");
    const runtimeLog = new RuntimeLog(() => window.localStorage);
    runtimeLog.record("page-start", navigator.userAgent);
    const root = createRoot(element, {
        onUncaughtError: error => { runtimeLog.error("react-error", error); console.error(error); },
        onRecoverableError: error => { runtimeLog.error("react-recoverable", error); console.error(error); }
    }), repository = new IndexedDBCharacterRepository();
    let session: CombatSession | undefined, disconnectFrame = () => {}, disconnectPerformance = () => {};
    let cleanup: Promise<void> = Promise.resolve(), closing: Promise<void> | undefined, starting = false, cleanupFailed = false, homeRevision = 0;
    const showHome = (error?: string) => root.render(<StrictMode><StartScreen key={++homeRevision} repository={repository} start={launch} error={error} blocked={cleanupFailed} log={runtimeLog} /></StrictMode>);
    const releaseSession = async () => {
        disconnectFrame(); disconnectPerformance(); disconnectFrame = disconnectPerformance = () => {};
        const previous = session; session = undefined;
        cleanup = previous ? previous.dispose() : cleanup; await cleanup;
    };
    const home = async () => {
        const state = session?.getSnapshot();
        if (state?.status === "ready" && !state.combat?.gameOver) await session!.save("auto");
        await releaseSession(); if (!closing) showHome();
    };
    const autoSave = () => {
        const active = session, state = active?.getSnapshot();
        if (state?.status === "ready" && !state.combat?.gameOver && !state.saveStatus.busy) void active!.save("auto").catch(() => { /* The session exposes the write error in the UI. */ });
    };
    const visibilityChanged = () => { runtimeLog.record("visibility", document.hidden ? "hidden" : "visible"); session?.setHidden(document.hidden); if (document.hidden) autoSave(); };
    const launch = async (seed: string, checkpoint?: CharacterCheckpoint) => {
        if (closing || starting || cleanupFailed) return;
        starting = true;
        runtimeLog.record("session-start", JSON.stringify({ seed, saved: Boolean(checkpoint) }));
        let view: HexCombatView | undefined;
        try {
            await cleanup;
            if (closing) return;
            if (!options || typeof options !== "object" || Array.isArray(options)
                || Object.keys(options).some(key => key !== "collisionQueries")
                || options.collisionQueries !== undefined && typeof options.collisionQueries !== "boolean") throw new TypeError("Survivor options only accept an optional boolean collisionQueries");
            const budget = workerBudget(navigator.hardwareConcurrency, options.collisionQueries);
            view = new HexCombatView(error => session?.fail(error), budget.terrain);
            const active = new CombatSession(view, onFailure => new CombatWorkerClient(budget.queries, onFailure), repository, runtimeLog);
            session = active;
            disconnectFrame = view.onFrame(frame => {
                try { active.frame(frame.t, frame.dtS === 0); } catch (error) { active.fail(error); }
            }, frame => active.afterFrame(frame));
            disconnectPerformance = active.observeLongFrames();
            root.render(<StrictMode><App session={active} attachRegionMap={view.attachRegionMap} onHome={home} log={runtimeLog} /></StrictMode>);
            visibilityChanged();
            if (checkpoint) await active.load(checkpoint); else await active.start(seed);
            if (!closing && session === active) autoSave();
        } catch (reason) {
            runtimeLog.error("launch-failed", reason);
            disconnectFrame(); disconnectPerformance();
            const owner = session; session = undefined;
            cleanup = Promise.resolve().then(() => owner ? owner.dispose() : view?.dispose());
            let message = reason instanceof Error ? reason.message : String(reason);
            try { await cleanup; } catch (error) { runtimeLog.error("cleanup-failed", error); cleanupFailed = true; message += `；资源清理失败：${String(error)}，请刷新页面。`; }
            if (!closing) showHome(message);
        } finally { starting = false; }
    };
    const timer = setInterval(autoSave, 60_000);
    const windowError = (event: ErrorEvent) => runtimeLog.error("window-error", event.error ?? event.message);
    const rejection = (event: PromiseRejectionEvent) => runtimeLog.error("unhandled-rejection", event.reason);
    const contextLost = () => runtimeLog.record("webgl-context-lost");
    window.addEventListener("error", windowError);
    window.addEventListener("unhandledrejection", rejection);
    document.addEventListener("webglcontextlost", contextLost, { capture: true });
    const dispose = () => {
        if (closing) return closing;
        runtimeLog.record("application-dispose");
        clearInterval(timer);
        window.removeEventListener("error", windowError);
        window.removeEventListener("unhandledrejection", rejection);
        document.removeEventListener("webglcontextlost", contextLost, { capture: true });
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("pagehide", pageHidden); window.removeEventListener("pageshow", visibilityChanged);
        root.unmount();
        closing = releaseSession().finally(() => repository.close()); return closing;
    };
    const pageHidden = (event: PageTransitionEvent) => {
        runtimeLog.record("page-hide", event.persisted ? "cached" : "leaving");
        if (event.persisted) { session?.setHidden(true); autoSave(); }
        else void dispose().catch(error => { runtimeLog.error("shutdown-failed", error); console.error("Survivor shutdown failed", error); });
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pageHidden); window.addEventListener("pageshow", visibilityChanged);
    showHome();
    return { get session() { if (!session) throw new Error("Combat session has not initialized"); return session; }, runtimeLog, dispose };
}

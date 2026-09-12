import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexCombatView } from "../adapters/HexCombatView";
import { App } from "../presentation/App";
import { CombatSession } from "./CombatSession";
import { CombatWorkerClient } from "../worker/CombatWorkerClient";
import { workerBudget } from "../worker/WorkerBudget";

export interface SurvivorOptions {
    /** Explicitly opt into query workers after measuring the target browser and scene. */
    readonly collisionQueries?: boolean;
}

export function bootstrap(options: SurvivorOptions = {}): { readonly session: CombatSession; dispose(): Promise<void> } {
    const element = document.getElementById("survivor-ui");
    if (!element) throw new Error("Survivor UI element is missing");
    const root = createRoot(element);
    let session: CombatSession | undefined;
    let disconnectFrame = () => {};
    let disconnectPerformance = () => {};
    let cleanup: Promise<void> = Promise.resolve();
    let closing: Promise<void> | undefined;
    let starting = false;
    let retryAllowed = true;
    const visibilityChanged = () => session?.setHidden(document.hidden);
    const launch = async () => {
        if (closing || starting || !retryAllowed) return;
        starting = true;
        let view: HexCombatView | undefined;
        try {
            await cleanup;
            if (closing) return;
            if (!options || typeof options !== "object" || Array.isArray(options)
                || Object.keys(options).some(key => key !== "collisionQueries")
                || options.collisionQueries !== undefined && typeof options.collisionQueries !== "boolean") {
                throw new TypeError("Survivor options only accept an optional boolean collisionQueries");
            }
            const budget = workerBudget(navigator.hardwareConcurrency, options.collisionQueries);
            view = new HexCombatView(error => session?.fail(error), budget.terrain);
            const active = new CombatSession(view, onFailure => new CombatWorkerClient(budget.queries, onFailure));
            session = active;
            disconnectFrame = view.onFrame(frame => {
                try { active.frame(frame.t, frame.dtS === 0); } catch (error) { active.fail(error); }
            }, frame => active.afterFrame(frame));
            disconnectPerformance = active.observeLongFrames();
            root.render(<StrictMode><App session={active} attachRegionMap={view.attachRegionMap} /></StrictMode>);
            visibilityChanged();
            void active.start();
        } catch (reason) {
            disconnectFrame(); disconnectPerformance();
            const owner = session;
            session = undefined;
            cleanup = Promise.resolve().then(() => owner ? owner.dispose() : view ? view.dispose() : undefined);
            let message = reason instanceof Error ? reason.message : String(reason);
            try { await cleanup; }
            catch (error) {
                retryAllowed = false;
                message += `；资源清理失败：${error instanceof Error ? error.message : String(error)}`;
            }
            if (closing) return;
            root.render(<main className="survivor" data-state="failed"><div className="state-overlay failed" role="alert"><div>
                <h1>无法进入荒原</h1><p>{message}</p>{retryAllowed ? <button onClick={() => void launch()}>重新尝试</button> : <p>请刷新页面后重试。</p>}
            </div></div></main>);
        } finally { starting = false; }
    };
    const dispose = () => {
        if (closing) return closing;
        disconnectFrame();
        disconnectPerformance();
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("pagehide", pageHidden);
        window.removeEventListener("pageshow", visibilityChanged);
        root.unmount();
        closing = session ? session.dispose() : cleanup;
        return closing;
    };
    const pageHidden = (event: PageTransitionEvent) => {
        if (event.persisted) session?.setHidden(true);
        else void dispose().catch(error => console.error("Survivor shutdown failed", error));
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", visibilityChanged);
    void launch();
    return { get session() {
        if (!session) throw new Error("Combat session has not initialized");
        return session;
    }, dispose };
}

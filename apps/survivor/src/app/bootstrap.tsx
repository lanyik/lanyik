import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexCombatView } from "../adapters/HexCombatView";
import { App } from "../presentation/App";
import { CombatSession } from "./CombatSession";
import { CombatWorkerClient } from "../worker/CombatWorkerClient";
import { workerBudget } from "../worker/WorkerBudget";

export function bootstrap(): { readonly session: CombatSession; dispose(): Promise<void> } {
    const element = document.getElementById("survivor-ui");
    if (!element) throw new Error("Survivor UI element is missing");
    let session: CombatSession;
    const budget = workerBudget(navigator.hardwareConcurrency);
    const view = new HexCombatView(error => session?.fail(error), budget.terrain);
    session = new CombatSession(view, onFailure => new CombatWorkerClient(budget.queries, onFailure));
    const root = createRoot(element);
    root.render(<StrictMode><App session={session} /></StrictMode>);

    const visibilityChanged = () => session.setHidden(document.hidden);
    const disconnectFrame = view.onFrame(frame => {
        try { session.frame(frame.t, frame.dtS === 0); } catch (error) { session.fail(error); }
    }, frame => session.afterFrame(frame));
    const disconnectPerformance = session.observeLongFrames();
    let closing: Promise<void> | undefined;
    const dispose = () => {
        if (closing) return closing;
        disconnectFrame();
        disconnectPerformance();
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("pagehide", pageHidden);
        window.removeEventListener("pageshow", visibilityChanged);
        root.unmount();
        closing = session.dispose();
        return closing;
    };
    const pageHidden = (event: PageTransitionEvent) => {
        if (event.persisted) session.setHidden(true);
        else void dispose().catch(error => console.error("Survivor shutdown failed", error));
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", visibilityChanged);
    visibilityChanged();
    void session.start();
    return { session, dispose };
}

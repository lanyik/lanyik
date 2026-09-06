import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexCombatView } from "../adapters/HexCombatView";
import { App } from "../presentation/App";
import { CombatSession } from "./CombatSession";

export function bootstrap(): { readonly session: CombatSession; dispose(): Promise<void> } {
    const element = document.getElementById("survivor-ui");
    if (!element) throw new Error("Survivor UI element is missing");
    let session: CombatSession;
    const view = new HexCombatView(error => session?.fail(error));
    session = new CombatSession(view);
    const root = createRoot(element);
    root.render(<StrictMode><App session={session} /></StrictMode>);

    const visibilityChanged = () => session.setHidden(document.hidden);
    const frame = (timestamp: number) => {
        frameId = requestAnimationFrame(frame);
        session.frame(timestamp);
    };
    let frameId = requestAnimationFrame(frame);
    let closing: Promise<void> | undefined;
    const dispose = () => {
        if (closing) return closing;
        cancelAnimationFrame(frameId);
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

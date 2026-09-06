import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexWorldView } from "../adapters/HexWorldView";
import { App } from "../presentation/App";
import { GameSession } from "./GameSession";

export function bootstrap(): { dispose(): Promise<void> } {
    const element = document.getElementById("expedition-ui");
    if (!element) throw new Error("Expedition UI element is missing");
    const view = new HexWorldView(selection => session.select(selection), error => session.fail(error));
    const session = new GameSession(view);
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
        else void dispose().catch(error => console.error("Expedition shutdown failed", error));
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", visibilityChanged);
    visibilityChanged();
    void session.start(session.getSnapshot().seed);
    return { dispose };
}

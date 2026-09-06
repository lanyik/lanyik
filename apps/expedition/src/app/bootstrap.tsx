import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HexWorldView } from "../adapters/HexWorldView";
import { App } from "../presentation/App";
import { GameSession } from "./GameSession";

export function bootstrap(): { dispose(): Promise<void> } {
    const element = document.getElementById("expedition-ui");
    if (!element) throw new Error("Expedition UI element is missing");
    const view = new HexWorldView(selection => session.select(selection), error => session.fail(error), position => session.hover(position));
    const session = new GameSession(view);
    const root = createRoot(element);
    root.render(<StrictMode><App session={session} /></StrictMode>);

    const visibilityChanged = () => session.setHidden(document.hidden);
    const keyPressed = (event: KeyboardEvent) => {
        if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || session.getSnapshot().status !== "ready") return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
        const command = event.code === "KeyB" ? "build-toggle"
            : session.getSnapshot().build && event.code === "KeyR" ? "build-rotate"
            : session.getSnapshot().build && event.code === "Escape" ? "build-cancel" : undefined;
        if (!command) return;
        event.preventDefault();
        session.dispatch({ type: command });
        document.getElementById("expedition-world")?.focus({ preventScroll: true });
    };
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
        window.removeEventListener("keydown", keyPressed);
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
    window.addEventListener("keydown", keyPressed);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", visibilityChanged);
    visibilityChanged();
    void session.start(session.getSnapshot().seed);
    return { dispose };
}

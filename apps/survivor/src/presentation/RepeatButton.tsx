import { useEffect, useRef, type ButtonHTMLAttributes } from "react";

/** One click, or bounded repeats while held. Never retain a timer across cancellation/unmount. */
export function RepeatButton({ onRepeat, disabled, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { readonly onRepeat: () => void }) {
    const action = useRef(onRepeat), blocked = useRef(disabled), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), repeated = useRef(false);
    action.current = onRepeat; blocked.current = disabled;
    function stop() { clearTimeout(timer.current); timer.current = undefined; }
    function cancel() { repeated.current = true; stop(); }
    function start() {
        stop(); repeated.current = false;
        const repeat = () => {
            if (blocked.current) { stop(); return; }
            repeated.current = true; action.current(); timer.current = setTimeout(repeat, 85);
        };
        timer.current = setTimeout(repeat, 350);
    }
    useEffect(() => { if (disabled) stop(); }, [disabled]);
    useEffect(() => {
        const hide = () => { if (document.hidden) cancel(); };
        window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", hide);
        return () => { stop(); window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", hide); };
    }, []);
    return <button {...props} disabled={disabled} style={{ ...props.style, touchAction: "none" }}
        onPointerDown={event => { if (event.button !== 0 || !event.isPrimary || disabled) return; event.currentTarget.setPointerCapture(event.pointerId); start(); }}
        onPointerUp={stop} onPointerCancel={cancel} onLostPointerCapture={stop} onPointerLeave={cancel} onBlur={cancel}
        onKeyDown={event => { if (event.key !== " " && event.key !== "Enter") return; event.preventDefault(); if (!event.repeat && !disabled) { action.current(); start(); repeated.current = true; } }}
        onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stop(); } }}
        onClick={event => { if (repeated.current) { event.preventDefault(); repeated.current = false; } else if (!disabled) action.current(); }} />;
}

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { UiIcon } from "./UiIcon";

export function PanelHelp({ children, label = "操作说明", className = "panel-help" }: { children: ReactNode; label?: string; className?: string }) {
    const element = useRef<HTMLDetailsElement>(null), [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => { if (!element.current?.contains(event.target as Node)) element.current!.open = false; };
        document.addEventListener("pointerdown", dismiss, true);
        return () => document.removeEventListener("pointerdown", dismiss, true);
    }, [open]);
    return <details ref={element} className={className} onToggle={event => setOpen(event.currentTarget.open)}
        onKeyDown={event => { if (event.code === "Escape" && element.current?.open) { event.stopPropagation(); element.current.open = false; } }}>
        <summary aria-label={label}>{label}</summary><div className={`${className}-content`}>{children}</div>
    </details>;
}

export function WindowHeader({ title, icon, shortcut, close, disabled, children, help, closeLabel = `关闭${title}` }: {
    title: string; icon: ComponentProps<typeof UiIcon>["name"]; shortcut: string; close(): void;
    disabled?: boolean; children?: ReactNode; help?: ReactNode; closeLabel?: string;
}) {
    return <header className="window-heading">
        <div className="window-title"><UiIcon name={icon} /><h2>{title}</h2></div>
        <div className="window-meta">{children}</div>
        <div className="window-tools">{help && <PanelHelp>{help}</PanelHelp>}<kbd>{shortcut}</kbd>
            <button className="close-button" aria-label={closeLabel} disabled={disabled} onClick={close}><UiIcon name="close" /></button>
        </div>
    </header>;
}

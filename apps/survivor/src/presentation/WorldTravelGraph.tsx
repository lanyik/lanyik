import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { CombatSnapshot } from "../core/CombatState";
import type { WorldLocation } from "../core/Homestead";
import { CHALLENGES, isChallenge } from "../core/BossChallenge";
import { UiIcon } from "./UiIcon";

const NODES = [
    { id: "homestead", x: 105, y: 275, color: "#8dd6b5", icon: "home" },
    { id: "wilds", x: 300, y: 275, color: "#e3c680", icon: "mountains" },
    { id: "rift-lord", x: 180, y: 85, color: "#ca9cf1", icon: "rift" },
    { id: "stone-sovereign", x: 440, y: 110, color: "#d8b17f", icon: "shield" },
    { id: "storm-oracle", x: 440, y: 440, color: "#86ccec", icon: "skills" },
    { id: "ember-champion", x: 180, y: 465, color: "#ee9f83", icon: "crossbow" },
] as const;
const WIDTH = 550, HEIGHT = 550;

/** A DOM-only atlas: panning changes one transform and never resamples terrain. */
export function WorldTravelGraph({ combat, selected, busy, select }: {
    combat: CombatSnapshot; selected: WorldLocation; busy: boolean; select(id: WorldLocation): void;
}) {
    const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
    const view = useRef({ x: 0, y: 0, scale: 1 });
    const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
    const [compact, setCompact] = useState(false);
    const nodes = NODES.map((node, index) => compact ? { ...node, x: 90 + index % 3 * 185, y: 75 + Math.floor(index / 3) * 145 } : node);
    const origin = nodes[1];
    const paint = () => {
        const { x, y, scale } = view.current;
        if (content.current) content.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    };
    const reset = () => {
        if (!viewport.current) return;
        const { clientWidth: width, clientHeight: height } = viewport.current;
        const narrow = width < 420, contentHeight = narrow ? 300 : HEIGHT;
        setCompact(narrow);
        const scale = Math.min(width / WIDTH, height / contentHeight, 1);
        view.current = { x: (width - WIDTH * scale) / 2, y: (height - contentHeight * scale) / 2, scale };
        paint();
    };
    useLayoutEffect(() => {
        const observer = new ResizeObserver(reset);
        observer.observe(viewport.current!); reset();
        return () => observer.disconnect();
    }, []);
    const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.classList.remove("dragging");
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    return <nav className="travel-atlas" aria-label="传送区域">
        <header><span>世界航图</span><button onClick={reset} aria-label="复位世界航图"><UiIcon name="map" />全览</button></header>
        <div className="travel-graph" ref={viewport} data-testid="world-travel-graph" onContextMenu={event => event.preventDefault()}
            onPointerDown={event => {
                if (event.button !== 2 && event.pointerType !== "touch") return;
                if (event.pointerType === "touch" && (event.target as Element).closest("button")) return;
                event.preventDefault();
                drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.classList.add("dragging");
            }} onPointerMove={event => {
                const active = drag.current;
                if (!active || active.pointer !== event.pointerId) return;
                view.current.x += event.clientX - active.x; view.current.y += event.clientY - active.y;
                active.x = event.clientX; active.y = event.clientY; paint();
            }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
            <div className="travel-graph-content" ref={content} style={{ width: WIDTH, height: compact ? 300 : HEIGHT }}>
                <svg className="travel-routes" width={WIDTH} height={compact ? 300 : HEIGHT} aria-hidden="true">
                    {!compact && <circle cx="300" cy="275" r="180" />}
                    {nodes.filter(node => node.id !== "wilds").map(node => <path key={node.id} className={selected === node.id ? "selected" : ""}
                        d={`M${origin.x} ${origin.y} Q${(node.x + origin.x) / 2 + 30} ${(node.y + origin.y) / 2} ${node.x} ${node.y}`} />)}
                </svg>
                {nodes.map(node => {
                    const { id } = node, state = isChallenge(id) ? combat.challenges[id] : undefined;
                    const count = combat.player.inventory.reduce((n, item) => n + (item.type === "scroll" && item.value === id ? item.size : 0), 0);
                    const title = id === "homestead" ? "灯火营地" : id === "wilds" ? "荒野" : CHALLENGES[id].name;
                    return <button key={id} className={`travel-node${selected === id ? " selected" : ""}`} disabled={busy}
                        style={{ left: node.x, top: node.y, "--node-color": node.color } as CSSProperties}
                        aria-label={`目的地：${title}`} aria-pressed={selected === id} onClick={() => select(id)}>
                        <span className="travel-node-emblem"><UiIcon name={node.icon} />{id === combat.world.location && <i />}</span>
                        <strong>{title}</strong><small>{id === combat.world.location ? "当前所在" : state && !state.claimed ? `继续 · 剩余 ${state.remaining}` : isChallenge(id) ? `卷轴 ×${count}${state?.claimed ? " · 已通关" : ""}` : "已开放"}</small>
                    </button>;
                })}
            </div>
        </div>
    </nav>;
}

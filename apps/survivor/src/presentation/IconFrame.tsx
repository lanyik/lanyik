import type { CSSProperties, ReactNode } from "react";
import type { Rarity } from "../core/Loot";

/** Background, artwork, quality border and badge share one layout for all game icons. */
export function IconFrame({ type, value, rarity = "common", badge, accent, className = "", children }: {
    readonly type: string; readonly value: string; readonly rarity?: Rarity;
    readonly badge?: ReactNode; readonly accent?: string; readonly className?: string; readonly children: ReactNode;
}) {
    return <span className={`item-icon-frame rarity-${rarity} item-type-${type} ${className}`} data-item-icon={type} data-item-value={value}
        style={accent ? { "--skill-color": accent } as CSSProperties : undefined}>
        <span className="item-icon-base" />{children}<span className="item-icon-border" />
        {badge !== undefined && <span className="item-icon-badge">{badge}</span>}
    </span>;
}

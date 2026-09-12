import { WorldMinimap, type HexMap, type WorldMinimapOverlayFrame } from "three-hex-map";
import type { RegionMapBinding } from "../app/RegionMapBinding";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { REGION_RADIUS } from "../core/RegionalWorld";

/** Inverse even-column offset layout, interpolated between tile centres. */
export function overviewPoint(x: number, z: number): { x: number; y: number } {
    const column = x / 1.5, left = Math.floor(column), fraction = column - left;
    const shift = (left % 2 === 0 ? 1 - fraction : fraction) * .5;
    return { x: column + .5, y: z / Math.sqrt(3) - shift + .5 };
}

/** North-up map: combat heading zero faces +Z (down), independently of camera orbit. */
export function overviewHeading(heading: number, scaleX: number, scaleY: number): number {
    return Math.atan2(Math.sin(heading) / 1.5 * scaleX, -Math.cos(heading) / Math.sqrt(3) * scaleY);
}

export class HexRegionMap implements RegionMapBinding {
    private readonly minimap: WorldMinimap;
    private combat: CombatSnapshot | undefined;

    constructor(map: HexMap, canvas: HTMLCanvasElement, onError: (error: Error) => void) {
        const policy = GAME_CONFIG.presentation.minimap;
        this.minimap = new WorldMinimap({ map, element: canvas, interactive: false,
            infiniteTileSpan: policy.tileSpan, rasterSize: policy.rasterSize, cacheEntries: policy.cacheEntries,
            drawOverlay: this.drawOverlay, onError });
    }

    public update(combat: CombatSnapshot): void {
        const previous = this.combat;
        this.combat = combat;
        if (!previous || previous.player.x !== combat.player.x || previous.player.z !== combat.player.z
            || previous.player.heading !== combat.player.heading
            || previous.region.x !== combat.region.x || previous.region.z !== combat.region.z) this.minimap.redraw();
    }
    public setExpanded(expanded: boolean): void { this.minimap.setExpanded(expanded); }
    public dispose(): void { this.minimap.dispose(); this.combat = undefined; }

    private drawOverlay = (context: CanvasRenderingContext2D, { content, extent }: WorldMinimapOverlayFrame): void => {
        const combat = this.combat;
        if (!combat) return;
        const scaleX = content.width / extent.tileSpanX, scaleY = content.height / extent.tileSpanY;
        const project = (x: number, z: number) => {
            const point = overviewPoint(x, z);
            return { x: content.x + (point.x - extent.originX) * scaleX, y: content.y + (point.y - extent.originY) * scaleY };
        };
        // Overlapping washes leave the sampled river and relief colours legible.
        for (const region of combat.nearbyRegions) {
            if (region.difficulty === "normal") continue;
            const p = project(region.centerX, region.centerZ), horror = region.difficulty === "horror";
            const radiusX = REGION_RADIUS / 1.5 * scaleX, radiusY = REGION_RADIUS / Math.sqrt(3) * scaleY;
            const color = horror ? "197, 101, 141" : "225, 175, 86";
            context.save(); context.translate(p.x, p.y); context.scale(radiusX, radiusY);
            const wash = context.createRadialGradient(0, 0, .08, 0, 0, 1.2);
            wash.addColorStop(0, `rgba(${color}, .36)`);
            wash.addColorStop(.52, `rgba(${color}, .21)`);
            wash.addColorStop(1, `rgba(${color}, 0)`);
            context.fillStyle = wash; context.fillRect(-1.2, -1.2, 2.4, 2.4); context.restore();
        }
        for (const region of combat.nearbyRegions) {
            if (region.difficulty !== "horror" && (!this.minimap.isExpanded || region.difficulty !== "hard")) continue;
            const p = project(region.centerX, region.centerZ);
            const playerDistance = Math.hypot(region.centerX - combat.player.x, region.centerZ - combat.player.z);
            if (playerDistance < REGION_RADIUS * .42 || p.x < content.x + 14 || p.x > content.x + content.width - 14
                || p.y < content.y + 18 || p.y > content.y + content.height - 18) continue;
            context.font = "600 10px system-ui, sans-serif";
            context.textAlign = "center"; context.textBaseline = "middle";
            context.shadowColor = "#0c1920"; context.shadowBlur = 4;
            context.fillStyle = region.difficulty === "horror" ? "#ffe0ec" : "#f6dfad";
            if (region.difficulty === "horror") context.fillText("◆", p.x, p.y - 6);
            if (this.minimap.isExpanded) context.fillText(`Lv.${region.level}`, p.x, p.y + 7);
            context.shadowBlur = 0;
        }
        const player = project(combat.player.x, combat.player.z);
        context.beginPath(); context.arc(player.x, player.y, 9, 0, Math.PI * 2);
        context.fillStyle = "#fff2bf22"; context.fill();
        context.strokeStyle = "#fff2bfb3"; context.lineWidth = 1; context.stroke();
        context.beginPath(); context.arc(player.x, player.y, 3.5, 0, Math.PI * 2);
        context.fillStyle = "#fff5d4"; context.fill();
        context.strokeStyle = "#223334"; context.lineWidth = 1.5; context.stroke();
        context.save(); context.translate(player.x, player.y); context.rotate(overviewHeading(combat.player.heading, scaleX, scaleY));
        context.beginPath(); context.moveTo(0, -13); context.lineTo(5, -5); context.lineTo(0, -7); context.lineTo(-5, -5); context.closePath();
        context.fillStyle = "#fff5d4"; context.strokeStyle = "#172c31"; context.lineWidth = 1.5; context.fill(); context.stroke(); context.restore();
    };
}

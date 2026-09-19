import { WorldMinimap, getHexCenter, type Point, type HexMap, type WorldMinimapOverlayFrame } from "three-hex-map";
import type { RegionMapBinding, RegionMapControls, MapDestination } from "../app/RegionMapBinding";
import type { CombatSnapshot } from "../core/CombatState";
import { GAME_CONFIG } from "../core/GameConfig";
import { REGION_RADIUS, RegionalWorld, type RegionInfo } from "../core/RegionalWorld";
import { Exploration, type ExplorationSnapshot } from "../core/Exploration";

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
    private regions: RegionalWorld | undefined;
    private visibleRegions: readonly RegionInfo[] = [];
    private regionWindow = "";
    private exploration = new Exploration();
    private discoveryRevision = -1;
    private selectedTile: Readonly<Point> | undefined;
    private fogSignature = "";
    private fogRects: number[] = [];

    constructor(map: HexMap, canvas: HTMLCanvasElement, private readonly controls: RegionMapControls, onError: (error: Error) => void) {
        const policy = GAME_CONFIG.presentation.minimap;
        this.minimap = new WorldMinimap({ map, element: canvas, keyboard: false,
            infiniteTileSpan: policy.tileSpan, rasterSize: policy.rasterSize, cacheEntries: policy.cacheEntries,
            onExpandedChange: controls.onExpandedChange,
            onDestinationChange: tile => { this.selectedTile = tile; controls.onDestinationChange(tile ? this.destination(tile) : undefined); },
            onNavigate: tile => controls.onNavigate(this.destination(tile)),
            drawOverlay: this.drawOverlay, onError });
    }

    public update(combat: CombatSnapshot, discovery: ExplorationSnapshot): void {
        const previous = this.combat;
        this.combat = combat;
        const knowledgeChanged = this.discoveryRevision !== discovery.revision || previous?.player.level !== combat.player.level;
        if (this.discoveryRevision !== discovery.revision) {
            this.exploration = new Exploration(discovery); this.discoveryRevision = discovery.revision;
        }
        if (!previous || previous.world.seed !== combat.world.seed || previous.world.origin.x !== combat.world.origin.x
            || previous.world.origin.z !== combat.world.origin.z) {
            this.regions = new RegionalWorld(combat.world.seed, combat.world.origin); this.regionWindow = "";
        }
        if (knowledgeChanged && this.selectedTile) this.controls.onDestinationChange(this.destination(this.selectedTile));
        if (knowledgeChanged || !this.regionWindow || !previous || previous.player.x !== combat.player.x || previous.player.z !== combat.player.z
            || previous.player.heading !== combat.player.heading
            || previous.region.x !== combat.region.x || previous.region.z !== combat.region.z) this.minimap.redraw();
    }
    public setExpanded(expanded: boolean): void { this.minimap.setExpanded(expanded); }
    public recenter(): void { this.minimap.recenter(); }
    public navigate(): void {
        if (this.combat && !this.combat.gameOver && this.selectedTile && this.destination(this.selectedTile).accessible) this.minimap.navigateToDestination();
    }
    public dispose(): void { this.minimap.dispose(); this.combat = undefined; }

    private destination(tile: Readonly<Point>): MapDestination {
        const point = getHexCenter(tile.x, tile.y, 1);
        const region = this.regions!.regionAt(point.x, point.y);
        return { x: point.x, z: point.y, region, accessible: this.combat!.world.location === "homestead"
            || this.exploration.has(point.x, point.y) || region.level < this.combat!.player.level };
    }

    private drawOverlay = (context: CanvasRenderingContext2D, { content, extent, destination }: WorldMinimapOverlayFrame): void => {
        const combat = this.combat;
        if (!combat) return;
        const scaleX = content.width / extent.tileSpanX, scaleY = content.height / extent.tileSpanY;
        const project = (x: number, z: number) => {
            const point = overviewPoint(x, z);
            return { x: content.x + (point.x - extent.originX) * scaleX, y: content.y + (point.y - extent.originY) * scaleY };
        };
        // Cache a padded, quantized metadata window, independently of terrain pages and resident encounters.
        const bounds = [Math.floor(extent.originX * 1.5 / REGION_RADIUS) - 2,
            Math.floor(extent.originY * Math.sqrt(3) / REGION_RADIUS) - 2,
            Math.ceil((extent.originX + extent.tileSpanX) * 1.5 / REGION_RADIUS) + 2,
            Math.ceil((extent.originY + extent.tileSpanY) * Math.sqrt(3) / REGION_RADIUS) + 2];
        const signature = bounds.join(",");
        if (this.regionWindow !== signature) {
            this.visibleRegions = this.regions!.regionsInBounds(bounds[0] * REGION_RADIUS, bounds[1] * REGION_RADIUS,
                bounds[2] * REGION_RADIUS, bounds[3] * REGION_RADIUS);
            this.regionWindow = signature;
        }
        // Overlapping washes leave the sampled river and relief colours legible.
        for (const region of combat.world.location === "homestead" ? [] : this.visibleRegions) {
            if (region.difficulty === "normal") continue;
            const p = project(region.centerX, region.centerZ), horror = region.difficulty === "horror";
            const radiusX = REGION_RADIUS / 1.5 * scaleX, radiusY = REGION_RADIUS / Math.sqrt(3) * scaleY;
            if (p.x + radiusX * 1.2 < content.x || p.x - radiusX * 1.2 > content.x + content.width
                || p.y + radiusY * 1.2 < content.y || p.y - radiusY * 1.2 > content.y + content.height) continue;
            const color = horror ? "197, 101, 141" : "225, 175, 86";
            context.save(); context.translate(p.x, p.y); context.scale(radiusX, radiusY);
            const wash = context.createRadialGradient(0, 0, .08, 0, 0, 1.2);
            wash.addColorStop(0, `rgba(${color}, .36)`);
            wash.addColorStop(.52, `rgba(${color}, .21)`);
            wash.addColorStop(1, `rgba(${color}, 0)`);
            context.fillStyle = wash; context.fillRect(-1.2, -1.2, 2.4, 2.4); context.restore();
        }
        for (const region of combat.world.location === "homestead" ? [] : this.visibleRegions) {
            if (!this.exploration.has(region.centerX, region.centerZ) && region.level >= combat.player.level) continue;
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
        if (combat.world.location === "wilds") this.drawFog(context, { content, extent });
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
        if (destination) {
            const x = content.x + (destination.x + .5 - extent.originX) * scaleX;
            const y = content.y + (destination.y + .5 - extent.originY) * scaleY;
            context.strokeStyle = "#ffd48a"; context.lineWidth = 2;
            context.beginPath(); context.arc(x, y, 8, 0, Math.PI * 2); context.stroke();
            context.beginPath(); context.moveTo(x - 13, y); context.lineTo(x - 5, y); context.moveTo(x + 5, y); context.lineTo(x + 13, y);
            context.moveTo(x, y - 13); context.lineTo(x, y - 5); context.moveTo(x, y + 5); context.lineTo(x, y + 13); context.stroke();
        }
    };

    private drawFog(context: CanvasRenderingContext2D, { content, extent }: WorldMinimapOverlayFrame): void {
        const level = this.combat!.player.level, resolution = 128;
        const signature = `${extent.originX},${extent.originY},${extent.tileSpanX},${extent.tileSpanY},${level},${this.discoveryRevision}`;
        if (signature !== this.fogSignature) {
            const rectangles: number[] = [];
            let region: RegionInfo | undefined;
            for (let row = 0; row < resolution; row++) {
                let run = -1;
                for (let column = 0; column <= resolution; column++) {
                    const tx = extent.originX + (column + .5) / resolution * extent.tileSpanX - .5;
                    const left = Math.floor(tx), fraction = tx - left;
                    const shift = (left % 2 === 0 ? 1 - fraction : fraction) * .5;
                    const x = tx * 1.5, z = (extent.originY + (row + .5) / resolution * extent.tileSpanY - .5 + shift) * Math.sqrt(3);
                    let known = column === resolution || this.exploration.has(x, z);
                    if (!known && level > 1) { region = this.regions!.regionAt(x, z, region); known = region.level < level; }
                    if (!known && run < 0) run = column;
                    else if (known && run >= 0) { rectangles.push(run / resolution, row / resolution, (column - run) / resolution, 1 / resolution); run = -1; }
                }
            }
            this.fogRects = rectangles; this.fogSignature = signature;
        }
        const shade = context.createLinearGradient(0, content.y, 0, content.y + content.height);
        shade.addColorStop(0, "#172732"); shade.addColorStop(1, "#09141e");
        context.fillStyle = shade; context.beginPath();
        for (let i = 0; i < this.fogRects.length; i += 4) context.rect(content.x + this.fogRects[i] * content.width,
            content.y + this.fogRects[i + 1] * content.height, this.fogRects[i + 2] * content.width, this.fogRects[i + 3] * content.height);
        context.fill();
    }
}

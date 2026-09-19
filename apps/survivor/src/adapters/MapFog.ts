import type { ResourceBudgetAccount, WorldMinimapOverlayFrame } from "three-hex-map";
import { EXPLORATION, type Exploration } from "../core/Exploration";
import { REGION_RADIUS, type RegionalWorld } from "../core/RegionalWorld";
import { overviewPoint } from "./MapProjection";

const SIZE = 256;
interface FogWindow { readonly x: number; readonly y: number; readonly span: number; readonly scale: number;
    readonly revision: number; readonly level: number; readonly world: RegionalWorld }

/** One bounded overscan raster; camera motion only crops/blits while knowledge and scale remain valid. */
export class MapFog {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private cache: FogWindow | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        this.canvas = document.createElement("canvas");
        try {
            resources.acquireRequired("fog-raster", { cpuBytes: SIZE * SIZE * 4, gpuBytes: SIZE * SIZE * 4, textureBytes: SIZE * SIZE * 4 }, true);
            this.canvas.width = this.canvas.height = SIZE;
            const context = this.canvas.getContext("2d");
            if (!context) throw new Error("Minimap fog requires a 2D canvas");
            this.context = context;
        } catch (error) { this.dispose(); throw error; }
    }

    public draw(context: CanvasRenderingContext2D, { content, extent }: WorldMinimapOverlayFrame,
        discovery: Exploration, level: number, world: RegionalWorld): void {
        const scale = 2 ** Math.ceil(Math.log2(Math.max(extent.tileSpanX, extent.tileSpanY)));
        const cached = this.cache;
        if (!cached || cached.world !== world || cached.revision !== discovery.snapshot.revision || cached.level !== level
            || cached.scale !== scale || extent.originX < cached.x || extent.originY < cached.y
            || extent.originX + extent.tileSpanX > cached.x + cached.span || extent.originY + extent.tileSpanY > cached.y + cached.span) {
            const span = scale * 1.5;
            const next: FogWindow = { x: extent.originX + (extent.tileSpanX - span) / 2, y: extent.originY + (extent.tileSpanY - span) / 2,
                span, scale, revision: discovery.snapshot.revision, level, world };
            this.paint(next, discovery); this.cache = next;
        }
        const window = this.cache!, pixels = SIZE / window.span;
        context.save();
        // Do not filter transparent known texels across an opaque unknown boundary.
        context.imageSmoothingEnabled = false;
        context.drawImage(this.canvas, (extent.originX - window.x) * pixels, (extent.originY - window.y) * pixels,
            extent.tileSpanX * pixels, extent.tileSpanY * pixels, content.x, content.y, content.width, content.height);
        context.restore();
    }

    public dispose(): void { this.cache = undefined; this.canvas.width = this.canvas.height = 0; this.resources.dispose(); }

    private paint(window: FogWindow, discovery: Exploration): void {
        const context = this.context;
        const shade = context.createLinearGradient(0, 0, 0, SIZE);
        shade.addColorStop(0, "#172732"); shade.addColorStop(1, "#09141e");
        context.fillStyle = shade; context.fillRect(0, 0, SIZE, SIZE);
        this.clouds(window);
        const minX = (window.x - .5) * 1.5, maxX = (window.x + window.span - .5) * 1.5;
        const minZ = (window.y - .5) * Math.sqrt(3), maxZ = (window.y + window.span) * Math.sqrt(3);
        const size = EXPLORATION.cellSize, edge = EXPLORATION.pageEdge, pageSize = size * edge;
        // Cut the union of known cell runs and lower-level hexes from the opaque cloud image.
        // Work depends on visible knowledge/regions, never on the number of canvas pixels.
        context.beginPath();
        for (const page of discovery.snapshot.pages) {
            const x = page.x * pageSize, z = page.z * pageSize;
            if (x > maxX || x + pageSize < minX || z > maxZ || z + pageSize < minZ) continue;
            for (let row = 0; row < edge; row++) {
                let start = -1;
                for (let column = 0; column <= edge; column++) {
                    const known = column < edge && (page.rows[row] & (1 << column));
                    if (known && start < 0) start = column;
                    else if (!known && start >= 0) {
                        this.polygon(window, [[x + start * size, z + row * size], [x + column * size, z + row * size],
                            [x + column * size, z + (row + 1) * size], [x + start * size, z + (row + 1) * size]]);
                        start = -1;
                    }
                }
            }
        }
        if (window.level > 1) for (const region of window.world.regionsInBounds(minX - REGION_RADIUS, minZ - REGION_RADIUS,
            maxX + REGION_RADIUS, maxZ + REGION_RADIUS)) {
            if (region.level >= window.level) continue;
            const vertices: [number, number][] = [];
            for (let i = 0; i < 6; i++) vertices.push([region.centerX + Math.cos(i * Math.PI / 3) * REGION_RADIUS,
                region.centerZ + Math.sin(i * Math.PI / 3) * REGION_RADIUS]);
            this.polygon(window, vertices);
        }
        context.globalCompositeOperation = "destination-out";
        context.fillStyle = "#000"; context.fill();
        context.globalCompositeOperation = "source-over";
    }

    private polygon(window: FogWindow, vertices: readonly (readonly [number, number])[]): void {
        const context = this.context, pixels = SIZE / window.span;
        const point = (x: number, z: number, first = false) => {
            const p = overviewPoint(x, z), px = (p.x - window.x) * pixels, py = (p.y - window.y) * pixels;
            if (first) context.moveTo(px, py); else context.lineTo(px, py);
        };
        point(...vertices[0], true);
        for (let i = 0; i < vertices.length; i++) {
            const [x, z] = vertices[i], [nx, nz] = vertices[(i + 1) % vertices.length];
            // Projection is piecewise linear: split edges at terrain-column boundaries.
            const direction = Math.sign(nx - x);
            let column = direction > 0 ? Math.floor(x / 1.5) + 1 : Math.ceil(x / 1.5) - 1;
            for (; direction && (column * 1.5 - nx) * direction < 0; column += direction) {
                const cx = column * 1.5; point(cx, z + (nz - z) * (cx - x) / (nx - x));
            }
            point(nx, nz);
        }
        context.closePath();
    }

    private clouds(window: FogWindow): void {
        const context = this.context, span = window.scale / 4, pixels = SIZE / window.span;
        for (let x = Math.floor(window.x / span) - 1; x <= Math.ceil((window.x + window.span) / span); x++) {
            for (let y = Math.floor(window.y / span) - 1; y <= Math.ceil((window.y + window.span) / span); y++) {
                const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453, fraction = hash - Math.floor(hash);
                const px = ((x + fraction) * span - window.x) * pixels, py = ((y + 1 - fraction) * span - window.y) * pixels;
                const radius = span * pixels * (1 + fraction * .6), cloud = context.createRadialGradient(px, py, 0, px, py, radius);
                cloud.addColorStop(0, "#65858e42"); cloud.addColorStop(.45, "#3f606d28"); cloud.addColorStop(1, "#20374300");
                context.fillStyle = cloud; context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
            }
        }
    }
}

import type { HexMap } from "./HexMap";
import type { Point } from "./interfaces";
import {
    MAX_WORLD_OVERVIEW_RASTER_SIZE,
    MAX_WORLD_OVERVIEW_TILE_SPAN,
    WorldOverviewPreparationOptions,
    WorldOverviewRaster
} from "./world/generateWorldOverview";

export interface WorldMinimapOptions {
    map: HexMap;
    element: string | HTMLCanvasElement;
    rasterSize?: number;
    infiniteTileSpan?: number;
    cacheEntries?: number;
    redrawIntervalMs?: number;
    onNavigate?: (tile: Readonly<Point>) => void;
    onError?: (error: Error) => void;
}

export interface WorldMinimapView {
    readonly loading: boolean;
    readonly originX?: number;
    readonly originY?: number;
    readonly tileSpanX?: number;
    readonly tileSpanY?: number;
    readonly pixelWidth?: number;
    readonly pixelHeight?: number;
    readonly cachedViews: number;
}

interface ContentRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const DEFAULT_RASTER_SIZE = 192;
const DEFAULT_INFINITE_TILE_SPAN = 512;
const DEFAULT_CACHE_ENTRIES = 6;
const DEFAULT_REDRAW_INTERVAL_MS = 66;

function asPositiveInteger(name: string, value: number, maximum: number): number {
    if (!Number.isInteger(value) || value <= 0 || value > maximum) {
        throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
    }
    return value;
}

function abortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

// Canvas-only overview control. Terrain pixels are generated through the
// world's worker-backed overview API, so this class never makes distant render
// chunks resident and never creates a second Three.js scene or renderer.
export class WorldMinimap {
    private readonly map: HexMap;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly baseCanvas: HTMLCanvasElement;
    private readonly baseContext: CanvasRenderingContext2D;
    private readonly rasterSize: number;
    private readonly infiniteTileSpan: number;
    private readonly cacheEntries: number;
    private readonly redrawIntervalMs: number;
    private readonly onNavigate: ((tile: Readonly<Point>) => void) | undefined;
    private readonly onError: ((error: Error) => void) | undefined;
    private readonly cache = new Map<string, WorldOverviewRaster>();
    private readonly resizeObserver: ResizeObserver | undefined;
    private raster: WorldOverviewRaster | undefined;
    private contentRect: ContentRect = { x: 0, y: 0, width: 0, height: 0 };
    private requestAbort: AbortController | undefined;
    private pendingKey: string | undefined;
    private pending: Promise<void> | undefined;
    private lastDrawAt = -Infinity;
    private lastCoverageCheckAt = -Infinity;
    private disposed = false;

    constructor(options: WorldMinimapOptions) {
        if (!options || typeof options !== "object") throw new TypeError("world minimap options are required");
        if (!options.map) throw new TypeError("world minimap map is required");
        const canvas = typeof options.element === "string"
            ? document.querySelector(options.element)
            : options.element;
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("WorldMinimap element must resolve to a <canvas>");
        }
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("WorldMinimap requires a Canvas 2D context");
        this.map = options.map;
        this.canvas = canvas;
        this.context = context;
        this.rasterSize = asPositiveInteger(
            "rasterSize",
            options.rasterSize ?? DEFAULT_RASTER_SIZE,
            MAX_WORLD_OVERVIEW_RASTER_SIZE
        );
        this.infiniteTileSpan = asPositiveInteger(
            "infiniteTileSpan",
            options.infiniteTileSpan ?? DEFAULT_INFINITE_TILE_SPAN,
            MAX_WORLD_OVERVIEW_TILE_SPAN
        );
        if (this.infiniteTileSpan % 2 !== 0) throw new RangeError("infiniteTileSpan must be even");
        this.cacheEntries = asPositiveInteger("cacheEntries", options.cacheEntries ?? DEFAULT_CACHE_ENTRIES, 64);
        this.redrawIntervalMs = options.redrawIntervalMs ?? DEFAULT_REDRAW_INTERVAL_MS;
        if (!Number.isFinite(this.redrawIntervalMs) || this.redrawIntervalMs <= 0) {
            throw new RangeError("redrawIntervalMs must be positive and finite");
        }
        this.onNavigate = options.onNavigate;
        this.onError = options.onError;
        this.baseCanvas = document.createElement("canvas");
        const baseContext = this.baseCanvas.getContext("2d", { alpha: false });
        if (!baseContext) throw new Error("WorldMinimap requires an offscreen Canvas 2D context");
        this.baseContext = baseContext;

        this.canvas.addEventListener("pointerdown", this.handlePointerDown);
        this.canvas.addEventListener("click", this.handleClick);
        this.map.on("load", this.handleWorldLoad);
        this.map.on("frame", this.handleFrame);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.render());
            this.resizeObserver.observe(this.canvas);
        }
        this.render();
        void this.refresh();
    }

    public get view(): Readonly<WorldMinimapView> {
        return {
            loading: Boolean(this.pending),
            originX: this.raster?.originX,
            originY: this.raster?.originY,
            tileSpanX: this.raster?.tileSpanX,
            tileSpanY: this.raster?.tileSpanY,
            pixelWidth: this.raster?.pixelWidth,
            pixelHeight: this.raster?.pixelHeight,
            cachedViews: this.cache.size
        };
    }

    public refresh(force = false): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("WorldMinimap has been disposed"));
        const target = this.map.getCameraTargetTile();
        if (!target) {
            this.render();
            return Promise.resolve();
        }
        const options = this.overviewOptions(target);
        if (!options) {
            this.render();
            return Promise.resolve();
        }
        if (!force && this.raster && this.coversTarget(this.raster, target)) {
            return Promise.resolve();
        }
        const key = this.cacheKey(options);
        if (!force) {
            const cached = this.cache.get(key);
            if (cached) {
                this.cache.delete(key);
                this.cache.set(key, cached);
                this.useRaster(cached);
                return Promise.resolve();
            }
        }
        if (!force && this.pendingKey === key && this.pending) return this.pending;

        this.requestAbort?.abort();
        const requestAbort = new AbortController();
        this.requestAbort = requestAbort;
        this.pendingKey = key;
        this.canvas.setAttribute("aria-busy", "true");
        this.canvas.dataset.state = "loading";
        const pending = this.map.requestWorldOverview(options, {
            signal: requestAbort.signal,
            lane: "background"
        }).then(raster => {
            if (this.disposed || requestAbort.signal.aborted || this.requestAbort !== requestAbort) return;
            this.cache.set(key, raster);
            while (this.cache.size > this.cacheEntries) {
                const oldest = this.cache.keys().next().value as string | undefined;
                if (oldest === undefined) break;
                this.cache.delete(oldest);
            }
            this.useRaster(raster);
        }).catch(reason => {
            if (abortError(reason) || this.disposed || requestAbort.signal.aborted) return;
            const error = reason instanceof Error ? reason : new Error(String(reason));
            this.canvas.dataset.state = "error";
            this.onError?.(error);
        }).finally(() => {
            if (this.requestAbort !== requestAbort) return;
            this.requestAbort = undefined;
            this.pendingKey = undefined;
            this.pending = undefined;
            this.canvas.setAttribute("aria-busy", "false");
            if (this.canvas.dataset.state === "loading") this.canvas.dataset.state = this.raster ? "ready" : "empty";
            this.render();
        });
        this.pending = pending;
        this.render();
        return pending;
    }

    public clear(): void {
        if (this.disposed) return;
        this.requestAbort?.abort();
        this.requestAbort = undefined;
        this.pendingKey = undefined;
        this.pending = undefined;
        this.raster = undefined;
        this.cache.clear();
        this.baseCanvas.width = 0;
        this.baseCanvas.height = 0;
        this.canvas.setAttribute("aria-busy", "false");
        this.canvas.dataset.state = "empty";
        this.render();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.clear();
        this.disposed = true;
        this.resizeObserver?.disconnect();
        this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
        this.canvas.removeEventListener("click", this.handleClick);
        this.map.off("load", this.handleWorldLoad);
        this.map.off("frame", this.handleFrame);
    }

    private overviewOptions(target: Readonly<Point>): WorldOverviewPreparationOptions | undefined {
        const bounds = this.map.worldBounds;
        if (bounds) {
            const aspect = bounds.width / bounds.height;
            const pixelWidth = aspect >= 1
                ? this.rasterSize
                : Math.max(1, Math.round(this.rasterSize * aspect));
            const pixelHeight = aspect >= 1
                ? Math.max(1, Math.round(this.rasterSize / aspect))
                : this.rasterSize;
            return {
                originX: 0,
                originY: 0,
                tileSpanX: bounds.width,
                tileSpanY: bounds.height,
                pixelWidth,
                pixelHeight
            };
        }
        if (this.map.worldDescriptor?.topology !== "infinite") return undefined;
        const step = Math.max(1, Math.floor(this.infiniteTileSpan / 4));
        const centerX = Math.round(target.x / step) * step;
        const centerY = Math.round(target.y / step) * step;
        return {
            originX: centerX - this.infiniteTileSpan / 2,
            originY: centerY - this.infiniteTileSpan / 2,
            tileSpanX: this.infiniteTileSpan,
            tileSpanY: this.infiniteTileSpan,
            pixelWidth: this.rasterSize,
            pixelHeight: this.rasterSize
        };
    }

    private coversTarget(raster: WorldOverviewRaster, target: Readonly<Point>): boolean {
        if (this.map.worldBounds) return true;
        const marginX = raster.tileSpanX * 0.18;
        const marginY = raster.tileSpanY * 0.18;
        return target.x >= raster.originX + marginX
            && target.x < raster.originX + raster.tileSpanX - marginX
            && target.y >= raster.originY + marginY
            && target.y < raster.originY + raster.tileSpanY - marginY;
    }

    private cacheKey(options: WorldOverviewPreparationOptions): string {
        return [
            options.originX,
            options.originY,
            options.tileSpanX,
            options.tileSpanY,
            options.pixelWidth,
            options.pixelHeight
        ].join(":");
    }

    private useRaster(raster: WorldOverviewRaster): void {
        this.raster = raster;
        this.baseCanvas.width = raster.pixelWidth;
        this.baseCanvas.height = raster.pixelHeight;
        const image = this.baseContext.createImageData(raster.pixelWidth, raster.pixelHeight);
        image.data.set(raster.pixels);
        this.baseContext.putImageData(image, 0, 0);
        this.canvas.dataset.state = "ready";
        this.render();
    }

    private render(): void {
        if (this.disposed) return;
        const bounds = this.canvas.getBoundingClientRect();
        const width = Math.max(1, bounds.width || this.canvas.clientWidth || 220);
        const height = Math.max(1, bounds.height || this.canvas.clientHeight || 220);
        const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const bufferWidth = Math.round(width * ratio);
        const bufferHeight = Math.round(height * ratio);
        if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
            this.canvas.width = bufferWidth;
            this.canvas.height = bufferHeight;
        }
        const context = this.context;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "rgba(4, 15, 20, 0.94)";
        context.fillRect(0, 0, width, height);

        const padding = 6;
        const availableWidth = Math.max(1, width - padding * 2);
        const availableHeight = Math.max(1, height - padding * 2);
        const rasterAspect = this.raster ? this.raster.pixelWidth / this.raster.pixelHeight : 1;
        let contentWidth = availableWidth;
        let contentHeight = contentWidth / rasterAspect;
        if (contentHeight > availableHeight) {
            contentHeight = availableHeight;
            contentWidth = contentHeight * rasterAspect;
        }
        this.contentRect = {
            x: (width - contentWidth) / 2,
            y: (height - contentHeight) / 2,
            width: contentWidth,
            height: contentHeight
        };
        const rect = this.contentRect;
        if (this.raster) {
            context.imageSmoothingEnabled = true;
            context.drawImage(this.baseCanvas, rect.x, rect.y, rect.width, rect.height);
            this.drawCameraOverlay(context, rect, this.raster);
            this.drawPosition(context, rect);
        } else {
            context.fillStyle = "rgba(93, 143, 139, 0.16)";
            context.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        context.strokeStyle = "rgba(124, 235, 211, 0.42)";
        context.lineWidth = 1;
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
        if (this.pending) {
            context.fillStyle = "rgba(4, 15, 20, 0.5)";
            context.fillRect(rect.x, rect.y, rect.width, rect.height);
            context.fillStyle = "#9debd8";
            context.font = "600 18px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("…", rect.x + rect.width / 2, rect.y + rect.height / 2);
        }
    }

    private drawCameraOverlay(
        context: CanvasRenderingContext2D,
        rect: ContentRect,
        raster: WorldOverviewRaster
    ): void {
        const target = this.map.getCameraTargetTile();
        if (!target) return;
        const x = rect.x + (target.x + 0.5 - raster.originX) / raster.tileSpanX * rect.width;
        const y = rect.y + (target.y + 0.5 - raster.originY) / raster.tileSpanY * rect.height;
        const tileRadiusX = this.map.worldViewDistance / (this.map.size * 1.5);
        const tileRadiusY = this.map.worldViewDistance / (this.map.size * Math.sqrt(3));
        const radiusX = Math.max(4, tileRadiusX / raster.tileSpanX * rect.width);
        const radiusY = Math.max(4, tileRadiusY / raster.tileSpanY * rect.height);

        context.save();
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
        context.clip();
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
        context.fillStyle = "rgba(100, 240, 211, 0.09)";
        context.fill();
        context.strokeStyle = "rgba(129, 255, 225, 0.8)";
        context.lineWidth = 1.5;
        context.setLineDash([4, 3]);
        context.stroke();
        context.setLineDash([]);

        context.beginPath();
        context.arc(x, y, 4, 0, Math.PI * 2);
        context.fillStyle = "#dffff7";
        context.fill();
        context.strokeStyle = "#123f3b";
        context.lineWidth = 2;
        context.stroke();
        context.restore();
    }

    private drawPosition(context: CanvasRenderingContext2D, rect: ContentRect): void {
        const target = this.map.getCameraTargetTile();
        if (!target) return;
        const label = `${target.x}, ${target.y}`;
        context.font = "600 10px system-ui, sans-serif";
        const width = context.measureText(label).width + 10;
        const x = rect.x + rect.width - width - 5;
        const y = rect.y + rect.height - 20;
        context.fillStyle = "rgba(3, 14, 18, 0.72)";
        context.fillRect(x, y, width, 15);
        context.fillStyle = "rgba(221, 249, 241, 0.88)";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, x + width / 2, y + 7.5);
    }

    private handlePointerDown = (event: PointerEvent): void => {
        event.stopPropagation();
    };

    private handleClick = (event: MouseEvent): void => {
        event.stopPropagation();
        if (event.button !== 0 || !this.raster || this.pending) return;
        const canvasBounds = this.canvas.getBoundingClientRect();
        const x = event.clientX - canvasBounds.left;
        const y = event.clientY - canvasBounds.top;
        const rect = this.contentRect;
        if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) return;
        const nx = (x - rect.x) / rect.width;
        const ny = (y - rect.y) / rect.height;
        const tile = {
            x: this.raster.originX + Math.min(this.raster.tileSpanX - 1, Math.floor(nx * this.raster.tileSpanX)),
            y: this.raster.originY + Math.min(this.raster.tileSpanY - 1, Math.floor(ny * this.raster.tileSpanY))
        };
        this.map.setCameraTargetTile(tile.x, tile.y);
        this.onNavigate?.(tile);
        this.render();
    };

    private handleWorldLoad = (): void => {
        this.clear();
        void this.refresh(true);
    };

    private handleFrame = (frame: { t?: number }): void => {
        const now = Number.isFinite(frame?.t) ? frame.t as number : performance.now();
        if (now - this.lastCoverageCheckAt >= 250) {
            this.lastCoverageCheckAt = now;
            const target = this.map.getCameraTargetTile();
            if (target && (!this.raster || !this.coversTarget(this.raster, target))) void this.refresh();
        }
        if (now - this.lastDrawAt >= this.redrawIntervalMs) {
            this.lastDrawAt = now;
            this.render();
        }
    };
}

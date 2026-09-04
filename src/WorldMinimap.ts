import type { HexMap } from "./HexMap";
import type { Point } from "./interfaces";
import { Vector3 } from "three";
import {
    MAX_WORLD_OVERVIEW_RASTER_SIZE,
    MAX_WORLD_OVERVIEW_TILE_SPAN,
    WorldOverviewPreparationOptions
} from "./world/generateWorldOverview";

export interface WorldMinimapOptions {
    map: HexMap;
    element: string | HTMLCanvasElement;
    rasterSize?: number;
    infiniteTileSpan?: number;
    cacheEntries?: number;
    redrawIntervalMs?: number;
    onNavigate?: (tile: Readonly<Point>) => void;
    onDestinationChange?: (tile: Readonly<Point> | undefined) => void;
    onExpandedChange?: (expanded: boolean) => void;
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
    readonly cachedPages: number;
    readonly demandedPages: number;
    readonly cachedDemandedPages: number;
    readonly pendingPages: number;
    readonly visiblePages: number;
    readonly expanded: boolean;
    readonly zoom: number;
    readonly destination?: Readonly<Point>;
}

interface ContentRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface MinimapViewport {
    centerX: number;
    centerY: number;
    tileSpanX: number;
    tileSpanY: number;
}

interface MinimapExtent {
    originX: number;
    originY: number;
    tileSpanX: number;
    tileSpanY: number;
}

interface MinimapZoomAnchor {
    worldX: number;
    worldY: number;
    normalizedX: number;
    normalizedY: number;
}

interface MinimapPan {
    pointerId: number;
    lastClientX: number;
    lastClientY: number;
}

interface PageLayout {
    tileSpan: number;
    pixelSize: number;
}

interface PageDemand {
    key: string;
    options: WorldOverviewPreparationOptions;
    visible: boolean;
    distance: number;
}

interface CachedPage {
    extent: WorldOverviewPreparationOptions;
    canvas: HTMLCanvasElement;
}

interface PendingPage {
    abort: AbortController;
    visible: boolean;
    promise: Promise<void>;
}

const DEFAULT_RASTER_SIZE = 192;
const DEFAULT_INFINITE_TILE_SPAN = 512;
const DEFAULT_CACHE_ENTRIES = 64;
const DEFAULT_REDRAW_INTERVAL_MS = 33;
const MIN_OVERVIEW_TILE_SPAN = 8;
const MIN_INFINITE_ZOOM_FACTOR = 0.125;
const MAX_INFINITE_ZOOM_FACTOR = 4;
const PAGE_PREFETCH_RINGS = 2;
const MAX_ACTIVE_PAGE_REQUESTS = 2;
const PAGE_DEMAND_INTERVAL_MS = 50;
const PAGE_DEMAND_PAN_THRESHOLD = 0.25;
const PREFETCH_PAGE_INTERVAL_MS = 100;
const PAGE_RETRY_DELAY_MS = 500;
const FOLLOW_TIME_CONSTANT_S = 0.16;
const ZOOM_TIME_CONSTANT_S = 0.1;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

function asPositiveInteger(name: string, value: number, maximum: number): number {
    if (!Number.isInteger(value) || value <= 0 || value > maximum) {
        throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
    }
    return value;
}

function abortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

function backpressureError(error: unknown): boolean {
    return error instanceof Error && error.name === "WorkQueueBackpressureError";
}

function isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
}

function rangesIntersect(firstOrigin: number, firstSpan: number, secondOrigin: number, secondSpan: number): boolean {
    return firstOrigin < secondOrigin + secondSpan && secondOrigin < firstOrigin + firstSpan;
}

// Canvas-only overview control. Static terrain is generated as bounded worker
// pages and retained in an LRU cache. Moving the viewport only composites those
// immutable pages; it never makes distant render chunks resident and never
// creates a second Three.js scene, renderer, or GPU terrain working set.
export class WorldMinimap {
    private readonly map: HexMap;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly rasterSize: number;
    private readonly infiniteTileSpan: number;
    private readonly cacheEntries: number;
    private readonly redrawIntervalMs: number;
    private readonly onNavigate: ((tile: Readonly<Point>) => void) | undefined;
    private readonly onDestinationChange: ((tile: Readonly<Point> | undefined) => void) | undefined;
    private readonly onExpandedChange: ((expanded: boolean) => void) | undefined;
    private readonly onError: ((error: Error) => void) | undefined;
    private readonly pageCache = new Map<string, CachedPage>();
    private readonly pageDemand = new Map<string, PageDemand>();
    private readonly pendingPages = new Map<string, PendingPage>();
    private readonly retryAfter = new Map<string, number>();
    private readonly resizeObserver: ResizeObserver | undefined;
    private readonly cameraDirection = new Vector3();
    private contentRect: ContentRect = { x: 0, y: 0, width: 0, height: 0 };
    private lastDrawAt = -Infinity;
    private lastDemandCheckAt = -Infinity;
    private lastDemandCenter: Point | undefined;
    private lastPrefetchStartedAt = -Infinity;
    private pageGeneration = 0;
    private expanded = false;
    private zoomFactor = 1;
    private targetZoomFactor = 1;
    private zoomAnchor: MinimapZoomAnchor | undefined;
    private pan: MinimapPan | undefined;
    private viewport: MinimapViewport | undefined;
    private destination: Point | undefined;
    private reportedPageError = false;
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
        this.cacheEntries = asPositiveInteger("cacheEntries", options.cacheEntries ?? DEFAULT_CACHE_ENTRIES, 512);
        this.redrawIntervalMs = options.redrawIntervalMs ?? DEFAULT_REDRAW_INTERVAL_MS;
        if (!Number.isFinite(this.redrawIntervalMs) || this.redrawIntervalMs <= 0) {
            throw new RangeError("redrawIntervalMs must be positive and finite");
        }
        this.onNavigate = options.onNavigate;
        this.onDestinationChange = options.onDestinationChange;
        this.onExpandedChange = options.onExpandedChange;
        this.onError = options.onError;

        this.canvas.addEventListener("pointerdown", this.handlePointerDown);
        this.canvas.addEventListener("pointermove", this.handlePointerMove);
        this.canvas.addEventListener("pointerup", this.handlePointerEnd);
        this.canvas.addEventListener("pointercancel", this.handlePointerEnd);
        this.canvas.addEventListener("lostpointercapture", this.handlePointerCaptureLost);
        this.canvas.addEventListener("contextmenu", this.handleContextMenu);
        this.canvas.addEventListener("click", this.handleClick);
        this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
        window.addEventListener("keydown", this.handleKeyDown);
        this.map.on("loadstart", this.handleWorldLoadStart);
        this.map.on("load", this.handleWorldLoad);
        this.map.on("frame", this.handleFrame);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.render());
            this.resizeObserver.observe(this.canvas);
        }
        this.canvas.dataset.expanded = "false";
        this.canvas.dataset.panning = "false";
        this.canvas.setAttribute("aria-expanded", "false");
        this.canvas.dataset.state = "empty";
        this.render();
        void this.refresh();
    }

    public get view(): Readonly<WorldMinimapView> {
        const extent = this.viewportExtent();
        const pixels = extent ? this.viewPixelSize(extent) : undefined;
        return {
            loading: this.hasMissingVisiblePages(),
            originX: extent?.originX,
            originY: extent?.originY,
            tileSpanX: extent?.tileSpanX,
            tileSpanY: extent?.tileSpanY,
            pixelWidth: pixels?.width,
            pixelHeight: pixels?.height,
            cachedPages: this.pageCache.size,
            demandedPages: this.pageDemand.size,
            cachedDemandedPages: [...this.pageDemand.keys()]
                .reduce((count, key) => count + Number(this.pageCache.has(key)), 0),
            pendingPages: this.pendingPages.size,
            visiblePages: this.visiblePageDemands().length,
            expanded: this.expanded,
            zoom: 1 / this.zoomFactor,
            destination: this.destination ? { ...this.destination } : undefined
        };
    }

    public get isExpanded(): boolean {
        return this.expanded;
    }

    public setExpanded(expanded: boolean): void {
        if (this.disposed || expanded === this.expanded) return;
        this.endPan();
        this.expanded = expanded;
        this.zoomFactor = 1;
        this.targetZoomFactor = 1;
        this.zoomAnchor = undefined;
        const cameraTarget = this.map.getCameraTargetTile();
        this.viewport = cameraTarget ? this.createViewport(cameraTarget) : undefined;
        this.setDestination(expanded && cameraTarget ? cameraTarget : undefined);
        this.canvas.dataset.expanded = String(expanded);
        this.canvas.setAttribute("aria-expanded", String(expanded));
        this.onExpandedChange?.(expanded);
        void this.refresh();
        this.render();
    }

    public toggleExpanded(): void {
        this.setExpanded(!this.expanded);
    }

    public refresh(force = false): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("WorldMinimap has been disposed"));
        const cameraTarget = this.map.getCameraTargetTile();
        if (!cameraTarget) {
            this.updateCanvasState();
            this.render();
            return Promise.resolve();
        }
        if (force) this.resetPageData();
        this.viewport ??= this.createViewport(cameraTarget);
        this.rebuildPageDemand();
        this.pumpPageRequests();
        this.updateCanvasState();
        this.render();
        return this.waitForVisiblePages(this.pageGeneration);
    }

    public clear(): void {
        if (this.disposed) return;
        this.endPan();
        this.resetPageData();
        const wasExpanded = this.expanded;
        this.expanded = false;
        this.zoomFactor = 1;
        this.targetZoomFactor = 1;
        this.zoomAnchor = undefined;
        this.viewport = undefined;
        this.setDestination(undefined);
        this.canvas.setAttribute("aria-busy", "false");
        this.canvas.dataset.state = "empty";
        this.canvas.dataset.expanded = "false";
        this.canvas.setAttribute("aria-expanded", "false");
        if (wasExpanded) this.onExpandedChange?.(false);
        this.render();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.clear();
        this.disposed = true;
        this.resizeObserver?.disconnect();
        this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
        this.canvas.removeEventListener("pointermove", this.handlePointerMove);
        this.canvas.removeEventListener("pointerup", this.handlePointerEnd);
        this.canvas.removeEventListener("pointercancel", this.handlePointerEnd);
        this.canvas.removeEventListener("lostpointercapture", this.handlePointerCaptureLost);
        this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
        this.canvas.removeEventListener("click", this.handleClick);
        this.canvas.removeEventListener("wheel", this.handleWheel);
        window.removeEventListener("keydown", this.handleKeyDown);
        this.map.off("loadstart", this.handleWorldLoadStart);
        this.map.off("load", this.handleWorldLoad);
        this.map.off("frame", this.handleFrame);
    }

    private viewSpans(): { tileSpanX: number; tileSpanY: number } | undefined {
        const bounds = this.map.worldBounds;
        if (bounds) {
            this.zoomFactor = this.clampZoomFactor(this.zoomFactor);
            return {
                tileSpanX: Math.min(bounds.width, Math.max(1, bounds.width * this.zoomFactor)),
                tileSpanY: Math.min(bounds.height, Math.max(1, bounds.height * this.zoomFactor))
            };
        }
        if (this.map.worldDescriptor?.topology !== "infinite") return undefined;
        this.zoomFactor = this.clampZoomFactor(this.zoomFactor);
        const tileSpan = Math.max(1, this.infiniteTileSpan * this.zoomFactor);
        return { tileSpanX: tileSpan, tileSpanY: tileSpan };
    }

    private clampZoomFactor(value: number): number {
        const bounds = this.map.worldBounds;
        if (bounds) {
            const minimum = Math.min(1, Math.max(
                Math.min(1, MIN_OVERVIEW_TILE_SPAN / bounds.width),
                Math.min(1, MIN_OVERVIEW_TILE_SPAN / bounds.height)
            ));
            return Math.max(minimum, Math.min(1, value));
        }
        const maximum = Math.min(
            MAX_INFINITE_ZOOM_FACTOR,
            MAX_WORLD_OVERVIEW_TILE_SPAN * 2 / this.infiniteTileSpan
        );
        return Math.max(MIN_INFINITE_ZOOM_FACTOR, Math.min(maximum, value));
    }

    private createViewport(center: Readonly<Point>): MinimapViewport {
        const spans = this.viewSpans();
        if (!spans) throw new Error("The active world does not expose minimap bounds");
        const viewport = { centerX: center.x + 0.5, centerY: center.y + 0.5, ...spans };
        this.clampViewport(viewport);
        return viewport;
    }

    private clampViewport(viewport: MinimapViewport): void {
        const bounds = this.map.worldBounds;
        if (!bounds) return;
        viewport.centerX = Math.max(
            viewport.tileSpanX / 2,
            Math.min(bounds.width - viewport.tileSpanX / 2, viewport.centerX)
        );
        viewport.centerY = Math.max(
            viewport.tileSpanY / 2,
            Math.min(bounds.height - viewport.tileSpanY / 2, viewport.centerY)
        );
    }

    private viewportExtent(): MinimapExtent | undefined {
        const viewport = this.viewport;
        if (!viewport) return undefined;
        return {
            originX: viewport.centerX - viewport.tileSpanX / 2,
            originY: viewport.centerY - viewport.tileSpanY / 2,
            tileSpanX: viewport.tileSpanX,
            tileSpanY: viewport.tileSpanY
        };
    }

    private viewPixelSize(extent: MinimapExtent): { width: number; height: number } {
        const aspect = extent.tileSpanX / extent.tileSpanY;
        const targetSize = this.rasterSize * (this.expanded ? 2 : 1);
        return aspect >= 1
            ? { width: targetSize, height: Math.max(1, Math.round(targetSize / aspect)) }
            : { width: Math.max(1, Math.round(targetSize * aspect)), height: targetSize };
    }

    private pageLayout(): PageLayout | undefined {
        const viewport = this.viewport;
        if (!viewport) return undefined;
        const maximumViewSpan = Math.max(viewport.tileSpanX, viewport.tileSpanY);
        const targetTileSpan = Math.max(1, maximumViewSpan / 2);
        const powerOfTwoSpan = 2 ** Math.ceil(Math.log2(targetTileSpan));
        const tileSpan = Math.min(MAX_WORLD_OVERVIEW_TILE_SPAN, Math.max(1, powerOfTwoSpan));
        const pixelSize = Math.min(MAX_WORLD_OVERVIEW_RASTER_SIZE, Math.max(
            16,
            Math.round(this.rasterSize * (this.expanded ? 1 : 0.5))
        ));
        return { tileSpan, pixelSize };
    }

    private pageOptions(pageX: number, pageY: number, layout: PageLayout): WorldOverviewPreparationOptions | undefined {
        let originX = pageX * layout.tileSpan;
        let originY = pageY * layout.tileSpan;
        let tileSpanX = layout.tileSpan;
        let tileSpanY = layout.tileSpan;
        const bounds = this.map.worldBounds;
        if (bounds) {
            const endX = Math.min(bounds.width, originX + tileSpanX);
            const endY = Math.min(bounds.height, originY + tileSpanY);
            originX = Math.max(0, originX);
            originY = Math.max(0, originY);
            tileSpanX = endX - originX;
            tileSpanY = endY - originY;
            if (tileSpanX <= 0 || tileSpanY <= 0) return undefined;
        }
        return {
            originX,
            originY,
            tileSpanX,
            tileSpanY,
            pixelWidth: Math.max(1, Math.round(layout.pixelSize * tileSpanX / layout.tileSpan)),
            pixelHeight: Math.max(1, Math.round(layout.pixelSize * tileSpanY / layout.tileSpan))
        };
    }

    private cacheKey(options: WorldOverviewPreparationOptions): string {
        return [options.originX, options.originY, options.tileSpanX, options.tileSpanY,
            options.pixelWidth, options.pixelHeight].join(":");
    }

    private rebuildPageDemand(): void {
        const extent = this.viewportExtent();
        const layout = this.pageLayout();
        if (!extent || !layout) {
            this.lastDemandCenter = undefined;
            this.pageDemand.clear();
            this.cancelUndemandedPages();
            return;
        }
        this.lastDemandCenter = {
            x: this.viewport!.centerX,
            y: this.viewport!.centerY
        };
        const epsilon = Number.EPSILON * Math.max(1, layout.tileSpan);
        const visibleMinX = Math.floor(extent.originX / layout.tileSpan);
        const visibleMaxX = Math.floor((extent.originX + extent.tileSpanX - epsilon) / layout.tileSpan);
        const visibleMinY = Math.floor(extent.originY / layout.tileSpan);
        const visibleMaxY = Math.floor((extent.originY + extent.tileSpanY - epsilon) / layout.tileSpan);
        const next = new Map<string, PageDemand>();
        for (let pageY = visibleMinY - PAGE_PREFETCH_RINGS; pageY <= visibleMaxY + PAGE_PREFETCH_RINGS; pageY += 1) {
            for (let pageX = visibleMinX - PAGE_PREFETCH_RINGS; pageX <= visibleMaxX + PAGE_PREFETCH_RINGS; pageX += 1) {
                const options = this.pageOptions(pageX, pageY, layout);
                if (!options) continue;
                const visible = pageX >= visibleMinX && pageX <= visibleMaxX
                    && pageY >= visibleMinY && pageY <= visibleMaxY;
                const pageCenterX = options.originX + options.tileSpanX / 2;
                const pageCenterY = options.originY + options.tileSpanY / 2;
                const distance = Math.hypot(
                    (pageCenterX - this.viewport!.centerX) / layout.tileSpan,
                    (pageCenterY - this.viewport!.centerY) / layout.tileSpan
                );
                const key = this.cacheKey(options);
                next.set(key, { key, options, visible, distance });
            }
        }
        this.pageDemand.clear();
        for (const [key, demand] of next) this.pageDemand.set(key, demand);
        for (const key of this.retryAfter.keys()) if (!next.has(key)) this.retryAfter.delete(key);
        this.cancelUndemandedPages();
    }

    private cancelUndemandedPages(): void {
        for (const [key, pending] of this.pendingPages) {
            const demand = this.pageDemand.get(key);
            if (demand && (!demand.visible || pending.visible)) continue;
            pending.abort.abort();
            this.pendingPages.delete(key);
        }
    }

    private pumpPageRequests(): void {
        if (this.disposed || !this.viewport) return;
        const now = performance.now();
        while (this.pendingPages.size < MAX_ACTIVE_PAGE_REQUESTS) {
            const candidates = [...this.pageDemand.values()]
                .filter(candidate => !this.pageCache.has(candidate.key)
                    && !this.pendingPages.has(candidate.key)
                    && (this.retryAfter.get(candidate.key) ?? -Infinity) <= now)
                .sort((first, second) => Number(second.visible) - Number(first.visible)
                    || first.distance - second.distance
                    || first.key.localeCompare(second.key));
            if (this.hasMissingVisiblePages()) {
                const visible = candidates.find(candidate => candidate.visible);
                if (!visible) break;
                this.requestPage(visible);
                continue;
            }
            const prefetch = candidates.find(candidate => !candidate.visible);
            if (!prefetch
                || [...this.pendingPages.values()].some(pending => !pending.visible)
                || now - this.lastPrefetchStartedAt < PREFETCH_PAGE_INTERVAL_MS) break;
            this.lastPrefetchStartedAt = now;
            this.requestPage(prefetch);
            break;
        }
    }

    private requestPage(demand: PageDemand): void {
        const generation = this.pageGeneration;
        const abort = new AbortController();
        let record: PendingPage;
        const promise = this.map.requestWorldOverview(demand.options, {
            signal: abort.signal,
            lane: demand.visible ? "prefetch" : "background",
            priority: demand.distance
        }).then(raster => {
            if (this.disposed || abort.signal.aborted || generation !== this.pageGeneration) return;
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = raster.pixelWidth;
            pageCanvas.height = raster.pixelHeight;
            const context = pageCanvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("WorldMinimap could not allocate a page canvas");
            const image = context.createImageData(raster.pixelWidth, raster.pixelHeight);
            image.data.set(raster.pixels);
            context.putImageData(image, 0, 0);
            this.storePage(demand.key, {
                extent: {
                    originX: raster.originX,
                    originY: raster.originY,
                    tileSpanX: raster.tileSpanX,
                    tileSpanY: raster.tileSpanY,
                    pixelWidth: raster.pixelWidth,
                    pixelHeight: raster.pixelHeight
                },
                canvas: pageCanvas
            });
            this.retryAfter.delete(demand.key);
        }).catch(reason => {
            if (abortError(reason) || this.disposed || abort.signal.aborted || generation !== this.pageGeneration) return;
            this.retryAfter.set(demand.key, performance.now() + PAGE_RETRY_DELAY_MS);
            if (!backpressureError(reason) && !this.reportedPageError) {
                this.reportedPageError = true;
                this.onError?.(reason instanceof Error ? reason : new Error(String(reason)));
            }
        }).finally(() => {
            if (this.pendingPages.get(demand.key) !== record) return;
            this.pendingPages.delete(demand.key);
            this.updateCanvasState();
            this.render();
            this.pumpPageRequests();
        });
        record = { abort, visible: demand.visible, promise };
        this.pendingPages.set(demand.key, record);
    }

    private storePage(key: string, page: CachedPage): void {
        const previous = this.pageCache.get(key);
        if (previous) previous.canvas.width = previous.canvas.height = 0;
        this.pageCache.delete(key);
        this.pageCache.set(key, page);
        while (this.pageCache.size > this.cacheEntries) {
            const evictable = [...this.pageCache.keys()].find(candidate => !this.pageDemand.has(candidate))
                ?? this.pageCache.keys().next().value as string | undefined;
            if (evictable === undefined) break;
            const evicted = this.pageCache.get(evictable);
            if (evicted) evicted.canvas.width = evicted.canvas.height = 0;
            this.pageCache.delete(evictable);
        }
    }

    private touchPage(key: string, page: CachedPage): void {
        this.pageCache.delete(key);
        this.pageCache.set(key, page);
    }

    private resetPageData(): void {
        this.pageGeneration += 1;
        for (const pending of this.pendingPages.values()) pending.abort.abort();
        this.pendingPages.clear();
        this.pageDemand.clear();
        this.retryAfter.clear();
        this.lastPrefetchStartedAt = -Infinity;
        for (const page of this.pageCache.values()) page.canvas.width = page.canvas.height = 0;
        this.pageCache.clear();
        this.reportedPageError = false;
        this.lastDemandCenter = undefined;
    }

    private refreshPageDemand(now: number): void {
        this.lastDemandCheckAt = now;
        this.rebuildPageDemand();
        this.pumpPageRequests();
        this.updateCanvasState();
    }

    private panDemandThresholdExceeded(): boolean {
        const viewport = this.viewport;
        const center = this.lastDemandCenter;
        const layout = this.pageLayout();
        if (!viewport || !center || !layout) return true;
        return Math.hypot(viewport.centerX - center.x, viewport.centerY - center.y)
            >= layout.tileSpan * PAGE_DEMAND_PAN_THRESHOLD;
    }

    private visiblePageDemands(): PageDemand[] {
        return [...this.pageDemand.values()].filter(demand => demand.visible);
    }

    private hasMissingVisiblePages(): boolean {
        const visible = this.visiblePageDemands();
        return visible.length > 0 && visible.some(demand => !this.pageCache.has(demand.key));
    }

    private updateCanvasState(): void {
        const visible = this.visiblePageDemands();
        if (!this.viewport || visible.length === 0) {
            this.canvas.dataset.state = "empty";
            this.canvas.setAttribute("aria-busy", "false");
            return;
        }
        const cached = visible.reduce((count, demand) => count + Number(this.pageCache.has(demand.key)), 0);
        const missing = cached < visible.length;
        this.canvas.dataset.state = missing ? (cached === 0 ? "loading" : "streaming") : "ready";
        this.canvas.setAttribute("aria-busy", String(missing));
    }

    private waitForVisiblePages(generation: number): Promise<void> {
        if (this.disposed || generation !== this.pageGeneration || !this.hasMissingVisiblePages()) return Promise.resolve();
        const active = this.visiblePageDemands()
            .map(demand => this.pendingPages.get(demand.key)?.promise)
            .filter((promise): promise is Promise<void> => Boolean(promise));
        if (active.length === 0) return Promise.resolve();
        return Promise.race(active).then(() => this.waitForVisiblePages(generation));
    }

    private updateViewportFollow(target: Readonly<Point>, dtS: number): boolean {
        if (this.expanded) return false;
        const spans = this.viewSpans();
        if (!spans) return false;
        if (!this.viewport || this.viewport.tileSpanX !== spans.tileSpanX || this.viewport.tileSpanY !== spans.tileSpanY) {
            this.viewport = this.createViewport(target);
            return true;
        }
        const viewport = this.viewport;
        const targetX = target.x + 0.5;
        const targetY = target.y + 0.5;
        const deadHalfX = viewport.tileSpanX * 0.25;
        const deadHalfY = viewport.tileSpanY * 0.25;
        let desiredX = viewport.centerX;
        let desiredY = viewport.centerY;
        if (targetX < viewport.centerX - deadHalfX) desiredX = targetX + deadHalfX;
        else if (targetX > viewport.centerX + deadHalfX) desiredX = targetX - deadHalfX;
        if (targetY < viewport.centerY - deadHalfY) desiredY = targetY + deadHalfY;
        else if (targetY > viewport.centerY + deadHalfY) desiredY = targetY - deadHalfY;
        if (desiredX === viewport.centerX && desiredY === viewport.centerY) return false;
        const alpha = dtS > 0 ? 1 - Math.exp(-Math.min(dtS, 0.1) / FOLLOW_TIME_CONSTANT_S) : 0;
        if (alpha <= 0) return false;
        const previousX = viewport.centerX;
        const previousY = viewport.centerY;
        viewport.centerX += (desiredX - viewport.centerX) * alpha;
        viewport.centerY += (desiredY - viewport.centerY) * alpha;
        if (Math.abs(desiredX - viewport.centerX) < 0.001) viewport.centerX = desiredX;
        if (Math.abs(desiredY - viewport.centerY) < 0.001) viewport.centerY = desiredY;
        this.clampViewport(viewport);
        return viewport.centerX !== previousX || viewport.centerY !== previousY;
    }

    private updateExpandedZoom(dtS: number): boolean {
        const viewport = this.viewport;
        if (!this.expanded || !viewport || dtS <= 0 || this.zoomFactor === this.targetZoomFactor) return false;
        const previousFactor = this.zoomFactor;
        const alpha = 1 - Math.exp(-Math.min(dtS, 0.1) / ZOOM_TIME_CONSTANT_S);
        this.zoomFactor += (this.targetZoomFactor - this.zoomFactor) * alpha;
        if (Math.abs(this.targetZoomFactor - this.zoomFactor) < 0.0001) this.zoomFactor = this.targetZoomFactor;
        this.zoomFactor = this.clampZoomFactor(this.zoomFactor);
        const spans = this.viewSpans();
        if (!spans) return false;
        viewport.tileSpanX = spans.tileSpanX;
        viewport.tileSpanY = spans.tileSpanY;
        const anchor = this.zoomAnchor;
        if (anchor) {
            viewport.centerX = anchor.worldX - (anchor.normalizedX - 0.5) * viewport.tileSpanX;
            viewport.centerY = anchor.worldY - (anchor.normalizedY - 0.5) * viewport.tileSpanY;
        }
        this.clampViewport(viewport);
        return this.zoomFactor !== previousFactor;
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

        const extent = this.viewportExtent();
        const padding = 6;
        const availableWidth = Math.max(1, width - padding * 2);
        const availableHeight = Math.max(1, height - padding * 2);
        const aspect = extent ? extent.tileSpanX / extent.tileSpanY : 1;
        let contentWidth = availableWidth;
        let contentHeight = contentWidth / aspect;
        if (contentHeight > availableHeight) {
            contentHeight = availableHeight;
            contentWidth = contentHeight * aspect;
        }
        this.contentRect = {
            x: (width - contentWidth) / 2,
            y: (height - contentHeight) / 2,
            width: contentWidth,
            height: contentHeight
        };
        const rect = this.contentRect;
        context.fillStyle = "rgba(93, 143, 139, 0.16)";
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        const pagesDrawn = extent ? this.drawPages(context, rect, extent) : 0;
        if (extent) {
            this.drawCameraOverlay(context, rect, extent);
            this.drawDestination(context, rect, extent);
            this.drawPosition(context, rect);
        }
        context.strokeStyle = "rgba(124, 235, 211, 0.42)";
        context.lineWidth = 1;
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
        if (pagesDrawn === 0 && this.hasMissingVisiblePages()) {
            context.fillStyle = "#9debd8";
            context.font = "600 18px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("...", rect.x + rect.width / 2, rect.y + rect.height / 2);
        }
    }

    private drawPages(context: CanvasRenderingContext2D, rect: ContentRect, extent: MinimapExtent): number {
        let drawn = 0;
        context.save();
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
        context.clip();
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        const visibleKeys = new Set(this.visiblePageDemands().map(demand => demand.key));
        const pages = [...this.pageCache.entries()]
            .filter(([, page]) => rangesIntersect(
                extent.originX,
                extent.tileSpanX,
                page.extent.originX,
                page.extent.tileSpanX
            ) && rangesIntersect(
                extent.originY,
                extent.tileSpanY,
                page.extent.originY,
                page.extent.tileSpanY
            ))
            // Coarser cached levels are a temporary underlay while a new zoom
            // level streams in. Current-level pages land last and replace them
            // without exposing empty rectangles or changing logical position.
            .sort(([firstKey, first], [secondKey, second]) => {
                const firstDensity = first.extent.tileSpanX / first.extent.pixelWidth;
                const secondDensity = second.extent.tileSpanX / second.extent.pixelWidth;
                return secondDensity - firstDensity
                    || Number(visibleKeys.has(firstKey)) - Number(visibleKeys.has(secondKey));
            });
        for (const [key, page] of pages) {
            const pageExtent = page.extent;
            const x = rect.x + (pageExtent.originX - extent.originX) / extent.tileSpanX * rect.width;
            const y = rect.y + (pageExtent.originY - extent.originY) / extent.tileSpanY * rect.height;
            const pageWidth = pageExtent.tileSpanX / extent.tileSpanX * rect.width;
            const pageHeight = pageExtent.tileSpanY / extent.tileSpanY * rect.height;
            context.drawImage(page.canvas, x, y, pageWidth, pageHeight);
            if (visibleKeys.has(key)) this.touchPage(key, page);
            drawn += 1;
        }
        context.restore();
        return drawn;
    }

    private drawCameraOverlay(context: CanvasRenderingContext2D, rect: ContentRect, extent: MinimapExtent): void {
        const target = this.map.getCameraTargetTile();
        if (!target) return;
        const x = rect.x + (target.x + 0.5 - extent.originX) / extent.tileSpanX * rect.width;
        const y = rect.y + (target.y + 0.5 - extent.originY) / extent.tileSpanY * rect.height;
        const tileRadiusX = this.map.worldViewDistance / (this.map.size * 1.5);
        const tileRadiusY = this.map.worldViewDistance / (this.map.size * Math.sqrt(3));
        const radiusX = Math.max(4, tileRadiusX / extent.tileSpanX * rect.width);
        const radiusY = Math.max(4, tileRadiusY / extent.tileSpanY * rect.height);

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
        this.map.getCamera().getWorldDirection(this.cameraDirection);
        const horizontalLength = Math.hypot(this.cameraDirection.x, this.cameraDirection.z);
        const heading = horizontalLength > 1e-6
            ? Math.atan2(this.cameraDirection.z, this.cameraDirection.x) + Math.PI / 2
            : 0;
        context.translate(x, y);
        context.rotate(heading);
        context.beginPath();
        context.moveTo(0, -7);
        context.lineTo(5, 5);
        context.lineTo(0, 3);
        context.lineTo(-5, 5);
        context.closePath();
        context.fillStyle = "#dffff7";
        context.fill();
        context.strokeStyle = "#123f3b";
        context.lineWidth = 1.5;
        context.lineJoin = "round";
        context.stroke();
        context.restore();
    }

    private drawPosition(context: CanvasRenderingContext2D, rect: ContentRect): void {
        const target = this.expanded && this.destination ? this.destination : this.map.getCameraTargetTile();
        if (!target) return;
        const label = `${this.expanded ? "T " : ""}${target.x}, ${target.y}`;
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

    private drawDestination(context: CanvasRenderingContext2D, rect: ContentRect, extent: MinimapExtent): void {
        if (!this.expanded || !this.destination) return;
        const x = rect.x + (this.destination.x + 0.5 - extent.originX) / extent.tileSpanX * rect.width;
        const y = rect.y + (this.destination.y + 0.5 - extent.originY) / extent.tileSpanY * rect.height;
        if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return;
        context.save();
        context.translate(x, y);
        context.rotate(Math.PI / 4);
        context.fillStyle = "#ffca67";
        context.strokeStyle = "rgba(52, 27, 3, 0.9)";
        context.lineWidth = 2;
        context.fillRect(-5, -5, 10, 10);
        context.strokeRect(-5, -5, 10, 10);
        context.restore();
    }

    private setDestination(tile: Readonly<Point> | undefined): void {
        if (this.destination?.x === tile?.x && this.destination?.y === tile?.y) return;
        this.destination = tile ? { x: tile.x, y: tile.y } : undefined;
        this.onDestinationChange?.(this.destination ? { ...this.destination } : undefined);
    }

    private coordinateAt(clientX: number, clientY: number): MinimapZoomAnchor | undefined {
        const extent = this.viewportExtent();
        if (!extent) return undefined;
        const canvasBounds = this.canvas.getBoundingClientRect();
        const x = clientX - canvasBounds.left;
        const y = clientY - canvasBounds.top;
        const rect = this.contentRect;
        if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) return undefined;
        const normalizedX = (x - rect.x) / rect.width;
        const normalizedY = (y - rect.y) / rect.height;
        return {
            worldX: extent.originX + normalizedX * extent.tileSpanX,
            worldY: extent.originY + normalizedY * extent.tileSpanY,
            normalizedX,
            normalizedY
        };
    }

    private tileAt(clientX: number, clientY: number): Point | undefined {
        const coordinate = this.coordinateAt(clientX, clientY);
        if (!coordinate) return undefined;
        const tile = {
            x: Math.floor(coordinate.worldX),
            y: Math.floor(coordinate.worldY)
        };
        const bounds = this.map.worldBounds;
        if (bounds) {
            tile.x = Math.max(0, Math.min(bounds.width - 1, tile.x));
            tile.y = Math.max(0, Math.min(bounds.height - 1, tile.y));
        }
        return tile;
    }

    private teleportToDestination(): void {
        if (!this.expanded || !this.destination) return;
        const destination = { ...this.destination };
        this.map.setCameraTargetTile(destination.x, destination.y);
        this.onNavigate?.(destination);
        this.setExpanded(false);
    }

    private stopZoomAnimation(): void {
        this.targetZoomFactor = this.zoomFactor;
        this.zoomAnchor = undefined;
    }

    private recenterViewport(): void {
        const cameraTarget = this.map.getCameraTargetTile();
        if (!this.expanded || !cameraTarget) return;
        this.endPan();
        this.stopZoomAnimation();
        this.viewport = this.createViewport(cameraTarget);
        void this.refresh();
    }

    private endPan(pointerId?: number): void {
        const pan = this.pan;
        if (!pan || (pointerId !== undefined && pan.pointerId !== pointerId)) return;
        this.pan = undefined;
        this.canvas.dataset.panning = "false";
        if (this.canvas.hasPointerCapture(pan.pointerId)) {
            this.canvas.releasePointerCapture(pan.pointerId);
        }
    }

    private handlePointerDown = (event: PointerEvent): void => {
        event.stopPropagation();
        if (!this.expanded || event.button !== 2 || !this.viewport
            || !this.coordinateAt(event.clientX, event.clientY)) return;
        event.preventDefault();
        this.stopZoomAnimation();
        this.pan = {
            pointerId: event.pointerId,
            lastClientX: event.clientX,
            lastClientY: event.clientY
        };
        this.canvas.dataset.panning = "true";
        this.canvas.setPointerCapture(event.pointerId);
    };

    private handlePointerMove = (event: PointerEvent): void => {
        const pan = this.pan;
        const viewport = this.viewport;
        if (!pan || pan.pointerId !== event.pointerId || !viewport) return;
        event.preventDefault();
        event.stopPropagation();
        if ((event.buttons & 2) === 0) {
            this.endPan(event.pointerId);
            return;
        }
        const deltaX = event.clientX - pan.lastClientX;
        const deltaY = event.clientY - pan.lastClientY;
        pan.lastClientX = event.clientX;
        pan.lastClientY = event.clientY;
        if (deltaX === 0 && deltaY === 0) return;
        viewport.centerX -= deltaX / this.contentRect.width * viewport.tileSpanX;
        viewport.centerY -= deltaY / this.contentRect.height * viewport.tileSpanY;
        this.clampViewport(viewport);
        if (this.panDemandThresholdExceeded()) this.refreshPageDemand(performance.now());
        this.render();
    };

    private handlePointerEnd = (event: PointerEvent): void => {
        if (this.pan?.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        this.endPan(event.pointerId);
        this.refreshPageDemand(performance.now());
    };

    private handlePointerCaptureLost = (event: PointerEvent): void => {
        if (this.pan?.pointerId !== event.pointerId) return;
        this.pan = undefined;
        this.canvas.dataset.panning = "false";
        this.refreshPageDemand(performance.now());
    };

    private handleContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
    };

    private handleClick = (event: MouseEvent): void => {
        event.stopPropagation();
        if (event.button !== 0) return;
        const tile = this.tileAt(event.clientX, event.clientY);
        if (!tile) return;
        if (!this.expanded) this.setExpanded(true);
        this.setDestination(tile);
        this.render();
    };

    private handleWheel = (event: WheelEvent): void => {
        if (!this.expanded || event.deltaY === 0) return;
        const anchor = this.coordinateAt(event.clientX, event.clientY);
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 100 : 1;
        const normalizedDelta = Math.max(-240, Math.min(240, event.deltaY * deltaScale));
        const next = this.clampZoomFactor(
            this.targetZoomFactor * Math.exp(normalizedDelta * WHEEL_ZOOM_SENSITIVITY)
        );
        if (next === this.targetZoomFactor) return;
        this.targetZoomFactor = next;
        this.zoomAnchor = anchor;
    };

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
        if (event.code === "KeyM") {
            if (event.repeat || !this.map.getCameraTargetTile()) return;
            event.preventDefault();
            this.toggleExpanded();
        } else if (event.code === "KeyT" && this.expanded) {
            if (event.repeat) return;
            event.preventDefault();
            this.teleportToDestination();
        } else if (event.code === "Space" && this.expanded) {
            if (event.repeat) return;
            event.preventDefault();
            this.recenterViewport();
        } else if (event.code === "Escape" && this.expanded) {
            event.preventDefault();
            this.setExpanded(false);
        }
    };

    private handleWorldLoadStart = (): void => {
        this.clear();
    };

    private handleWorldLoad = (): void => {
        void this.refresh(true);
    };

    private handleFrame = (frame: { t?: number; dtS?: number }): void => {
        const now = Number.isFinite(frame?.t) ? frame.t as number : performance.now();
        const dtS = Number.isFinite(frame?.dtS) ? Math.max(0, frame.dtS as number) : 0;
        const cameraTarget = this.map.getCameraTargetTile();
        const followed = cameraTarget ? this.updateViewportFollow(cameraTarget, dtS) : false;
        const zoomed = this.updateExpandedZoom(dtS);
        if (followed || zoomed || (!this.pan && now - this.lastDemandCheckAt >= PAGE_DEMAND_INTERVAL_MS)) {
            this.refreshPageDemand(now);
        }
        if (now - this.lastDrawAt >= this.redrawIntervalMs) {
            this.lastDrawAt = now;
            this.render();
        }
    };
}

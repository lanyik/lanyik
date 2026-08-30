export const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"]);

export const DEFAULT_MESSAGES = Object.freeze({
    en: Object.freeze({
        "app.title": "Procedural Hex World · Surface v2",
        "panel.language": "Language",
        "panel.world": "World generation",
        "panel.terrain": "Terrain",
        "panel.water": "Water & coast",
        "panel.vegetation": "Vegetation",
        "panel.open": "Open Controls",
        "panel.close": "Close Controls",
        "performance.title": "Performance monitor",
        "performance.fps": "Frame rate",
        "performance.frameTime": "Frame time",
        "performance.memory": "Memory",
        "performance.drawCalls": "Draw calls",
        "performance.triangles": "Triangles",
        "performance.visibleChunks": "Mounted chunks",
        "performance.residentChunks": "Compiled cache",
        "performance.lod": "LOD 0 / 1 / 2",
        "performance.sourceChunks": "Authority / queued",
        "performance.cache": "Cache hits / misses",
        "performance.cachedChunks": "Cached chunks",
        "performance.cacheStorage": "Cache storage",
        "performance.backend": "Renderer",
        "performance.unit.fps": "FPS",
        "performance.unit.frameTime": "ms",
        "performance.unit.memory": "MB",
        "performance.unavailable": "Unavailable",
        "control.worldMode": "world mode",
        "worldMode.finite": "Finite toroidal",
        "worldMode.infinite": "Infinite world",
        "control.seed": "seed",
        "control.width": "width",
        "control.height": "height",
        "control.initialX": "start x",
        "control.initialY": "start y",
        "control.generate": "Generate world",
        "control.grid": "grid",
        "control.terrainDetail": "surface detail",
        "control.waveHeight": "wave height",
        "control.waveSpeed": "wave speed",
        "control.foam": "foam",
        "control.trees": "trees",
        "control.grass": "grass",
        "control.wind": "wind",
        "status.initializing": "Initializing world…",
        "status.generating": "Generating world…",
        "status.generated": "World generated",
        "status.failed": "Generation failed",
        "status.worldDetail": "{width} × {height} · four-way wrap · seed {seed}",
        "status.infiniteDetail": "infinite streamed world · seed {seed}",
        "status.controlsHint": "WASD move · Left click select · Right drag orbit · Wheel zoom",
        "status.tile": "Tile {x}, {y}",
        "status.selected": "Selected {x}, {y}",
        "status.surface": "{surface} · elevation {height}",
        "surface.ground": "ground",
        "surface.water": "water"
    }),
    "zh-CN": Object.freeze({
        "app.title": "程序化六边形世界 · Surface v2",
        "panel.language": "语言",
        "panel.world": "世界生成",
        "panel.terrain": "地形",
        "panel.water": "水面与海岸",
        "panel.vegetation": "植被",
        "panel.open": "打开控制面板",
        "panel.close": "关闭控制面板",
        "performance.title": "性能监控",
        "performance.fps": "帧率",
        "performance.frameTime": "帧耗时",
        "performance.memory": "内存",
        "performance.drawCalls": "绘制调用",
        "performance.triangles": "三角形",
        "performance.visibleChunks": "已挂载区块",
        "performance.residentChunks": "编译缓存",
        "performance.lod": "LOD 0 / 1 / 2",
        "performance.sourceChunks": "权威数据 / 等待",
        "performance.cache": "缓存命中 / 未命中",
        "performance.cachedChunks": "缓存区块",
        "performance.cacheStorage": "缓存占用",
        "performance.backend": "渲染器",
        "performance.unit.fps": "帧/秒",
        "performance.unit.frameTime": "毫秒",
        "performance.unit.memory": "MB",
        "performance.unavailable": "不可用",
        "control.worldMode": "世界模式",
        "worldMode.finite": "有限环形世界",
        "worldMode.infinite": "无限世界",
        "control.seed": "种子",
        "control.width": "宽度",
        "control.height": "高度",
        "control.initialX": "起点 X",
        "control.initialY": "起点 Y",
        "control.generate": "生成世界",
        "control.grid": "网格",
        "control.terrainDetail": "地表细节",
        "control.waveHeight": "波浪高度",
        "control.waveSpeed": "波浪速度",
        "control.foam": "浪花",
        "control.trees": "树木",
        "control.grass": "草地",
        "control.wind": "风力",
        "status.initializing": "正在初始化世界…",
        "status.generating": "正在生成世界…",
        "status.generated": "世界已生成",
        "status.failed": "生成失败",
        "status.worldDetail": "{width} × {height} · 四向循环 · 种子 {seed}",
        "status.infiniteDetail": "无限流式世界 · 种子 {seed}",
        "status.controlsHint": "WASD 移动 · 左键选择 · 右键环绕观察 · 滚轮缩放",
        "status.tile": "格子 {x}, {y}",
        "status.selected": "已选择 {x}, {y}",
        "status.surface": "{surface} · 高程 {height}",
        "surface.ground": "地面",
        "surface.water": "水面"
    })
});

export function resolveLocale(locale) {
    const normalized = String(locale ?? "").trim().toLowerCase();
    return normalized === "zh" || normalized.startsWith("zh-") ? "zh-CN" : "en";
}

function interpolate(message, parameters) {
    return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key) => {
        const value = parameters[key];
        return value === undefined || value === null ? token : String(value);
    });
}

export function createI18n({ locale = "en", messages = DEFAULT_MESSAGES } = {}) {
    let activeLocale = resolveLocale(locale);
    const listeners = new Set();
    return {
        get locale() { return activeLocale; },
        t(key, parameters = {}) {
            const message = messages[activeLocale]?.[key] ?? messages.en?.[key] ?? key;
            return interpolate(String(message), parameters);
        },
        setLocale(localeValue) {
            const resolved = resolveLocale(localeValue);
            if (resolved === activeLocale) return activeLocale;
            activeLocale = resolved;
            listeners.forEach(listener => listener(activeLocale));
            return activeLocale;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}

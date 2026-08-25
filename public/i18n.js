export const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"]);

export const DEFAULT_MESSAGES = Object.freeze({
    en: Object.freeze({
        "app.title": "Procedural Hex World",
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
        "performance.visibleChunks": "Visible chunks",
        "performance.residentChunks": "Resident chunks",
        "performance.lod": "LOD 0 / 1 / 2",
        "performance.sourceChunks": "Source resident / pending",
        "performance.cache": "Cache hits / misses",
        "performance.cachedChunks": "Cached chunks",
        "performance.cacheStorage": "Cache storage",
        "performance.unit.fps": "FPS",
        "performance.unit.frameTime": "ms",
        "performance.unit.memory": "MB",
        "performance.unavailable": "Unavailable",
        "control.seed": "seed",
        "control.width": "width",
        "control.height": "height",
        "control.generate": "Generate world",
        "control.clearCache": "Clear cached data",
        "control.grid": "grid",
        "control.blendWidth": "blend width",
        "control.blendCurve": "blend curve",
        "control.mountains": "mountains",
        "control.waveHeight": "wave height",
        "control.waveSpeed": "wave speed",
        "control.coastCurve": "coast curve",
        "control.foam": "foam",
        "control.trees": "trees",
        "control.grass": "grass",
        "control.wind": "wind",
        "status.initializing": "Initializing world…",
        "status.initializingDetail": "Starting the Three.js renderer",
        "status.generating": "Generating world…",
        "status.generated": "World generated",
        "status.failed": "Generation failed",
        "status.cacheCleared": "Cached data cleared",
        "status.cacheClearedDetail": "Stored chunks were removed; currently loaded terrain stays visible.",
        "status.cacheUnavailable": "Cache unavailable",
        "status.cacheUnavailableDetail": "Persistent browser storage is disabled or unavailable.",
        "cache.confirm": "Clear all persisted procedural world chunks? The currently loaded terrain will stay visible.",
        "status.worldDetail": "{width} × {height} · four-way wrap · seed {seed}",
        "status.infiniteDetail": "infinite streamed world · seed {seed}",
        "status.controlsHint": "WASD move · Left click select · Right drag orbit · Wheel zoom",
        "status.tile": "Tile {x}, {y}",
        "status.selected": "Selected {x}, {y}",
        "terrain.sea": "Sea",
        "terrain.coastal": "Coast",
        "terrain.land": "Grassland",
        "terrain.sand": "Desert",
        "terrain.tundra": "Tundra",
        "terrain.snow": "Snow",
        "terrain.mountain": "Mountain",
        "modifier.hill": "Hill",
        "modifier.wood": "Forest",
        "modifier.lake": "Lake",
        "modifier.river": "River"
    }),
    "zh-CN": Object.freeze({
        "app.title": "程序化六边形世界",
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
        "performance.visibleChunks": "可见区块",
        "performance.residentChunks": "驻留区块",
        "performance.lod": "LOD 0 / 1 / 2",
        "performance.sourceChunks": "数据区块 驻留 / 等待",
        "performance.cache": "缓存命中 / 未命中",
        "performance.cachedChunks": "缓存区块",
        "performance.cacheStorage": "缓存占用",
        "performance.unit.fps": "帧/秒",
        "performance.unit.frameTime": "毫秒",
        "performance.unit.memory": "MB",
        "performance.unavailable": "不可用",
        "control.seed": "种子",
        "control.width": "宽度",
        "control.height": "高度",
        "control.generate": "生成世界",
        "control.clearCache": "清空缓存数据",
        "control.grid": "网格",
        "control.blendWidth": "混合宽度",
        "control.blendCurve": "混合曲率",
        "control.mountains": "山脉高度",
        "control.waveHeight": "波浪高度",
        "control.waveSpeed": "波浪速度",
        "control.coastCurve": "海岸曲率",
        "control.foam": "浪花",
        "control.trees": "树木密度",
        "control.grass": "草地",
        "control.wind": "风力",
        "status.initializing": "正在初始化世界…",
        "status.initializingDetail": "正在启动 Three.js 渲染器",
        "status.generating": "正在生成世界…",
        "status.generated": "世界已生成",
        "status.failed": "生成失败",
        "status.cacheCleared": "缓存数据已清空",
        "status.cacheClearedDetail": "已删除持久化区块；当前已加载地形会继续显示。",
        "status.cacheUnavailable": "缓存不可用",
        "status.cacheUnavailableDetail": "浏览器持久存储已禁用或当前不可用。",
        "cache.confirm": "确定清空全部持久化程序化世界区块吗？当前已加载地形会继续显示。",
        "status.worldDetail": "{width} × {height} · 四向循环 · 种子 {seed}",
        "status.infiniteDetail": "无限流式世界 · 种子 {seed}",
        "status.controlsHint": "WASD 移动 · 左键选择 · 右键环绕观察 · 滚轮缩放",
        "status.tile": "格子 {x}, {y}",
        "status.selected": "已选择 {x}, {y}",
        "terrain.sea": "海洋",
        "terrain.coastal": "海岸水域",
        "terrain.land": "草原",
        "terrain.sand": "沙漠",
        "terrain.tundra": "苔原",
        "terrain.snow": "雪地",
        "terrain.mountain": "山脉",
        "modifier.hill": "丘陵",
        "modifier.wood": "森林",
        "modifier.lake": "湖泊",
        "modifier.river": "河流"
    })
});

export function resolveLocale(locale) {
    const normalized = String(locale ?? "").trim().toLowerCase();
    if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
    return "en";
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
        get locale() {
            return activeLocale;
        },

        t(key, parameters = {}) {
            const activeMessages = messages[activeLocale] ?? {};
            const fallbackMessages = messages.en ?? {};
            const message = activeMessages[key] ?? fallbackMessages[key] ?? key;
            return interpolate(String(message), parameters);
        },

        setLocale(nextLocale) {
            const resolved = resolveLocale(nextLocale);
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

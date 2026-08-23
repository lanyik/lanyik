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
        "control.seed": "seed",
        "control.width": "width",
        "control.height": "height",
        "control.generate": "Generate world",
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
        "status.worldDetail": "{width} × {height} · seed {seed}",
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
        "control.seed": "种子",
        "control.width": "宽度",
        "control.height": "高度",
        "control.generate": "生成世界",
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
        "status.worldDetail": "{width} × {height} · 种子 {seed}",
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

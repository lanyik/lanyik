// 玩法、AI 和表现共用的范围来源。距离用游戏单位，地图适配器再换算为显示单位。
/** 玩法驻留区块的正方形边长，单位：游戏单位。不是下方的地形源区块尺寸。 */
const chunkSize = 12;
/** 以玩家所在玩法区块为中心，向 X/Z 各保留多少圈区块。 */
const residentRadius = 4;
/** 1 游戏单位对应的地图显示单位数。 */
const unitScale = 34;
/** 正方形玩法驻留窗口的最大区块数，包含中心区块。 */
const residentChunks = (residentRadius * 2 + 1) ** 2;
/** 地形绘制距离，单位：游戏单位；包含浓雾后的远景地形。 */
const terrainEnd = 68;
/** 地形源区块每边的六边形地格数，不是游戏单位或玩法区块数。 */
const terrainChunkSize = 24;
/** 地形加载半径，单位：源区块；1.5 是六边形地格沿 X 轴中心间距的系数。 */
const terrainLoadRadius = Math.ceil(terrainEnd / (terrainChunkSize * 1.5));

/**
 * 统一的视野与驻留规则；参数不是同一种“视距”。
 * 保持角色淡出、AI 唤醒/休眠和玩法卸载边界的先后关系，避免可见怪物休眠或突然卸载。
 * 玩法驻留按方形区块判断，AI/角色淡出按到玩家的距离判断；地形流送另按源区块管理。
 */
export const WORLD_VIEW = Object.freeze({
    /** 游戏距离转地图显示距离的倍率。 */
    unitScale,
    /** 玩法驻留区块边长，单位：游戏单位。 */
    chunkSize,
    /** 玩法驻留半径，单位：玩法区块。 */
    residentRadius,
    /** 驻留窗口的区块总上限，用于估算人口容量。 */
    residentChunks,
    /** 每块按最多 10 名居民 + 1 名领主估算怪物槽，再向上按 64 对齐。 */
    maxEnemies: Math.ceil(residentChunks * 11 / 64) * 64,
    /** 怪物模型开始淡出的距离，单位：游戏单位。 */
    actorFadeStart: 34,
    /** 怪物模型完全淡出的距离，需留在玩法卸载边界之内；淡出不删除实体。 */
    actorFadeEnd: (residentRadius - .5) * chunkSize,
    /** 休眠怪物靠近玩家至此距离时唤醒，单位：游戏单位。 */
    awakeRadius: 44,
    /** 已唤醒怪物远离至此距离后休眠；大于 awakeRadius 以避免边界反复切换。 */
    sleepRadius: 46,
    /** 雾环内侧从透明开始渐入的半径，单位：游戏单位。 */
    mistInner: 20,
    /** 雾环达到完整密度的半径；与 mistFade 之间保留浓雾段。 */
    mistDense: 34,
    /** 雾环外侧开始渐出的半径，单位：游戏单位。 */
    mistFade: 44,
    /** 雾环外侧完全透明的半径；应满足 inner < dense <= fade < outer。 */
    mistOuter: 50,
    /** 地形远景雾开始的距离，单位：游戏单位；不同于叠在场景上的雾环。 */
    terrainFogStart: 34,
    /** 地形远景雾完成的距离，单位：游戏单位。 */
    terrainFogEnd: 50,
    /** 地形绘制截止距离，单位：游戏单位，适配器会乘 unitScale。 */
    terrainEnd,
    /** 植被绘制截止距离，单位：游戏单位，适配器会乘 unitScale。 */
    vegetationEnd: 50,
    /** 地形源区块每边的六边形地格数。 */
    terrainChunkSize,
    /** 地形源区块加载半径，单位：源区块。 */
    terrainLoadRadius,
    /** 地形源区块保留半径，比加载圈多一圈，减少来回移动造成的重复加载。 */
    terrainRetentionRadius: terrainLoadRadius + 1,
    /** 导航采样最多缓存的玩法区块数：比玩法驻留窗口向四周各扩一圈。 */
    navigationChunks: (residentRadius * 2 + 3) ** 2
});

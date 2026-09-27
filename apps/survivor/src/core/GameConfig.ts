import { WORLD_VIEW } from "./WorldView";
/**
 * 游戏共用的只读配置，模拟 Worker 和主线程表现读取同一份规则。
 * 距离默认使用游戏单位；Hz = 每秒执行次数，Ms = 毫秒，冷却时间使用秒。
 * 这是启动时读取的常量，不是运行中的调参接口；容量变化会影响预分配数组和 Worker 布局。
 * 视距、驻留圈及显示缩放统一由 WorldView 派生，避免逻辑和画面各自维护一套距离。
 */
export const GAME_CONFIG = Object.freeze({
    /** 战斗实体池容量与通用判定参数。容量是同一时刻的上限，不是累计生成数量。 */
    combat: Object.freeze({
        /** 驻留怪物总容量，包含普通怪、精英和 Boss；按驻留区块的最大人口推导。 */
        maxEnemies: WORLD_VIEW.maxEnemies,
        /** 通用弹道池总容量，玩家与敌人共用；火系专用火弹池另在 CombatEffects 定义。 */
        maxProjectiles: 128,
        /** 敌方在通用弹道池中最多占用的数量，必须不大于总容量。 */
        maxHostileProjectiles: 64,
        /** 同时存在的经验球上限；满额时把新经验合并到已有球。 */
        maxExperienceOrbs: 768,
        /** 地面物品实体上限，装备、宝珠、药剂等共用，不是背包容量。 */
        maxGroundEquipment: 64,
        /** 玩家水平碰撞半径，单位：游戏单位。影响移动净空与受击判定。 */
        playerRadius: .3,
        /** 玩家距怪物出生点超过此距离时，怪物放弃追击并归位。 */
        enemyLeashDistance: 22,
        /** 生命药剂与法力药剂共用的使用冷却，单位：秒。 */
        consumableCooldown: 4,
        /** 敌人普通近战扇形的半角，单位：弧度；完整夹角为此值的两倍。 */
        meleeHalfArc: 1.1
    }),
    /** 怪物感知和巡逻。下列感知距离以怪物到玩家的距离判断。 */
    enemies: Object.freeze({
        /** 无目标时开始仇恨的距离；还需处于活跃圈且满足出生点牵引限制。 */
        aggroDistance: 12,
        /** 已有目标时允许继续追击的距离，大于仇恨进入距离以减少反复脱战。 */
        pursuitDistance: 19,
        /** 进入近圈高频决策的距离，不等于直接开始攻击的距离。 */
        activeDistance: 18,
        /** 已活跃怪物离开高频决策的距离；应大于 activeDistance，形成缓冲带。 */
        activeExitDistance: 20,
        /** 休眠怪物进入此范围后唤醒；远圈唤醒后仍可低频巡逻。 */
        awakeDistance: WORLD_VIEW.awakeRadius,
        /** 已唤醒怪物超过此范围后休眠；应大于 awakeDistance。 */
        sleepDistance: WORLD_VIEW.sleepRadius,
        /** 巡逻速度相对怪物基础移速的倍率，.45 表示 45%，不是单位/秒。 */
        patrolSpeed: .45,
        /** 出生点周围巡逻航点的基础半径；Boss 和斥候还会乘各自的倍率。 */
        patrolRadius: 2.5
    }),
    /** 固定调度频率。下属 Hz 必须整除 simulationHz，ticksPerUpdate 会校验。 */
    timing: Object.freeze({
        /** 权威战斗每秒推进的 tick 数；控制移动、碰撞、技能时序，不是画面 FPS。 */
        simulationHz: 120,
        /** 近圈怪物行为树决策频率；移动与攻击释放仍按每个模拟 tick 推进。 */
        activeAiHz: 30,
        /** 已唤醒的远圈怪物巡逻/归位决策频率；各实体按句柄错峰。 */
        distantAiHz: 5,
        /** 自然回血/回蓝的执行频率；修改时需同步检查衍生属性中的单次回复量。 */
        regenerationHz: 2,
        /** 常规 UI 完整快照发布频率；命令、通知、死亡和暂停屏障可强制立即发布。 */
        snapshotHz: 10,
        /** 活跃祭司寻找可治疗同伴的频率，不是治疗技能的冷却。 */
        supportSenseHz: 5,
        /** 开启自动施法后尝试起手技能的频率；仍受法力、冷却、前后摇约束。 */
        autoSkillHz: 10,
        /** 性能诊断的统计/发布周期，单位：毫秒。 */
        diagnosticsMs: 1000,
        /** 单帧最多接纳的补算时间，单位：毫秒；也用于推导待执行 tick 的容量。 */
        maxCatchUpMs: 250
    }),
    /** 技能装配、成长和表现记录。具体技能数值与前后摇定义在 Skills 等技能模块。 */
    skills: Object.freeze({
        /** 可同时装配的主动技能槽数；变更须联动快捷键、界面和存档结构。 */
        slots: 6,
        /** 独立常驻被动槽的角色解锁等级；不占主动槽，也不对应施法快捷键。 */
        passiveUnlockLevels: Object.freeze([50, 100, 150] as const),
        /** 全域拾取被动的扫描频率，单位：Hz；只扫描已有定容地面池。 */
        passivePickupHz: 10,
        /** 每次全域扫描每类至多尝试的数量；满包计入预算并轮转扫描，沿用自动装配预算。 */
        passivePickupBatch: 16,
        /** 每次角色升级发放的技能点；总点数校验目前也按每级 1 点，改值须同步规则。 */
        pointsPerLevel: 1,
        /** 同时保留的视觉效果记录数；满额只跳过新表现，不跳过伤害或 Buff 结算。 */
        maxEffects: 128
    }),
    /** 灵境永久成长，独立于当前角色等级。 */
    spiritRealm: Object.freeze({
        /** 指定永久属性提升 1 点所消耗的灵魂数。 */
        soulsPerLevel: 1000
    }),
    /** 渲染与资源预算；这些容量和分辨率不改变技能本身的伤害范围。 */
    presentation: Object.freeze({
        /** 每个技能特效实例批次的容量；一条效果记录可能展开成多个粒子实例。 */
        effectInstances: 4096,
        /** 玩家周围雾环开始渐入的半径，单位：游戏单位。 */
        mistInnerRadius: WORLD_VIEW.mistInner,
        /** 雾环达到完整密度的半径，单位：游戏单位。 */
        mistDenseRadius: WORLD_VIEW.mistDense,
        /** 雾环外缘开始渐出的半径，单位：游戏单位。 */
        mistFadeRadius: WORLD_VIEW.mistFade,
        /** 雾环完全消失的外半径，单位：游戏单位。 */
        mistOuterRadius: WORLD_VIEW.mistOuter,
        /** 远景地形雾起始距离，已换算为地图显示单位，不要再乘 unitScale。 */
        horizonFogStart: WORLD_VIEW.terrainFogStart * WORLD_VIEW.unitScale,
        /** 远景地形雾结束距离，单位：地图显示单位。 */
        horizonFogEnd: WORLD_VIEW.terrainFogEnd * WORLD_VIEW.unitScale,
        /** 远景雾基色，格式：0xRRGGBB；天空雾还会采样天空颜色。 */
        horizonFogColor: 0x849b9f,
        /** 近景太阳阴影的半宽，单位：地图显示单位；固定 2048²。 */
        shadowRadius: 420,
        /** 技能地面效果共用的俯视投影贴图。 */
        groundProjection: Object.freeze({
            /** 投影覆盖的正方形边长，单位：游戏单位；不是覆盖半径。 */
            span: 64,
            /** 投影贴图每边的像素数；总像素和相应显存开销随该值平方增长。 */
            resolution: 2048
        }),
        /** 角色模型/贴图加载队列最多同时处理的请求数，不是 Worker 数。 */
        assetLoadConcurrency: 4,
        /** 小地图/展开地图的概览采样与缓存。 */
        minimap: Object.freeze({
            /** 无限地图默认缩放下的视口跨度，单位：地格；必须为正偶数。 */
            tileSpan: 96,
            /** 基础概览栅格边长，单位：像素；展开视图和分页采样据此派生尺寸。 */
            rasterSize: 192,
            /** 最多缓存的概览页面数，超过后淘汰最久未使用的页面。 */
            cacheEntries: 64
        })
    }),
    /** 线程通信与并行预算；地形、单个权威模拟、可选碰撞查询分别拥有线程。 */
    workers: Object.freeze({
        /** 每批发给战斗 Worker 的命令上限，不是该批允许执行的 tick 数。 */
        maxCommands: 64,
        /** 战斗/碰撞 Worker 请求超时时间，单位：毫秒；超时按失败处理。 */
        timeoutMs: 15_000,
        /** 是否允许创建额外碰撞查询 Worker；默认在权威模拟 Worker 内串行查询。 */
        parallelCollisionEnabled: false,
        /** 已启用查询 Worker 时，实际弹道—候选目标对数达到此值才并行派发。 */
        parallelCollisionPairs: 49_152,
        /** 达到 terrainCores 门槛后的地形 Worker 数；门槛以下使用 1 个。 */
        terrainMax: 2,
        /** 开启并行且达到 collisionCores 门槛后的碰撞查询 Worker 数。 */
        collisionMax: 2,
        /** 启用 terrainMax 个地形 Worker 所需的浏览器报告逻辑核数。 */
        terrainCores: 6,
        /** 允许创建碰撞查询 Worker 所需的浏览器报告逻辑核数。 */
        collisionCores: 8
    }),
    /** 各分类独立计容量：name 为界面名称，capacity 为格数，stackSize 为每格堆叠上限。 */
    inventory: Object.freeze({
        /** 装备背包；每件装备单独占一格。 */
        equipment: Object.freeze({ name: "装备", capacity: 80, stackSize: 1 }),
        /** 宝珠背包；此容量不决定角色可镶嵌的宝珠槽数。 */
        orb: Object.freeze({ name: "宝珠", capacity: 48, stackSize: 1 }),
        /** 药剂背包；满足相同类别、品质和效果等合堆条件才可叠放。 */
        consumable: Object.freeze({ name: "药剂", capacity: 32, stackSize: 99 }),
        /** 词条材料背包；词条属性、数值和品质一致才可合堆。 */
        affix: Object.freeze({ name: "词条", capacity: 80, stackSize: 99 }),
        /** 副本挑战卷轴背包；相同副本类型和品质的卷轴可合堆。 */
        scroll: Object.freeze({ name: "卷轴", capacity: 20, stackSize: 99 })
    }),
    /** 品质显示：name 为中文短名称，color 为 CSS 十六进制颜色；掉率另由 Loot 计算。 */
    quality: Object.freeze({
        /** 普通品质。 */
        common: Object.freeze({ name: "白", color: "#c1cbc8" }),
        /** 魔法品质。 */
        magic: Object.freeze({ name: "蓝", color: "#83baff" }),
        /** 稀有品质。 */
        rare: Object.freeze({ name: "紫", color: "#bc91f3" }),
        /** 传奇品质。 */
        legendary: Object.freeze({ name: "金", color: "#efc572" }),
        /** 钻石品质。 */
        diamond: Object.freeze({ name: "钻", color: "#80e6e0" }),
        /** 彩虹品质。 */
        rainbow: Object.freeze({ name: "彩", color: "#f498d5" })
    })
});

// 下列导出是配置的派生值/便捷别名，供实体池、协议和判定复用，不另设第二份数值。
/** 怪物实体池容量。 */
export const MAX_ENEMIES = GAME_CONFIG.combat.maxEnemies;
/** 玩家与敌人共用的通用弹道池容量。 */
export const MAX_PROJECTILES = GAME_CONFIG.combat.maxProjectiles;
/** 敌方在通用弹道池中最多占用的槽数。 */
export const MAX_HOSTILE_PROJECTILES = GAME_CONFIG.combat.maxHostileProjectiles;
/** 经验球实体池容量。 */
export const MAX_EXPERIENCE_ORBS = GAME_CONFIG.combat.maxExperienceOrbs;
/** 各类地面物品共用的实体池容量。 */
export const MAX_GROUND_EQUIPMENT = GAME_CONFIG.combat.maxGroundEquipment;
/** ECS 总槽数：1 名玩家 + 怪物 + 通用弹道 + 经验球 + 地面物品。 */
export const ENTITY_CAPACITY = 1 + MAX_ENEMIES + MAX_PROJECTILES + MAX_EXPERIENCE_ORBS + MAX_GROUND_EQUIPMENT;
/** 玩家水平碰撞半径，单位：游戏单位。 */
export const PLAYER_RADIUS = GAME_CONFIG.combat.playerRadius;
/** 允许追击时玩家距怪物出生点的最大距离，单位：游戏单位。 */
export const ENEMY_LEASH_DISTANCE = GAME_CONFIG.combat.enemyLeashDistance;
/** 生命/法力药剂共用冷却，单位：秒。 */
export const CONSUMABLE_COOLDOWN = GAME_CONFIG.combat.consumableCooldown;
/** 敌人普通近战扇形半角，单位：弧度。 */
export const MELEE_HALF_ARC = GAME_CONFIG.combat.meleeHalfArc;

/** 每个模拟 tick 对应的游戏时间，单位：毫秒；不是一次模拟实际消耗的 CPU 时间。 */
export const SIMULATION_STEP_MS = 1000 / GAME_CONFIG.timing.simulationHz;
/** 补算窗口折算成的 tick 数上限，同时约束 Worker 批次与会话待执行队列。 */
export const MAX_CATCH_UP_TICKS = Math.ceil(GAME_CONFIG.timing.maxCatchUpMs * GAME_CONFIG.timing.simulationHz / 1000);
/** 将每秒更新次数换算成整数 tick 间隔；hz 必须正数且能整除模拟频率，否则抛错。 */
export function ticksPerUpdate(hz: number): number {
    const ticks = GAME_CONFIG.timing.simulationHz / hz;
    if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError("Update rate must divide simulation frequency");
    return ticks;
}
/** 将秒数向上取整成 tick 数，使截止时间不会因截断而提前；输入有效性由调用方保证。 */
export function ticksForSeconds(seconds: number): number {
    return Math.ceil(seconds * GAME_CONFIG.timing.simulationHz);
}

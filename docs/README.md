# 项目文档结构与设计索引

**开发只走一条入口链：[AGENTS.md](../AGENTS.md) → 本页 → 所属设计与代码。** AGENTS 定义开发基准，本页是唯一设计索引，具体文档负责各自的规则与边界。

页内直达：[总关系图](#overview) · [文档结构](#entrypoints) · [按任务阅读](#routes) · [游戏设计与分层](#game) · [地图基础库](#foundation) · [验证与性能决策](#verification) · [测量与决策证据](#evidence) · [资产来源与许可](#assets) · [文档维护](#maintenance)

“合同”指**当前实现必须遵守的规则与边界**。后续计划集中在开发重点；历史测量只用于复核对应改动，不代表当前版本的验收结果。

<a id="overview"></a>

## 1. 总关系图

图中的实线表示内容归属或主要阅读方向，虚线表示按需参考，**不是代码调用关系，也不是要求把所有文档顺序读完**。每张图下方都有可直接打开的文件链接；阅读器未渲染 Mermaid 时也可以直接使用表格。

```mermaid
flowchart TB
    agent["AGENTS.md<br/>开发基准与入口"]
    home["docs/README.md<br/>唯一设计索引：结构、职责、关系图"]
    game["游戏设计<br/>apps/survivor 的行为与边界"]
    foundation["地图基础库设计<br/>src 的通用地图服务"]
    gameCode["游戏源码与测试<br/>apps/survivor/src / tests"]
    libCode["基础库源码与测试<br/>src / tests"]
    verify["验证与决策<br/>testing / optimization-gates"]
    history["测量与决策证据<br/>evidence / game/measurements"]
    assets["资产来源与许可<br/>角色、环境、离线生成输入"]
    agent --> home
    home --> game
    home --> foundation
    game --> gameCode
    foundation --> libCode
    gameCode --> verify
    libCode --> verify
    game -. 使用地图服务 .-> foundation
    verify -. 查原始证据 .-> history
    game -. 美术与构建 .-> assets
```

仓库有两个实现层：**Survivor 游戏**拥有战斗、物品、成长和角色存档；**three-hex-map 基础库**提供地形、渲染、加载、通用持久化与寻路服务。基础库提供一种能力，不代表游戏已经接入对应玩法。

<a id="entrypoints"></a>

## 2. 文档结构与内容归属

```text
AGENTS.md                     开发基准；只指向 docs/README.md
README.md / README.zh-CN.md    项目介绍、运行方法、公开 API
游戏想法.md                   面向玩家的玩法范围
CHANGELOG.md                  发布历史
docs/
  README.md                   唯一设计索引：本页
  app-development.md          游戏集成、会话和生命周期
  game/*.md                   战斗、成长、物品、存档、界面、美术等设计
  game/development-priorities.md   已有基础与后续计划
  game/measurements/*.json     游戏原始测量和回放证据
  *.md                        地图库设计、验证策略和优化决策
  decisions/*.md              仍约束当前实现的算法决策
  evidence/                   优化决策与验收阈值引用的历史观察和测量
```

各份设计的完整文件名、职责和代码位置见下方游戏、基础库与验证表格。`scripts/vendor/README.md` 记录离线生成器的来源与复现方式，资产原始归属另见[许可章节](#assets)，它们是实质资料。

| 文件，点击直达 | 回答的问题 | 什么时候读 |
|---|---|---|
| [README.zh-CN.md](../README.zh-CN.md) / [README.md](../README.md) | 项目是什么、如何安装运行、公开 API 怎么用 | 初次运行或作为库使用；两者分别为中文和英文入口 |
| [AGENTS.md](../AGENTS.md) | 开发必须遵守哪些项目约束 | 开始开发前；五条项目要求是约束 |
| 本页 | 文档怎么组织、这次任务读哪份设计、代码在哪里 | 唯一设计索引，直接打开所需文档 |
| [游戏想法.md](../游戏想法.md) | 玩家体验与当前玩法范围是什么 | 了解产品；具体数值和实现边界读领域设计 |
| [CHANGELOG.md](../CHANGELOG.md) | 已发布版本发生过哪些变化 | 查发布历史；当前行为以设计和代码为准 |

<a id="routes"></a>

## 3. 按这次任务选择阅读链

遵守 AGENTS 的开发基准后，从下表选一行，直接读具体设计和代码，完成后按[验证矩阵](testing.md#change-based-local-validation)检查。箭头后的补充设计只在涉及该边界时阅读。

| 要做的事 | 主要设计 → 需要联动的设计 | 代码起点 |
|---|---|---|
| 技能树、Buff、被动、伤害效果 | [战斗架构](game/combat-architecture.md) → [技能与效果](game/skills-and-effects.md)、[战斗与成长](game/combat-and-progression.md)；范围与顺序见[开发重点](game/development-priorities.md) | [StatusSystem](../apps/survivor/src/core/StatusSystem.ts)、[SkillSystem](../apps/survivor/src/core/SkillSystem.ts)、[CombatResolution](../apps/survivor/src/core/CombatResolution.ts) |
| 探索迷雾、地图传送、家园往返、Boss 副本 | [探索与家园](game/exploration-and-homestead.md) → [角色存档](game/character-saves.md)、[物品合同](game/items.md)、[界面设计](game/interface-design.md) | [Exploration](../apps/survivor/src/core/Exploration.ts)、[BossChallenge](../apps/survivor/src/core/BossChallenge.ts)、[CombatSession](../apps/survivor/src/app/CombatSession.ts) |
| 装备、套装、连携与构筑 | [物品合同](game/items.md) → [打造与灵境](game/crafting-and-spirit.md)、[战斗架构](game/combat-architecture.md) | [Equipment](../apps/survivor/src/core/Equipment.ts)、[Crafting](../apps/survivor/src/core/Crafting.ts)；套装/连携尚未完整实现 |
| 怪物行为、攻击节奏与难度 | [模拟与 AI](game/simulation-and-ai.md) → [数值平衡](game/combat-balance.md)、[技能与效果](game/skills-and-effects.md) | [EnemyBehavior](../apps/survivor/src/core/EnemyBehavior.ts)、[EnemyDefinitions](../apps/survivor/src/core/EnemyDefinitions.ts)、[EnemyActions](../apps/survivor/src/core/EnemyActions.ts) |
| 玩家挂机、手动接管、自动用药与局部寻路 | [玩家自动战斗](game/simulation-and-ai.md#玩家自动战斗) → [地形通行](game/terrain-navigation.md)、[界面设计](game/interface-design.md) | [PlayerAutoCombat](../apps/survivor/src/core/PlayerAutoCombat.ts)、[AutoCombatPath](../apps/survivor/src/core/AutoCombatPath.ts)、[AutoCombatThreats](../apps/survivor/src/core/AutoCombatThreats.ts) |
| 任务、剧情、据点长期进度 | [开发重点](game/development-priorities.md) → [战斗架构](game/combat-architecture.md)、[角色存档](game/character-saves.md) | 现有接点：[CombatEvents](../apps/survivor/src/core/CombatEvents.ts)、[CharacterCheckpoint](../apps/survivor/src/core/CharacterCheckpoint.ts)；任务/剧情系统尚未实现 |
| 卡坡、树林碰撞、刷怪落点 | [地形通行](game/terrain-navigation.md) → 改高度/水系时读[世界生成](world-style-generation-v1.md)，改 AI 时读[模拟与 AI](game/simulation-and-ai.md) | [SurfaceMotion](../apps/survivor/src/core/SurfaceMotion.ts)、[EncounterNavigation](../apps/survivor/src/core/EncounterNavigation.ts)、[ProceduralCombatTerrain](../apps/survivor/src/adapters/ProceduralCombatTerrain.ts) |
| 背包、HUD、快捷键与卡顿 | [界面设计](game/interface-design.md) → [UI 性能](game/ui-performance.md)、[应用集成](app-development.md)；改物品行为时读[物品合同](game/items.md) | [App](../apps/survivor/src/presentation/App.tsx)、[VirtualItemGrid](../apps/survivor/src/presentation/VirtualItemGrid.tsx)、[CombatSession](../apps/survivor/src/app/CombatSession.ts) |
| 模型、动作、树木、天空与雾 | [视觉总览](game/visual-modernization.md) → [角色资产](game/actor-assets.md)或[环境资产](game/environment-assets.md)；特效读[技能与效果](game/skills-and-effects.md) | [ActorModels](../apps/survivor/src/presentation/ActorModels.ts)、[CombatEnvironment](../apps/survivor/src/adapters/CombatEnvironment.ts)、[着色器](../src/shaders/) |
| 地图库 API、加载、恢复与资源释放 | [包边界](package-boundaries.md) → [基础设施](foundation-infrastructure.md)、[冻结合同](foundation-v1-freeze.md) → [对应专项](#foundation) | [HexMap](../src/HexMap.ts)、[runtime](../src/runtime/)、[rendering](../src/rendering/) |

例：做 Buff 刷新规则，先读战斗架构中的[状态合同](game/combat-architecture.md#状态合同)，查看 `StatusSystem` 及测试，再检查技能消费者；不需要先阅读资产调研、基础库寻路和所有历史测量。

<a id="game"></a>

## 4. 游戏设计的完整链路

先看应用和战斗的所有权，再按任务进入玩法或表现分支。图中**开发重点**包含后续计划；其他设计也会明确列出各自尚未实现的边界。

<a id="game-structure"></a>

### 游戏源码分层

| 目录 | 职责 | 主要设计 |
|---|---|---|
| [apps/survivor/src/core](../apps/survivor/src/core/) | 纯数据模拟、ECS、结算、物品和成长 | [战斗架构](game/combat-architecture.md)、下方玩法合同 |
| [apps/survivor/src/app](../apps/survivor/src/app/) | 会话、输入、快照、存档仓库与生命周期 | [应用集成](app-development.md)、[角色存档](game/character-saves.md) |
| [apps/survivor/src/worker](../apps/survivor/src/worker/) | Worker 协议、执行入口和线程所有权 | [模拟与 AI](game/simulation-and-ai.md) |
| [apps/survivor/src/adapters](../apps/survivor/src/adapters/) | 地图、地形通行、区域与视图适配 | [地形通行](game/terrain-navigation.md)、[应用集成](app-development.md) |
| [apps/survivor/src/presentation](../apps/survivor/src/presentation/) | React 界面、模型、动画、场景与 HUD | [界面设计](game/interface-design.md)、[技能与效果](game/skills-and-effects.md)、资产合同 |
| [apps/survivor/assets](../apps/survivor/assets/) | 固定来源的资产输入与许可 | [角色资产](game/actor-assets.md)、[环境资产](game/environment-assets.md) |

核心不依赖 React、Three.js、DOM、Worker 或地图基础库；表现读取模拟结果。技能树、通用 Buff、被动、套装、连携、任务和剧情的完整系统仍需按开发重点逐步接入，不能把已有 ECS 和事件流当作这些功能已经完成。

安装运行见[根 README](../README.zh-CN.md)，构建与验证顺序见[测试策略](testing.md#change-based-local-validation)。

### 设计关系图

```mermaid
flowchart TB
    app["应用集成<br/>app-development.md"] --> combat["战斗架构<br/>combat-architecture.md"]
    combat --> ai["模拟与 AI<br/>simulation-and-ai.md"]
    combat --> loop["战斗与成长<br/>combat-and-progression.md"]
    combat --> skill["技能与效果<br/>skills-and-effects.md"]
    loop --> balance["数值平衡<br/>combat-balance.md"]
    loop --> item["物品与装备<br/>items.md"]
    item --> craft["打造与灵境<br/>crafting-and-spirit.md"]
    craft --> save["角色存档<br/>character-saves.md"]
    app --> explore["探索与家园<br/>exploration-and-homestead.md"]
    explore --> save
    explore -. 权限与边界 .-> terrain
    ai --> terrain["通行与遭遇<br/>terrain-navigation.md"]
    app --> visual["视觉总览<br/>visual-modernization.md"]
    visual --> actor["角色与动作<br/>actor-assets.md"]
    visual --> env["环境与雾<br/>environment-assets.md"]
    visual --> ui["界面设计<br/>interface-design.md"]
    app -. 命令与快照 .-> ui
    item -. 图标、事务与比较 .-> ui
    ui --> perf["UI 性能<br/>ui-performance.md"]
    combat -. 后续扩展 .-> plan["开发重点：计划<br/>development-priorities.md"]
    skill -. 动作与反馈 .-> actor
    terrain -. 同源高度与树干 .-> env
```

### 游戏合同与代码直达

| 设计文件 | 主要负责什么 | 实现入口 |
|---|---|---|
| [app-development.md](app-development.md) | 会话、主线程/Worker 边界、输入、暂停、快照、生命周期和诊断 | [CombatSession](../apps/survivor/src/app/CombatSession.ts)、[CombatWorkerHost](../apps/survivor/src/worker/CombatWorkerHost.ts)、[bootstrap](../apps/survivor/src/app/bootstrap.tsx) |
| [combat-architecture.md](game/combat-architecture.md) | 结算、实际生命提交、状态、奖励、表现分离；后续领域接入边界 | [CombatResolution](../apps/survivor/src/core/CombatResolution.ts)、[CombatVitality](../apps/survivor/src/core/CombatVitality.ts)、[CombatEvents](../apps/survivor/src/core/CombatEvents.ts)、[StatusSystem](../apps/survivor/src/core/StatusSystem.ts) |
| [simulation-and-ai.md](game/simulation-and-ai.md) | ECS 身份与容量、固定步骤、AI、行动中断、查询线程与性能预算 | [EntityWorld](../apps/survivor/src/core/EntityWorld.ts)、[CombatWorld](../apps/survivor/src/core/CombatWorld.ts)、[EnemyBehavior](../apps/survivor/src/core/EnemyBehavior.ts)、[worker](../apps/survivor/src/worker/) |
| [combat-and-progression.md](game/combat-and-progression.md) | 地域、玩法驻留、奖励来源、寻宝算法、经验与属性公式 | [CombatSimulation](../apps/survivor/src/core/CombatSimulation.ts)、[CombatStats](../apps/survivor/src/core/CombatStats.ts)、[RegionalWorld](../apps/survivor/src/core/RegionalWorld.ts)、[CombatRewards](../apps/survivor/src/core/CombatRewards.ts) |
| [combat-balance.md](game/combat-balance.md) | 参考装备、承伤与击杀时间的数值期望及校准局限 | [EnemyDefinitions](../apps/survivor/src/core/EnemyDefinitions.ts)、[CombatBalance 测试](../apps/survivor/tests/CombatBalance.test.ts)、[报告脚本](../scripts/report-combat-balance.mjs) |
| [skills-and-effects.md](game/skills-and-effects.md) | 技能装配、等级、释放、怪物攻击特性、特效与飘字 | [SkillSystem](../apps/survivor/src/core/SkillSystem.ts)、[EnemyActions](../apps/survivor/src/core/EnemyActions.ts)、[CombatFeedback](../apps/survivor/src/core/CombatFeedback.ts)、[SkillEffects](../apps/survivor/src/presentation/SkillEffects.ts) |
| [items.md](game/items.md) | 装备生成与比较、物品身份、背包/穿戴/入包事务、分类回收、图标与地面表现 | [InventoryItem](../apps/survivor/src/core/InventoryItem.ts)、[Inventory](../apps/survivor/src/core/Inventory.ts)、[EquipmentEvaluation](../apps/survivor/src/core/EquipmentEvaluation.ts)、[Recycling](../apps/survivor/src/core/Recycling.ts) |
| [crafting-and-spirit.md](game/crafting-and-spirit.md) | 词条打造、宝珠精炼/共鸣、打造事务与确认窗、永久灵境成长 | [Crafting](../apps/survivor/src/core/Crafting.ts)、[Orbs](../apps/survivor/src/core/Orbs.ts)、[SpiritRealm](../apps/survivor/src/core/SpiritRealm.ts) |
| [character-saves.md](game/character-saves.md) | 角色检查点、自动/手动槽、灵境独立存储及读档重建边界 | [CharacterCheckpoint](../apps/survivor/src/core/CharacterCheckpoint.ts)、[CharacterRepository](../apps/survivor/src/app/CharacterRepository.ts)、[SpiritRepository](../apps/survivor/src/worker/SpiritRepository.ts) |
| [exploration-and-homestead.md](game/exploration-and-homestead.md) | 迷雾探索、等级揭示、传送权限、64×64 安全家园与往返 | [Exploration](../apps/survivor/src/core/Exploration.ts)、[Homestead](../apps/survivor/src/core/Homestead.ts)、[HomesteadMap](../apps/survivor/src/adapters/HomesteadMap.ts) |
| [terrain-navigation.md](game/terrain-navigation.md) | 坡度、水体、树干、滑移、攻击遮挡、营地落点与可达性 | [CombatTerrain](../apps/survivor/src/core/CombatTerrain.ts)、[SurfaceMotion](../apps/survivor/src/core/SurfaceMotion.ts)、[EncounterNavigation](../apps/survivor/src/core/EncounterNavigation.ts) |
| [interface-design.md](game/interface-design.md) | HUD 与页面职责、背包/技能交互、快捷键、窄屏布局 | [presentation](../apps/survivor/src/presentation/)、[app.css](../apps/survivor/src/presentation/app.css) |
| [ui-performance.md](game/ui-performance.md) | 快照分支复用、虚拟网格、迷雾缓存、UI 实测方法与局限 | [ShareSnapshot](../apps/survivor/src/app/ShareSnapshot.ts)、[VirtualItemGrid](../apps/survivor/src/presentation/VirtualItemGrid.tsx)、[UI 基准](../scripts/benchmark-survivor-ui.mjs)、[地图基准](../scripts/benchmark-survivor-map.mjs) |
| [visual-modernization.md](game/visual-modernization.md) | 当前免费美术方向、整体效果和不足 | 具体实现分别由下两份资产合同及界面合同定义 |
| [actor-assets.md](game/actor-assets.md) | 角色来源、动作烘焙、手部轨迹、材质、实例池和预算 | [ActorModels](../apps/survivor/src/presentation/ActorModels.ts)、[ActorPose](../apps/survivor/src/presentation/ActorPose.ts)、[角色生成](../scripts/lib/survivor-actors.mjs) |
| [environment-assets.md](game/environment-assets.md) | 树木、地表材质、天空、雾、前景透视及离线构建 | [CombatEnvironment](../apps/survivor/src/adapters/CombatEnvironment.ts)、[环境生成](../scripts/lib/survivor-environment.mjs)、[渲染模块](../src/rendering/) |
| [development-priorities.md](game/development-priorities.md) | **计划**：现有基础、未完成能力、建议顺序与验收方向 | 不对应一个“已实现功能”模块；实现后同步相应领域合同 |

应用集成只定义命令、快照和生命周期边界；实体容量与执行阶段归模拟设计，地域驻留归战斗与成长，物品事务归物品设计，窗口布局与快捷键归界面设计。相邻设计引用所属规则，不重复维护数值表或完整操作流程。

游戏单元测试在 [apps/survivor/tests](../apps/survivor/tests/)，浏览器集成测试在 [tests/e2e](../apps/survivor/tests/e2e/)。具体需要运行哪些检查直接看[验证矩阵](testing.md#change-based-local-validation)。

<a id="foundation"></a>

## 5. 地图基础库的完整链路

先确认公开 API 与所有权，再进入专项。**冻结合同仍有效**；它约束后续扩展，不属于过期历史。

源码在根 [src](../src/)：`runtime/` 管生命周期、调度和预算，`world/` 管生成、流送、表面、驻留与导航，`rendering/`、`objects/`、`shaders/` 管绘制，`persistence/` 管检查点。公开入口是 `index.ts` 及可选子路径；各目录与具体设计的对应关系见下表。

```mermaid
flowchart TB
    pkg["包边界<br/>package-boundaries.md"] --> infra["基础设施<br/>foundation-infrastructure.md"]
    infra --> freeze["冻结合同<br/>foundation-v1-freeze.md"]
    infra --> stream["渲染与流送<br/>render-streaming.md"]
    stream --> owner["渲染会话所有权<br/>render-world-controller.md"]
    owner --> resident["区块驻留<br/>chunk-residency.md"]
    stream --> world["世界生成<br/>world-style-generation-v1.md"]
    world --> water["水系设计决策<br/>coarse-drainage-water-network.md"]
    world -. 历史观测与阈值调整 .-> measurements["世界风格证据<br/>evidence/world-style-generation.md"]
    infra --> delta["地图增量持久化<br/>world-delta-persistence.md"]
    pkg --> events["基础库事件<br/>event-contracts.md"]
    pkg --> path["分层寻路<br/>hierarchical-pathfinding.md"]
    path -. 共享驻留 .-> resident
    delta -. 世代保存与恢复 .-> freeze
```

| 设计文件 | 主要负责什么 | 实现入口 |
|---|---|---|
| [package-boundaries.md](package-boundaries.md) | 主入口、可选持久化/寻路子路径、依赖和构建边界 | [index.ts](../src/index.ts)、[persistence.ts](../src/persistence.ts)、[pathfinding.ts](../src/pathfinding.ts)、[package.json](../package.json) |
| [foundation-infrastructure.md](foundation-infrastructure.md) | 生命周期、取消、恢复、任务调度、资源预算和持久化所有权 | [runtime](../src/runtime/)、[persistence](../src/persistence/)、[HexMap](../src/HexMap.ts) |
| [foundation-v1-freeze.md](foundation-v1-freeze.md) | 已冻结的版本、生成协议、世代检查点、资源所有权与验收边界 | [WorldGeneratorVersion](../src/world/WorldGeneratorVersion.ts)、[GenerationCheckpointCoordinator](../src/persistence/GenerationCheckpointCoordinator.ts) |
| [event-contracts.md](event-contracts.md) | HexMap、Unit、GameEngine 的类型化事件与同步派发错误语义 | [EventEmitter](../src/EventEmitter.ts)、[EventMaps](../src/EventMaps.ts)、[gameengine](../src/gameengine.ts) |
| [render-streaming.md](render-streaming.md) | 源区块到渲染区块的全流程、Worker、LOD、缓存和编辑 | [WorldSource](../src/world/WorldSource.ts)、[WorldStreamer](../src/world/WorldStreamer.ts)、[WorldChunkScheduler](../src/rendering/WorldChunkScheduler.ts) |
| [render-world-controller.md](render-world-controller.md) | 一次地图渲染会话的创建、切换、关闭和资源归属 | [RenderWorldController](../src/rendering/RenderWorldController.ts) |
| [chunk-residency.md](chunk-residency.md) | 渲染、导航和应用消费者共享区块租约及驻留 | [ChunkResidencyCoordinator](../src/world/ChunkResidencyCoordinator.ts) |
| [world-style-generation-v1.md](world-style-generation-v1.md) | 地形、水系、植被、表面权威与风格验收 | [LandformSampler](../src/world/LandformSampler.ts)、[WorldSurfaceResolver](../src/world/WorldSurfaceResolver.ts)、[generateWorldChunk](../src/world/generateWorldChunk.ts) |
| [coarse-drainage-water-network.md](decisions/coarse-drainage-water-network.md) | **有效设计决策**：采用粗网格排水与独立水体场的理由和边界 | [WorldWaterSampler](../src/world/WorldWaterSampler.ts) |
| [world-delta-persistence.md](world-delta-persistence.md) | 可重建地形之外的稀疏覆盖、批量修改、版本与保存 | [WorldDeltaStore](../src/world/WorldDeltaStore.ts)、[WorldEditingFacade](../src/world/WorldEditingFacade.ts) |
| [hierarchical-pathfinding.md](hierarchical-pathfinding.md) | 跨未加载区块的通用分层寻路服务 | [HierarchicalPathfinder](../src/world/HierarchicalPathfinder.ts)、[寻路子入口](../src/pathfinding.ts) |

### 容易混淆的三组边界

| 游戏侧 | 基础库侧 | 如何区分 |
|---|---|---|
| [战斗事实流](game/combat-architecture.md) | [基础库事件](event-contracts.md) | 战斗结算事实与 HexMap/Unit/GameEngine 通知各自有所有权和消费者 |
| [角色存档](game/character-saves.md) | [地图增量](world-delta-persistence.md) | 保存角色不等于保存全战场；基础库增量也不自动保存游戏任务 |
| [地形通行](game/terrain-navigation.md) | [分层寻路](hierarchical-pathfinding.md) | 碰撞、局部滑移和遭遇可达性不等于游戏已经有逐怪完整路径搜索 |

<a id="verification"></a>

## 6. 验证与性能决策

所有改动都从[变更验证矩阵](testing.md#change-based-local-validation)选择检查；只有需要解释旧结果或讨论新优化时，才继续查证据和决策。

| 文件 | 用途 | 接续入口 |
|---|---|---|
| [testing.md](testing.md) | 单元、类型、浏览器、soak、基准的触发条件与执行顺序 | [CI 配置](../.github/workflows/ci.yml)、[npm 命令](../package.json)、[文档检查脚本](../scripts/check-docs.mjs) |
| [optimization-gates.md](optimization-gates.md) | 延后优化的触发条件、审批状态和证据要求 | [结构化登记](optimization-gates.json)、[校验脚本](../scripts/check-optimization-gates.mjs)、[证据](#evidence) |
| [render-backend-evaluation.md](render-backend-evaluation.md) | WebGL2、WebGPU 与 GPU 裁剪的当前取舍 | [后端测量脚本](../scripts/benchmark-render-backends.mjs)、[优化门槛](optimization-gates.md) |

性能规则分别属于[模拟与 AI](game/simulation-and-ai.md)、[地形通行](game/terrain-navigation.md)、[UI 性能](game/ui-performance.md)及基础库合同。**历史测量不是当前版本的通过证明；Node CPU 耗时也不是浏览器帧率。**

<a id="evidence"></a>

## 7. 测量与决策证据

本节直接列出仍用于解释设计取舍和复核改动的证据。过期候选比较与过程笔记不作为维护文档保留，必要时从 Git 历史查阅。

### 基础库决策证据

| 文件 | 性质与对应的当前设计 |
|---|---|
| [user-observation.md](evidence/automatic-river-generation/user-observation.md) | 历史河流问题观察；当前规则读[世界生成](world-style-generation-v1.md) |
| [natural-course-followup.md](evidence/automatic-river-generation/natural-course-followup.md) | 河道和概览改进的历史跟进；当前决策读[水系设计](decisions/coarse-drainage-water-network.md) |
| [2026-09-04.json](evidence/automatic-river-generation/2026-09-04.json) | 自动河流优化门槛的结构化证据；状态归[优化门槛](optimization-gates.md) |
| [world-style-generation.md](evidence/world-style-generation.md) | v19/v21/v22 历史测量与森林、山地阈值调整依据；当前版本与验收规则归[世界生成](world-style-generation-v1.md) |

### 游戏原始测量

各记录保留原始环境和场景，人口规模、冷启动、生命恢复策略及采样时间可能不同；重新验证使用测试策略中的当前命令和相应设计预算。

| 原始记录 | 测量阶段与当前合同 |
|---|---|
| [combat-architecture-node.json](game/measurements/combat-architecture-node.json)、[combat-architecture-replay.json](game/measurements/combat-architecture-replay.json) | 结算拆分后的 CPU 与固定种子回放 → [战斗架构](game/combat-architecture.md) |
| [attack-encounters-node.json](game/measurements/attack-encounters-node.json)、[attack-encounters-workers-node.json](game/measurements/attack-encounters-workers-node.json) | 攻击遮挡/遭遇布局阶段的模拟和弹道查询 → [地形通行](game/terrain-navigation.md) |
| [combat-balance.json](game/measurements/combat-balance.json) | 参考装备下的数值矩阵 → [数值平衡](game/combat-balance.md) |
| [horizon-damage-browser.json](game/measurements/horizon-damage-browser.json)、[horizon-balance-node.json](game/measurements/horizon-balance-node.json) | 远景、飘字阶段的浏览器和 CPU 测量 → [环境资产](game/environment-assets.md)、[技能与效果](game/skills-and-effects.md) |
| [minimap-fog-browser.json](game/measurements/minimap-fog-browser.json)、[minimap-drag-browser.json](game/measurements/minimap-drag-browser.json) | 第一轮迷雾函数回放及第二轮实际开发页面鼠标拖动对比 → [UI 性能](game/ui-performance.md)、[探索与家园](game/exploration-and-homestead.md) |
| [enemy-view-node.json](game/measurements/enemy-view-node.json)、[enemy-view-workers-node.json](game/measurements/enemy-view-workers-node.json) | 怪物视距阶段的 CPU 与查询测量 → [模拟与 AI](game/simulation-and-ai.md) |
| [skills-node.json](game/measurements/skills-node.json)、[patrol-node.json](game/measurements/patrol-node.json)、[spatial-node.json](game/measurements/spatial-node.json) | 技能、巡逻、空间查询阶段 → [技能与效果](game/skills-and-effects.md)、[模拟与 AI](game/simulation-and-ai.md) |
| [workers-node.json](game/measurements/workers-node.json)、[review-node.json](game/measurements/review-node.json) | 早期线程与项目复核 → [应用集成](app-development.md)、[模拟与 AI](game/simulation-and-ai.md) |

<a id="assets"></a>

## 8. 资产来源与许可

| 文件 | 用途与边界 |
|---|---|
| [LICENSE](../LICENSE) | 项目代码许可；不替代各素材包自带许可 |
| [scripts/vendor/README.md](../scripts/vendor/README.md) | EZ-Tree 离线生成器固定版本与复现方式；[上游许可](../scripts/vendor/ez-tree-LICENSE.txt) |
| [texture-attribution.md](../apps/survivor/assets/environment/texture-attribution.md) | 环境资源保留的上游纹理归属记录，不是游戏当前全部加载纹理清单 |
| [技能素材来源](../apps/survivor/assets/effects/sources.json)、[Kenney 原始许可](../apps/survivor/assets/effects/kenney-LICENSE.txt) | 六张粒子输入的下载地址、包/文件哈希和 CC0 许可；构建及消费者归[技能与效果](game/skills-and-effects.md) |
| [家园模型来源](../apps/survivor/assets/homestead/sources.json)、[Quaternius 原始许可](../apps/survivor/assets/homestead/License.txt) | 成品旅店、铁匠铺、住宅、水井的原始 OBJ/MTL 与逐文件哈希；离线合并和碰撞尺寸归[环境资产](game/environment-assets.md) |
| [actor-assets.md](game/actor-assets.md)、[environment-assets.md](game/environment-assets.md) | 当前采用的输入、处理流程与许可边界；源文件在[游戏 assets](../apps/survivor/assets/) |

<a id="maintenance"></a>

## 9. 文档维护约定

- 本页维护结构、职责、关系图和**直达链接**；不再创建二级目录索引、独立协作指南或只有跳转作用的文档。
- 具体设计写清负责范围、当前行为、实现位置和验证方式；相邻领域引用主要设计，避免复制完整规则。计划明确标为未实现，测量说明环境与适用范围，不将测试数量作为长期合同。
- 正文顶部返回本页的所属章节。新增、移动、合并或删除文档时同步本页及引用；被替代且无证据用途的内容清理，原始许可和仍被决策引用的证据保留。
- `npm run check:docs` 根据 Git 清单检查本地 Markdown 链接、标题锚点和 `docs/` 可达性，包含未被忽略的新文件。支持标准 Markdown 行内/引用式链接、`#` 标题及显式 HTML 锚点；代码示例跳过，忽略目录里的本地文件不能冒充已提交资料。
- 文档检查与 `git diff --check` 是基础验证；Mermaid 图、目录完整性、设计与代码语义，以及外部资源许可仍需复核。开发与提交基准统一遵守 AGENTS。

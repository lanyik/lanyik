# 游戏设计索引

源码分层见 [应用目录](../../apps/survivor/README.md)，跨应用的基础设施见 [文档总入口](../README.md)。先读所属合同，再检查对应代码与调用方；一个行为的完整规则只在主要合同维护。

## 当前合同与实现位置

以下模块名均位于 `apps/survivor/src/`，用于定位职责，不是另一个文件清单。

| 主要合同 | 负责的规则与实现入口 |
|---|---|
| [战斗架构](combat-architecture.md) | 结算与表现分离、扩展边界；`CombatResolution`、`CombatVitality`、`CombatEvents`、`StatusSystem`、`CombatRewards` |
| [模拟与 AI](simulation-and-ai.md) | ECS 身份、系统顺序、怪物决策及 Worker；`CombatWorld`、敌人系统、`worker/` |
| [战斗与成长](combat-and-progression.md) | 现有战斗循环、区域人口、等级与属性；`CombatStats`、`EnemyDefinitions`、`RegionalWorld`、`CombatSimulation` |
| [数值平衡](combat-balance.md) | 期望伤害、生存与怪物成长；平衡测试和报告脚本 |
| [技能与效果](skills-and-effects.md) | 技能执行、怪物特性和反馈；`Skills`、`SkillSystem`、`CombatEffects`、`CombatFeedback`、表现层 |
| [物品与装备](items.md) | 道具身份、背包、穿戴与比较；`ItemDefinition`、`InventoryItem`、`Inventory`、`Equipment`、`EquipmentEvaluation` |
| [打造与灵境](crafting-and-spirit.md) | 词条、宝珠、回收、打造和灵魂；`Crafting`、`AffixItem`、`Orbs`、`Recycling`、`SpiritRealm` |
| [角色存档](character-saves.md) | 角色检查点、槽位、灵魂独立存储；`CharacterCheckpoint`、`CharacterRepository`、`SpiritRepository`、`StartScreen` |
| [地形通行](terrain-navigation.md) | 坡度、碰撞、滑移与遭遇导航；`CombatTerrain`、`SurfaceMotion`、`EncounterNavigation`、`ProceduralCombatTerrain` |
| [应用集成](../app-development.md) | 会话、输入、暂停、地图适配与日志；`CombatSession`、`HexCombatView`、`HexRegionMap`、`RuntimeLog` |
| [界面设计](interface-design.md) | 页面信息、操作、背包拖拽与响应布局；React 组件和样式 |
| [UI 性能](ui-performance.md) | 快照发布、虚拟网格、合批和交互基准；`VirtualItemGrid`、`ShareSnapshot` 和 UI 基准 |
| [角色资产](actor-assets.md) | 模型、动作映射、材质和预算；`ActorModels`、`ActorPose`、资产与生成脚本 |
| [环境资产](environment-assets.md) | 植被、地表、天空、雾与遮挡；`CombatEnvironment`、资产与生成脚本 |
| [视觉总览](visual-modernization.md) | 免费资产约束与整体美术方向；细节以角色、环境和界面合同为准 |

## 当前系统与后续扩展

现有固定步长 ECS、统一结算、战斗事实流、有限状态效果、装备和角色存档是已实现基础。完整技能树、通用 Buff 叠层、被动触发、套装、连携、任务主线和剧情引导仍须按 [开发优先级](development-priorities.md) 逐项落地；扩展先遵循 [战斗架构](combat-architecture.md)，不要在表现层直接改战斗结果。

战斗实体由现有 ECS 统一管理；不要另建一套战斗实体身份。任务和存档的长期身份与战斗槽位不同，具体规则需在实现对应系统时定义。地图流式加载和寻路服务属于基础库，玩法状态属于游戏。

## 验证与历史

- [测试策略](../testing.md)：根据变更选择单元、浏览器、生命周期或性能验证。
- [游戏测量记录](measurements/README.md)：基准输入、历史结果与当前合同的对应关系。
- [历史调研](../archive/README.md)：保留取舍依据，不作为当前资产选择指令。
- [玩法概念](../../游戏想法.md)：面向玩家的循环和范围；实现细节以上表合同为准。

# 项目文档入口

仓库包含 `three-hex-map` 地图基础库和「荒原 Survivor」游戏。它们共享地图服务，但战斗、物品和角色存档属于游戏；查阅设计时先确认改动所属层。

## 从这里开始

| 任务 | 阅读顺序 |
|---|---|
| 安装、运行与操作 | [根 README](../README.zh-CN.md) → [游戏目录说明](../apps/survivor/README.md) |
| 开发、清理或评审 | [协作指南](../CONTRIBUTING.md) → 所属模块合同 → [验证选择](testing.md) |
| 扩展技能、Buff、被动、套装或任务 | [游戏设计索引](game/README.md) → [战斗架构](game/combat-architecture.md) → 对应玩法合同 → [开发优先级](game/development-priorities.md) |
| 修改地图与渲染基础设施 | [基础库目录说明](../src/README.md) → 下表对应合同 → [测试策略](testing.md) |
| 查阅历史决策和测量 | [历史归档](archive/README.md)、[游戏测量记录](game/measurements/README.md)、[基础库证据](evidence/README.md) |

## 当前实现与设计归属

| 领域 | 合同与边界 |
|---|---|
| 游戏集成与玩法 | [应用边界](app-development.md)、[游戏设计索引](game/README.md)、[玩法概念](../游戏想法.md) |
| 生命周期、调度与资源预算 | [基础设施](foundation-infrastructure.md)、[v1 冻结合同](foundation-v1-freeze.md) |
| 包入口和依赖方向 | [包边界](package-boundaries.md)、[源码目录](../src/README.md) |
| 基础库事件 | [事件合同](event-contracts.md)；游戏事实流另见 [CombatEvents](game/combat-architecture.md) |
| 地图渲染、加载与驻留 | [渲染与流式加载](render-streaming.md)、[渲染会话控制器](render-world-controller.md)、[区块驻留](chunk-residency.md) |
| 地形生成与水系 | [世界风格生成](world-style-generation-v1.md)、[粗粒度排水网络决策](decisions/coarse-drainage-water-network.md) |
| 持久化 | [地图增量](world-delta-persistence.md)；游戏另有 [角色存档](game/character-saves.md) |
| 导航 | [基础库分层寻路](hierarchical-pathfinding.md)、[游戏地形通行](game/terrain-navigation.md) |
| 验证与性能决策 | [测试策略](testing.md)、[优化门槛](optimization-gates.md)、[渲染后端评估](render-backend-evaluation.md) |

## 文档如何使用

- **实现合同**说明当前代码的行为、边界和验证方法；改动必须同步所属合同。游戏的具体归属见 [游戏索引](game/README.md)。
- **后续计划**集中在 [开发优先级](game/development-priorities.md)，其中未完成的内容不能当作已实现功能。
- **冻结合同和设计决策**仍约束当前实现；日期较早不代表失效。
- **归档和测量**保留当时的结论、条件与证据，不代表当前性能或资产推荐。发布变化记入 [CHANGELOG](../CHANGELOG.md)。

新增文档应从本索引或所属子索引可达。`npm run check:docs` 检查仓库内 Markdown 链接、标题锚点和 `docs/` 文档可达性；代码与设计的语义一致性仍需结合调用关系和测试审查。维护规则见 [协作指南](../CONTRIBUTING.md)。

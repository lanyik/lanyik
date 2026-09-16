# 地图基础库源码

导航：[总导航 · 地图基础库](../docs/README.md#foundation) · [按任务阅读](../docs/README.md#routes)

本页只说明基础库源码分层。公开使用见 [根 README](../README.md)，开发遵守 [协作指南](../CONTRIBUTING.md)，具体设计可从[总导航·地图基础库](../docs/README.md#foundation)直接打开。Survivor 的战斗和成长逻辑归[游戏设计](../docs/README.md#game)。

## 模块归属

| 源码区域 | 职责与合同 |
|---|---|
| `index.ts`、可选子路径入口 | [包边界与公开导出](../docs/package-boundaries.md) |
| `HexMap.ts`、`HexMapOptions.ts` | [基础设施集成](../docs/foundation-infrastructure.md)、[冻结边界](../docs/foundation-v1-freeze.md) |
| `runtime/` | 生命周期、任务调度、资源预算与恢复，见 [基础设施](../docs/foundation-infrastructure.md) |
| `rendering/`、`objects/`、`shaders/` | [渲染与流式加载](../docs/render-streaming.md)、[渲染会话控制器](../docs/render-world-controller.md) |
| `world/` 中的生成、表面、水系与概览 | [世界风格生成](../docs/world-style-generation-v1.md) |
| `WorldSource`、`WorldStreamer`、`WorldGenerator`、区块驻留 | [流式加载](../docs/render-streaming.md)、[区块驻留](../docs/chunk-residency.md) |
| 世界编辑、增量与持久化 | [地图增量持久化](../docs/world-delta-persistence.md)、[基础设施](../docs/foundation-infrastructure.md) |
| 分层寻路、路径辅助与拓扑 | [分层寻路](../docs/hierarchical-pathfinding.md) |
| `EventEmitter`、`EventMaps`、`gameengine.ts`、`objects/Unit.ts` | [事件合同](../docs/event-contracts.md) |

测试按 `tests/` 下的领域目录维护，选择规则见 [测试策略](../docs/testing.md)。公开 API 可能只由外部应用调用，不能按仓库内引用数量直接删除；新增导出同时维护包合同和类型检查。

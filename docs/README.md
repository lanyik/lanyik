# 文档索引

当前架构以 [世界表面与渲染基建 v2](./surface-render-foundation-v2.md) 为权威设计文档。代码、格式、测试和基准已经完成第 1–8 步的一次性生产切换。

| 主题 | 当前文档 |
|---|---|
| 语义、水文、编译、GPU 与渲染总架构 | [surface-render-foundation-v2.md](./surface-render-foundation-v2.md) |
| 生产流送与渲染会话 | [render-streaming.md](./render-streaming.md) |
| 编辑与存档 | [world-delta-persistence.md](./world-delta-persistence.md) |
| 包边界 | [package-boundaries.md](./package-boundaries.md) |
| 模拟 | [world-simulation.md](./world-simulation.md) |
| 验收策略 | [testing.md](./testing.md) |

`world-style-generation-v1.md` 与 `foundation-v1-freeze.md` 只保留已删除架构的迁移背景，不描述可调用 API。旧 controller、residency、campaign 和 hierarchical pathfinding 文档已经删除；新代码不得从历史记录恢复 packed tile、12×12 TerrainMesh、字符串水体 modifier 或双生产路径。

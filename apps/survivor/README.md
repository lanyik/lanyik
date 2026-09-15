# 荒原 Survivor 应用

安装与环境要求见 [根 README](../../README.zh-CN.md)。在仓库根执行 `npm ci` 后，用 `run.bat` 或 `npm run app:dev` 启动。

修改前先读 [游戏设计索引](../../docs/game/README.md)；当前实现与后续计划分别由领域合同和 [开发优先级](../../docs/game/development-priorities.md) 维护。

## 源码分层

| 目录 | 职责 | 所属设计 |
|---|---|---|
| [src/core/](src/core/) | 固定步长模拟、ECS、战斗、物品和成长规则 | [战斗架构](../../docs/game/combat-architecture.md)、[玩法索引](../../docs/game/README.md) |
| [src/app/](src/app/) | 会话、输入命令、快照、存档和生命周期 | [应用集成](../../docs/app-development.md)、[角色存档](../../docs/game/character-saves.md) |
| [src/worker/](src/worker/) | Worker 协议及执行入口 | [模拟与 AI](../../docs/game/simulation-and-ai.md) |
| [src/adapters/](src/adapters/) | 游戏所需的地图、通行和区域适配 | [地形通行](../../docs/game/terrain-navigation.md) |
| [src/presentation/](src/presentation/) | React UI、场景、动画与 HUD | [界面设计](../../docs/game/interface-design.md)、[UI 性能](../../docs/game/ui-performance.md)、[视觉总览](../../docs/game/visual-modernization.md) |
| [assets/](assets/) | 模型、贴图等生成输入 | [角色资产](../../docs/game/actor-assets.md)、[环境资产](../../docs/game/environment-assets.md) |
| [tests/](tests/) | 领域单元测试与浏览器集成测试 | [验证选择](../../docs/testing.md) |

`core` 不依赖 React、Three.js、DOM、Worker 或地图基础库。主线程提交命令，模拟产出状态与战斗事实，表现层消费结果；具体结算归属和 ECS 边界见 [战斗架构](../../docs/game/combat-architecture.md)。地图基础库不持有游戏角色和战斗状态。

## 开发与验证

从仓库根运行 `npm run test:app` 验证游戏规则，`npm run build --workspace @preview/survivor` 验证应用类型与打包。首次安装，或修改基础库、资产输入后，先运行 `npm run app:prepare` 生成依赖；准备、构建和消费同一产物的测试按顺序执行。

生成脚本管理的 `.assets/` 资源由 Vite 的 `publicDir` 提供，不直接手改；修改源资产或脚本并重新生成。交互、线程、生命周期和性能变更还有各自的浏览器或基准门槛，见 [测试策略](../../docs/testing.md)。

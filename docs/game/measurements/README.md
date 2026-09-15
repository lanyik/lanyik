# 游戏测量记录

这些 JSON 是特定版本、输入与运行环境下的原始记录，保留用于解释演进和复核。重新验证应使用 [测试策略](../../testing.md) 的当前命令及所属合同的场景与预算；不要将历史通过结果或测试数量当作当前保证。

| 记录 | 用途与主要合同 |
|---|---|
| [combat-architecture-node.json](combat-architecture-node.json)、[combat-architecture-replay.json](combat-architecture-replay.json) | 结算分离后的 CPU 与固定种子回放；[战斗架构](../combat-architecture.md) |
| [attack-encounters-node.json](attack-encounters-node.json)、[attack-encounters-workers-node.json](attack-encounters-workers-node.json) | 攻击遮挡与遭遇布局阶段的模拟、弹道查询 Worker 记录；[地形通行](../terrain-navigation.md) |
| [combat-balance.json](combat-balance.json) | 数值矩阵报告；更新方法见 [数值平衡](../combat-balance.md) |
| [horizon-damage-browser.json](horizon-damage-browser.json)、[horizon-balance-node.json](horizon-balance-node.json) | 视距与伤害反馈阶段的浏览器和 Node 测量；[环境资产](../environment-assets.md)、[数值平衡](../combat-balance.md) |
| [enemy-view-node.json](enemy-view-node.json)、[enemy-view-workers-node.json](enemy-view-workers-node.json) | 怪物视距调整阶段的 CPU 与 Worker 记录；[模拟与 AI](../simulation-and-ai.md) |
| [spatial-node.json](spatial-node.json)、[patrol-node.json](patrol-node.json)、[skills-node.json](skills-node.json) | 空间查询、巡逻和技能接入阶段的 CPU 记录；[模拟与 AI](../simulation-and-ai.md)、[技能与效果](../skills-and-effects.md) |
| [workers-node.json](workers-node.json)、[review-node.json](review-node.json) | 早期 Worker 与项目复核测量；[应用集成](../../app-development.md) |

各记录的人口规模、冷启动、存活时间和采样条件可能不同。Node 步进时间、Worker 往返与浏览器帧时间不是同一个指标，不能直接据此承诺目标设备帧率。返回 [游戏设计索引](../README.md)。

# 架构收敛评估与实施记录

本文复核“渲染主链路接近局部最优，但运行时模块组合后所有权、版本与调度权分散”的判断，并记录本轮采取的方案、证据与继续投入的门槛。

## 结论

原判断总体成立，但不应把所有长期能力一次性加入当前库：

- Packed Chunk、Sparse Store、12x12 Render Chunk、CPU culling、Transferable 植被与 GPU range 合并继续保留。
- WebGPU 迁移仍缺收益证据，不进入本轮。
- Chunk 所有权、Delta 批量写入、Portal 爆炸和错误的单信号自适应属于已经能复现的架构问题，应立即修正。
- 多层 Continent 图、完整 ECS/SoA、WAL/回滚/多人自动合并属于负载和权威模型驱动的能力；没有真实玩法数据时直接实现，容易把错误假设固化为公共 API。

## 分项决策

| 项目 | 可行性/有效性判断 | 本轮结果 | 后续门槛 |
|---|---|---|---|
| Chunk 所有权 | 高优先级且可独立闭合 | 引入 source 级 `ChunkResidencyCoordinator`；Streamer/Pathfinder 使用独立、幂等 lease，并发加载去重，最后一个 lease 才释放底层 Chunk | 新增消费者必须通过同一 coordinator；不得直接借用 `hasChunk()` 的数据 |
| `HexMap` 职责 | 全量搬迁风险高，适合按 seam 拆 | 第一层 `RenderWorldController` 已拥有 source/residency/streamer 会话；渲染回调仍留在 `HexMap` | 后续把 Layer Registry、FrameTask、LOD 与遥测迁入 Controller 时保持现有回调契约 |
| Delta Store | 批量重复序列化可复现；CAS 可在本地事务内正确实现 | `putChunkDelta()` 按 Chunk 合并一次、revision 增一次、IndexedDB 读写事务一次；CAS 与写入原子化；修复重开存档首次写入覆盖旧 entries | 只有出现服务器权威状态后才定义多人 merge；只有恢复时间/写放大超标后才引入 WAL、压缩和快照 |
| 分层寻路 | P² 摘要是当前明确瓶颈，多层图尚无必要 | 连续入口默认压成两个对称代表；开放 12x12 Chunk 从 94 Portal/8,836 矩阵格降到 10/100；25 次构建约 385ms 降到 60ms。加入加权成本、movement type、terrain/delta revision，并修复终点 Chunk 过早结束 | trace 显示单次搜索访问过多 Chunk 摘要后再加 Region/Continent；版本不匹配时必须由 NavigationService 重建/拉取，不能只删除后重建旧基础摘要 |
| Simulation Runtime | 调度内核成立；十万活跃泛型对象不适合作最终模型 | 统计改为增量计数，Chunk 顺序不再每帧排序；5,000 冷 Chunk 插入由约 164ms 降到约 10–13ms。基准仍显示 100,000 泛型实体空系统 tick 约 70–80ms | 城市/军队/经济系统接入后测组件访问、事件稀疏度和快照写放大；再决定 SoA/ECS、时间轮、命令日志与回滚，而不是让通用 Runtime 猜数据布局 |
| Adaptive Streaming | 单一 frame time 无法归因，原控制矩阵无效 | 分成 main-thread/GPU/Worker 三个压力域：FrameTask 只控挂载预算，GPU 只控植被/LOD，显式 contention 才控 Worker；队列繁忙只做遥测 | 补 WebGL GPU timer query 和真实 Chunk-to-visible 时间；在设备矩阵上校准阈值 |
| Worker 竞争 | 非抢占植被阻塞中心地形的风险真实；拆池不是唯一解 | 共享池默认保留一个 terrain 槽位；单 Worker 不损失利用率；队列、忙碌数和耗时 EMA 按任务类型拆分 | 高速移动回放下 terrain p95 仍不达标时，再比较拆池、植被分片或 Worker 内协作取消 |
| 发布体积 | 子路径可行且比仅依赖 tree-shaking 更可靠 | 新增 `/persistence`、`/pathfinding`、`/simulation` 的 ESM/CJS/types 入口；全局包不再公开寻路和模拟。2026-08-26 验证构建的根 ESM 未压缩体积为 643.51KB | 若要把 IndexedDB 实现也移出 core，必须先把 `cache: true`/`deltaStore: true` 改成异步 provider/factory，不能只改 exports |

## 当前成熟度

| 部分 | 本轮后评估 |
|---|---:|
| 世界生成与稀疏驻留 | 9/10 |
| WebGL 渲染与 GPU 资源控制 | 8.5/10 |
| 多模块 Chunk 所有权 | 8.5/10 |
| Worker 与主线程调度 | 8.5/10 |
| Delta 本地持久化 | 8/10 |
| 分层寻路（Chunk 层） | 8/10 |
| Render Controller 边界 | 7/10 |
| 自适应控制 | 7.5/10（缺 GPU/设备矩阵） |
| 模拟内核 | 7/10（最终数据模型待真实负载） |

## 不应跳过的验证

1. 所有改动必须通过类型检查、单元测试、库构建和热路径基准。
2. 高速相机回放记录 terrain 请求到 resident/visible 的 p50/p95/p99、按类型 Worker 占用和丢弃的植被结果。
3. 导航按 movement type 记录摘要命中率、访问 Chunk 数、Portal 数和 revision mismatch；不允许静默使用旧摘要。
4. 模拟按真实系统分别记录活跃实体数、每 tick 访问组件、事件密度、快照字节和恢复时间，再选择 ECS 或事件队列。
5. 自适应阈值至少覆盖集显、独显、低核移动端和后台/降频场景；没有 GPU timing 时保持 GPU quality，不从总 frame time 猜测。

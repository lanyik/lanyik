# Runtime foundation architecture

当前运行时基础设施把“世界渲染能跑”提升为“可替换、可恢复、资源有界、可验收”。核心原则不是让所有子系统使用同一个执行循环，而是让它们共享同一组所有权、世代、预算、取消与验收语义。冻结边界见 [foundation-v1-freeze.md](./foundation-v1-freeze.md)，测试分层与执行策略见 [testing.md](./testing.md)。

## 1. 生命周期与故障恢复

`LifecycleScope` 是一次可替换异步会话的所有权边界。每个 scope 有唯一 generation、单一 `AbortSignal`、在途任务集合和晚到发布闸门。

- `close()` 先同步广播取消，再等待已登记任务 drain。通用 scope 可选择等待上限；render-world 默认最多等待 15 秒，超时任务会被隔离并通过 `detachedTasks` / `drainTimedOut` 上报，不能让 `disposeAsync()` 永久挂起。
- `publish()` 只允许 active generation 对外发布；旧世界结果会被拒绝并计数。
- `RenderWorldController` 用一个 scope 同时拥有 source、residency 和 streamer。
- `WorldStreamer.settled` 等待销毁时仍在途的请求完成取消和 lease 释放。
- `HexMap.disposeAsync()` 提供真正可等待的销毁边界；同步 `dispose()` 仍保持兼容。
- render-layer host 暴露当前世界的 `AbortSignal`；atlas fetch、Worker、植被准备和编辑刷新都受同一世代闸门约束。

世界切换的顺序固定为：关闭旧 scope → 取消 streamer/Worker 请求 → 反向卸载渲染层 → 释放 source → 等待旧会话 drain。清理回调不经过发布闸门，因为旧资源即使在 closing 状态也必须被释放。

## 2. 统一持久化边界

`GenerationCheckpointCoordinator` 是权威存档入口。每次存档先在应用提供的
`withWorldState(operation)` 互斥边界内捕获全部参与者并复制快照，再写不可变 staging，
读回校验 checksum，最后以单次 CAS manifest 事务公开整个世代。manifest 是唯一提交点；
崩溃前后只能选中完整的旧世代或新世代。

该边界必须排除模拟推进、地形编辑和其他权威状态变更，直到全部异步 capture 完成。
仅把多个 capture 放进 `Promise.all`，或给记录分配同一 saveId，不能保证同一逻辑时刻。
恢复在全部记录校验通过后，也通过同一互斥边界应用快照；参与者失败应中止恢复，
不能把互斥误认为跨 store 的回滚事务。staging 写入不占用捕获锁，允许游戏继续运行。
缺少边界、未等待回调或重复调用均显式失败，不推断应用已经同步。

应用负责在初始恢复、串行操作与关闭过程中持有该边界；关闭时拒绝新操作。
现有 `createWorldDeltaGenerationParticipant()` 提供 terrain delta 参与者；
应用通过 `GenerationCheckpointParticipant` 接入自身状态，可重建 world cache 不进入权威存档。
存档校验完整 world descriptor、参与者版本和快照 checksum，保留上一完整世代，
并通过原子垃圾回收删除未引用的 staging。

`CheckpointCoordinator` 与 `createFlushCheckpointParticipant()` 是独立的 journal/flush
协议，代码仍然导出，但不具备严格的同一时刻快照保证，不用于游戏的权威存档。
协调器位于独立的 `three-hex-map/persistence` 入口，不进入浏览器渲染主包；这让存档协议可以独立演进，也避免只使用地图渲染的应用承担 IndexedDB/journal 代码体积。

## 3. 真实资源预算

`ResourceBudgetLedger` 以保留缓冲区和预计上传字节做 admission/accounting，区块数量仍作为独立上限。这些计数不是进程堆占用或驱动实际 VRAM：

- 硬维度：`cpuBytes`、`gpuBytes`。
- 诊断维度：`geometryBytes`、`textureBytes`、`modelBytes`。
- BufferGeometry 分开计算 CPU backing store 与 Three.js 实际 attribute/index upload；interleaved buffer 只上传一次，不同 BufferAttribute 即使共享 ArrayBuffer 也按独立 GPU buffer 计费。
- Object3D 估算会遍历 geometry、实例矩阵/颜色、骨骼/实例 morph 纹理、material、shader uniforms、纹理面与 mip 层。实例缓冲按分配容量计费，降低 `InstancedMesh.count` 不代表释放内存；同一次估算中，共享 CPU backing buffer 与共享 Three.js 上传对象分别去重。自定义渲染层可用 `resourceCost` 覆盖共享模型/纹理的保守估值。

内置区块和 `ModelAssetCache` 使用 `ResourceAllocation` 引用同一账本中的资源。
CPU 按 backing buffer/纹理 source、GPU 按 attribute/interleaved buffer/纹理对象去重；
只有最后一个引用释放后才扣除共享资源。GPU 驻留淘汰只释放 GPU 引用，CPU 引用仍保留。
预算拒绝不会改变引用计数或已有 reservation。分配的 identity 与 cost 必须保持不变，
重新分配应提供新 identity；尚未加载的零字节纹理不建立分配引用。
单个账户的 stats 对账户内去重，整个地图再次跨账户去重，所以不能将各账户的
引用字节简单相加。手工 `resourceCost` 覆盖仍由自定义层负责共享资源的所有权。

植被通过独立的 `vegetation-cpu` 账户补足渲染图之外的所有权：Worker 返回的三档布局、
草地贴地高度/雾属性、森林贴地矩阵及三档预处理模型都按 backing buffer 引用计费。
准备请求、草地和森林可以共同引用同一布局；取消或卸载一个所有者不会提前扣除仍被其他
所有者使用的数据。当前 LOD 与有界 source 驻留所需的原始布局、共享模型属于必要输入；
旧的派生 LOD 则必须通过预算 admission 才能继续缓存，超额时可重建缓存优先释放。
原始布局的数量受 source 驻留限制，字节超额明确进入自适应密度控制；此处不承诺任意密度、
任意必需工作集都能装入给定字节上限。Worker 临时堆、JS 对象本身和浏览器/驱动开销仍不计量。

森林实例矩阵和颜色在首次激活时分配，同一渲染区块的模型部件及环绕副本共享一套缓冲。
CPU 淘汰会将全部副本切换为空缓冲；草地也会解除全部副本对已释放几何的引用。
GPU 淘汰保持 CPU 所有权，字段销毁则清空布局、LOD、雾状态与子对象引用。
缓存到期回收独立于可见性重算，相机静止时仍按 grace frame 执行；新增字节压力会重新检查
当前缓存，而不会因相机没有移动而忽略。

`WorldChunkScheduler` 同时保留逻辑区块上限和字节上限。非可见驻留只要超过任一字节预算就立即按 LRU 淘汰，不等待 grace frame。当前帧必需的 visible working set 被标为 pinned；若它自身大于预算，不会错误销毁正在绘制的对象，而是通过 `cpuBudgetExceededBytes` / `gpuBudgetExceededBytes` 暴露不可避免的压力，交给自适应 LOD/密度降级。默认上限为 CPU 384 MiB、GPU 256 MiB，可通过 `cpuChunkCacheBytes` / `gpuChunkCacheBytes` 配置。

`HexMap.resourceBudget` 只暴露不可变诊断视图；后续单位、建筑和特效系统通过 `HexMap.createResourceAccount(label)` 获取隔离账户。账户返回可更新、可释放的 reservation handle，同名局部 key 不会跨账户冲突；账户或地图销毁时，其全部 reservation 会统一失效和回收。未通过 admission 的非关键资源必须降级或延后，不能调用内部 `forceReserve()` 绕开硬预算。

区块账户使用内部命名空间，不能覆盖同名的单位/建筑 reservation。可见 working set 的不可避免超额会直接输入自适应控制器，持续超额将降低 LOD 距离、植被密度和分辨率，而不只停留在诊断数字。

## 4. 调度与背压

`PriorityTaskQueue` 统一五类 lane：`critical`、`interactive`、`visible`、`prefetch`、`background`。每个任务同时有 priority、weight、AbortSignal 和入队时间。

- 超过任务数或总 weight 时，先丢弃最低重要性的工作。
- 单个任务若已超过整条队列的 weight 上限，会在修改队列前直接拒绝，不能先淘汰其他任务再自我失败。
- keyed work 自动合并，只保留最新版本。
- 等待超过 starvation window 后逐级晋升，background 最终不会饿死。
- starvation 只影响执行选择，不影响背压淘汰；暂停很久的后台任务不会因此挤掉刚到的 critical 工作。
- 帧挂载和 Worker pool 已使用同一实现；Worker 仍保留 terrain capacity reservation。

`RuntimeWorkCoordinator` 是联邦调度面：frame、worker、streaming 保留不同执行器，同时向一个聚合统计面报告 backlog、weight、busy、最老任务、shed 和 starvation。应用可通过 `registerTelemetry()` 登记自有执行器的压力；协调器不提供经营时钟或业务结算。销毁 coordinator 会取消其管理的排队任务；世界切换时旧 worker/streaming domain 会注销，统计本身不会泄漏。

内存型 checkpoint journal、generation stage/manifest 与
world delta 存储在 `dispose()` 时同步清空其 Map。`dispose()` 因而既是拒绝后续
访问的状态边界，也是确定性的内存释放边界；不依赖所有外部引用同时被 GC。

`WebGlGpuTimer` 使用 `EXT_disjoint_timer_query_webgl2` 异步查询真实 GPU elapsed time。查询只在后续帧 poll，不调用 `finish()`，disjoint 样本会丢弃，并限制最多四个 outstanding query。统计同时包含样本年龄、查询上限和饱和帧；扩展可用但查询长期堵满时，自适应控制器会把它视为明确的 GPU 落后信号，而不是因拿不到新样本而失明。

## 5. 模块边界

- `HexMapRendererHost`：WebGLRenderer、Scene、Camera、lights、Sky、GPU timer 和 context-bound dispose。
- `HexMapInteractionController`：DOM 输入监听、焦点所有权、WASD 移动和解析式 tile picking。
- `WorldChunkMountQueue`：连接流式驻留与帧挂载，并对因背压拒绝的可见挂载做有界重试。
- `RenderWorldController`：一次世界渲染会话的 source/residency/streamer/lifecycle。
- `WorldLoadPlan`：在替换现有会话之前，一次性校验并解析初始坐标、驻留预算、预测参数、自适应控制器和 surface view；规划失败会释放尚未发布的数据源。
- `WorldEditingFacade`：编辑校验、坐标 canonicalization、source mutation 和 visual dirty set。
- `HexMapOptions`：默认值派生、运行时校验及世界加载配置契约。
- `HexMap`：保留公开兼容 API 和跨边界编排；source、streamer 与 residency 只从 `RenderWorldController` 读取，不再维护平行会话状态。

自定义 render layer 仍通过 `WorldRenderLayer` 接口接入；应在 activation 中报告额外纹理/模型成本，并让所有异步工作绑定当前 render-world lifecycle。

## 6. 稳定性验收

硬指标已进入自动化：

- 同 seed/chunk 输入产生同 checksum，且不依赖请求顺序。
- checkpoint 中途故障后重启，最终状态等于最后提交 generation。
- checkpoint prepare 失败后，同进程重试也会回滚旧 token 并从全新 generation 捕获。
- 固定种子的资源/队列 churn 中 admission 始终有界。
- 超重任务、后台 starvation、资源账户销毁、GPU query 饱和和不响应取消的生命周期均有独立回归测试。
- E2E 连续快速替换世界时，会话 drain、Worker backlog、WebGL geometry/texture 和 GPU query 数保持有界。
- 定时 CI 运行可配置的长时间浏览器 soak（默认 500 个世界世代），混合稳态替换和取消突发，并持续采样生命周期、调度域、WebGL 资源和强制 GC 后的 JS heap 上界。
- benchmark gate 对生成、植被、GPU range 合并和导航摘要设置宽松但强制的回归上限；每项先预热再采集五个样本，以中位数判定，并输出 Node/V8、CPU、样本范围与离散度。

完整命令和各层适用范围统一维护在 [testing.md](./testing.md)，不在架构文档中重复容易漂移的测试数量或命令清单。

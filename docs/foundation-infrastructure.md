# 基础设施、持久化与事件合同

导航：[文档索引](README.md#foundation)

本页拥有生命周期、租约、预算、调度、通用世界存储与类型化通知。游戏状态属于应用，[角色检查点和永久灵境](game/character-saves.md)有独立存储边界，不等于地图增量或世代存档。公开入口归[应用与包边界](app-development.md#包与构建入口)，生成版本归[世界生成](world-style-generation-v1.md#编辑刷新与版本)。

## 修改入口

| 领域 | 代码入口 | 联查边界 |
|---|---|---|
| 生命周期与会话 | [runtime](../src/runtime/)、[RenderWorldController](../src/rendering/RenderWorldController.ts) | 取消、迟到发布、挂载失败、重复关闭 |
| 区块租约 | [ChunkResidencyCoordinator](../src/world/ChunkResidencyCoordinator.ts) | 共享消费者、最后释放、源所有权 |
| 世代保存 | [GenerationCheckpointCoordinator](../src/persistence/GenerationCheckpointCoordinator.ts) | 状态屏障、CAS、取消、恢复与 GC |
| 稀疏编辑 | [WorldDeltaStore](../src/world/WorldDeltaStore.ts)、[WorldEditingFacade](../src/world/WorldEditingFacade.ts) | 批量原子性、revision、恢复与刷盘 |
| 事件 | [EventEmitter](../src/EventEmitter.ts)、[EventMaps](../src/EventMaps.ts) | 类型、同步派发、异常传播 |

## 生命周期与故障恢复

LifecycleScope 为一次可替换会话持有唯一 generation、AbortSignal、在途任务及发布闸门。close 先同步广播取消，再等待登记任务完成；等待上限和超时隔离必须可诊断，旧任务之后也不能发布。render-world 使用有界等待，不能让 disposeAsync 永久挂起。

RenderWorldController 同时拥有 source、residency、streamer 与 scope。摄像机、输入、拾取和公开 API 留在 HexMap，不能平行维护第二份会话。WorldLoadPlan 在替换前验证新输入，失败释放未发布源。世界切换先关闭旧 scope、取消请求并归还租约，再反向卸载图层、释放源并等待在途清理。清理不经过发布闸门。

HexMap.disposeAsync 是可等待关闭边界；同步 dispose 发起关闭。源销毁时已接收的 Worker 工作以 AbortError 拒绝；崩溃、非法协议等运行错误不能伪装成取消。旧成功结果只释放，旧错误也不能覆盖新世界。

### 渲染会话与区块租约

图层只能通过生命周期宿主的 addObject/removeObject 发布对象，不直接取得世界根节点。对象按层和区块登记，旧世代拒绝挂载；初始化失败、注销、卸载及世界替换均撤销对象。显式记录部分挂载状态，任何清理失败都继续释放剩余资源，最终聚合报告 WorldRenderLayerLifecycleError。

ChunkResidencyCoordinator 按 WorldSource 共享：同一规范区块合并加载，各消费者获得独立、幂等释放的 lease。取消一个等待者不能影响其他消费者，最后租约归还后才释放源区块。协调器计数，streamer/路径/应用各自决定需求期限；单个消费者不能销毁共享协调器，只有源所有者可连同源关闭。

WebGL 丢失/恢复由 HexMapRendererHost 独占，丢失时暂停绘制、挂载与 GPU 计时；恢复重建上传及查询并发布上下文世代。资源和失败细节归[渲染流送](render-streaming.md#场景照明与颜色输出)。

## 世代检查点

GenerationCheckpointCoordinator 的 manifest 是唯一提交点：在应用提供的 withWorldState 互斥边界内捕获所有参与者的独立快照，释放捕获锁后写不可变 staging、读回校验，最后 CAS 发布 manifest。每次使用唯一 saveId，不能混合不同保存的参与者。

状态边界必须恰好执行并等待一次回调，排除模拟推进、地形编辑及其他权威写入直到全部 capture 完成。Promise.all 或相同 saveId 不证明共同逻辑时刻。checkpoint 在串行队列外调用；若已持锁，hook 应校验并直接执行，不能递归排队。缺失、重复、提前返回或取消后迟到调用明确拒绝。

恢复先校验完整 descriptor、全部参与者版本与 checksum，再在同一边界应用快照；边界不提供跨 store 回滚。部分失败后应用必须视为不可用，直到显式重新恢复。可重建缓存不属于权威存档；游戏可实现自己的参与者，不把业务状态放进 HexMap。

- 发布前崩溃保留旧世代；发布后读取完整新世代。已提交记录不原地修改。
- manifest 保留当前及一个完整前代，不递归保留更早历史；竞争写入由 revision CAS 隔离。
- 发布事务重新验证引用的 staging；GC 在同一事务屏障读取活动 manifest 并删除未引用记录，防止校验后被抢删。
- 类型化 checksum 区分 Map、Set、Date、普通对象和数组。数组允许空洞，拒绝额外自有可枚举字段。格式常量以代码为准，旧格式/版本直接拒绝，不自动迁移。
- 完整世界身份不匹配即拒绝；版本变更同步[生成与描述符规则](world-style-generation-v1.md#编辑刷新与版本)，不能只更新 golden 值。

一次保存/恢复共享一个覆盖所有阶段的截止时间。取消阻止尚未进入的回调；已经进入的权威操作必须完成取消或提交收尾后才释放锁、结算 settled。存储提交前中止事务，提交后返回已提交结果，不能因之后的取消报告“未保存”。

地形参与者通过 atomic replaceWorld 替换全部增量，期间拒绝编辑。提交前取消保持旧持久与内存状态；提交后完成对应内存状态和 afterRestore，不能再加一次可失败的 flush。进入下一参与者前检查取消，不回滚已提交参与者；最后参与者已提交并收尾则恢复成功。

所有 staging 删除只经原子 GC，同时保护当前及前代。提交确认不明时不猜测、不直接删记录或做推测性重读。GC 在操作前或显式 collectGarbage 时执行，未引用记录过保留期再收集；提交后维护不能把成功变为失败。

## 世界增量

生成地形可重建，WorldDeltaStore 只持久化稀疏作者/玩法覆盖，数据库与生成缓存分离。经 source 选项注入的 store 归 source 销毁；直接使用 store 的调用者负责 flush 和关闭。

putChunkDelta 是必需写入口，单点也是一项批次。按区块合并，一次有效变化只增加一次 revision、执行一次事务；对象替换该坐标完整覆盖，null 删除。读写校验 chunkSize、区块范围及重复坐标；返回值深拷贝嵌套数据，不能绕过 setter 修改权威状态。

可变源必须支持原子 setTileOverrides，整个批次提交或完全不变；编辑门面在修改前拒绝缺少能力的源。相同覆盖、删除不存在项或最终状态不变是 no-op，不增长 revision。

expectedRevision=0 表示尚不存在；不匹配抛 WorldDeltaConflictError。IndexedDB 在同一事务检查并写入，不允许两个实例提交相同预期。删除末项仍保留空的带 revision 记录，防止 ABA；clear(worldId) 才删除该存档全部记录。

IndexedDB 是读取权威。loadChunk 等本实例排队写入后开新读事务，不用独立镜像掩盖其他实例提交。冲突后经过失败写入屏障，再读新 revision 并显式重试，不自动合并。

source 按区块串行写入，保留最新未确认 tile epoch。保存和退出前 await flushDeltas，覆盖 session 写入和 store 屏障；失败拒绝，下次调用重试待确认项，旧成功不能确认更新的编辑。直接 store 用户等待每批结果并以 flush 收束所有排队写入。

枚举/replaceWorld 接受取消；恢复先排空既有编辑。提交前中止保持旧状态，提交后完成匹配的 live overrides，遵守上节恢复语义。存储格式与 chunkSize 不符、跨区块或重复条目在加载时拒绝。

跟踪状态只保留有效覆盖、待确认编辑及恢复保护；空区块 revision 墓碑有上限，溢出归并到保守全局基线并释放集合。clearDeltas 清理会话跟踪，stats 暴露持有量，历史编辑次数不能成为无限留存机制。内存存储 dispose 同步清空 Map 并拒绝后续访问。

这是本地保存合同，没有 WAL、自动冲突合并或分布式同步协议；新增远程存储需保持批次/CAS 边界，再按实际业务确定合并规则。

## 资源预算

ResourceBudgetLedger 以保留 CPU backing buffer 和预计 GPU 上传容量准入，区块数另有上限；计数不是进程堆或驱动显存。geometry/texture/model 是诊断分类，不能当独立额外预算相加。

- CPU 按 backing buffer/纹理 source 去重，GPU 按实际 attribute、interleaved buffer、纹理对象去重；共享 ArrayBuffer 的独立上传仍分别计 GPU。
- 实例按分配容量计费，减少 count 不代表释放；几何、实例属性、骨骼/morph、贴图各面和 mip、shader uniforms 都在估算范围。
- 资源 identity 和 cost 保持不变，重新分配使用新 identity；未加载的零字节纹理不建立分配引用。
- 引用最后释放才扣账，准入失败不改变已有 reservation。单账户与全地图各自去重，账户引用字节不能简单相加。
- 自定义 resourceCost 由调用方负责共享关系和真实所有权；Worker 临时堆、JS 对象和驱动开销不在此计量。

植被 CPU 账户补足 Worker 布局、贴地高度/矩阵、雾属性和各 LOD 预处理模型。多个所有者共享同一布局引用；必要源输入受驻留范围限制，可重建的旧 LOD 缓存须通过准入。CPU 淘汰解除所有副本对缓冲的引用，GPU 淘汰可保留 CPU；缓存到期和新字节压力在相机静止时也处理。

非可见驻留超出任一字节预算立即按 LRU 淘汰。当前必需工作集 pinned，超额报告压力而不删除正在绘制的对象；自适应控制器可据此调整工作量，应用显式关闭自适应时不能声称预算一定满足。任意密度的必要资源不保证装入任意上限。

HexMap.resourceBudget 是冻结诊断视图，扩展经 createResourceAccount 获得隔离账户和可更新/释放的 reservation。同名局部 key 不跨账户冲突；账户/地图关闭使其全部预留失效。非必要资源准入失败需延后或拒绝，不能使用内部 forceReserve 绕过预算。

## 调度与背压

PriorityTaskQueue 的 lane、priority、weight、取消和等待时间由代码定义。任务数或总权重超限淘汰最低重要工作；单项已超过整个容量时先拒绝，不能先挤掉别人。keyed work 只留最新版，饥饿晋升只改变执行顺序，不改变背压淘汰等级。Worker 池继续保留地形容量预留。

RuntimeWorkCoordinator 聚合 frame/worker/streaming 的积压、占用、淘汰和饥饿诊断，各执行器保持自身时钟。应用可登记 telemetry，不从协调器取得业务结算。关闭取消其排队任务，旧世界注销对应 domain。

WebGlGpuTimer 异步轮询后续帧结果，不调用 finish；丢弃 disjoint 样本，限制在途查询并记录年龄及饱和。扩展可用但长期饱和是 GPU 落后信号，不能当作零耗时。帧任务只能在任务间让出，不能抢占长同步任务。

## 类型化事件与诊断口径

EventEmitter 将事件名绑定唯一 payload，HexMap、Unit、GameEngine 各有自己的事件表；公开事件及 payload 类型从主入口导出，void 事件省略载荷。完整名称和字段查 EventMaps，不维护第二份目录。

派发同步且使用监听器快照；派发期间增删只影响下次。监听器异常传回调用方并中止后续监听器。无人监听的 error 同步抛其 Error；有监听者按普通派发。图层清理是明确例外：先完整释放并聚合，再通知 error 监听者；无人监听或监听者又抛错时在清理后记录 console.error。

frame 的 t/dtS 表示帧时间戳/间隔，启动及恢复首帧 dtS 为零；cpuFrameMs 是上一帧工作，gpuFrameMs 是异步 GPU 样本，两者不是显示帧率。演示按时间窗统计实际 FPS，理论上限取 CPU/GPU 平均工作量较大者，不相加；缺 GPU 时标明单处理器上限，零工作不估 FPS，样本不跨窗复用。隐藏和恢复重置采样。

库通知不承担游戏[战斗结算事实](game/combat-architecture.md#结算与事件合同)的同步提交职责，业务不能依赖外部监听器执行伤害或奖励。

## 验证与维护

合同覆盖取消/超时、部分挂载、共享租约、竞争写入、崩溃提交点、部分恢复、容量拒绝、队列公平性和确定性释放；执行组合由[测试策略](testing.md)维护。历史冻结通过不代表当前提交已验收。

基础设施变更应有明确合同缺陷或实际新消费者；不预造资产注册、经营时钟或同步框架。生成内容继续通过版本化接口演进，新增 WebGPU、云保存等能力须明确范围与验证成本。

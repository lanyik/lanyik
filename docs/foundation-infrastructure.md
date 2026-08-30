# 运行时基础设施

当前运行时只维护 surface/render foundation v2 生产链路。权威架构见
[surface-render-foundation-v2.md](./surface-render-foundation-v2.md)，本文件记录跨世界表面、
存档和模拟共用的基础设施契约。

## 生命周期和发布门

`LifecycleScope` 为一次异步会话提供 generation、统一取消信号、在途任务 drain 和晚到结果拒绝。
拥有 scope 的系统必须在销毁时先停止新请求，再取消和等待在途工作，最后释放资源。旧 generation
的结果不得发布到新世界。

世界表面使用更严格的 request token：descriptor、effective revision、compiler profile、render chunk
和 session epoch 必须全部相同才允许挂载。`WorldRenderSession` 在需求移除、编辑失效、世界替换和
WebGL context loss 时都会使旧 token 失效。

## 调度和预算

`PriorityTaskQueue` 提供 `critical`、`interactive`、`visible`、`prefetch` 和 `background` 五条 lane，
并用任务数量、权重、取消和 starvation promotion 控制背压。`RuntimeWorkCoordinator` 只聚合各执行域
的可观测状态，不改变确定性 FIFO 模拟语义。

世界表面不使用“区块数”代替内存成本。`WorldSurfaceRuntimeBudgets` 必须显式提供七类字节预算：

- semantic authority；
- hydrology authority；
- compiled CPU cache；
- retained transferable windows；
- mounted compiled working set；
- surface GPU array textures；
- dynamic fog GPU textures。

预算不能容纳一个物理 texture page 时初始化直接失败；不会切换到另一条兼容或降级路径。

## 存档边界

`GenerationCheckpointCoordinator` 是跨参与者的存档提交点。当前 generation checkpoint format 为 v2，
participant 包括 `WorldDeltaStore` v3 和 `WorldSimulationRuntime` 快照。流程为不可变 staging、读回校验、
manifest CAS 发布；崩溃前后只能看到旧 generation 或完整新 generation，不能混合。

`CheckpointCoordinator` 保留给需要 journal prepare/commit 协议的独立参与者。两套 coordinator 都要求
幂等提交、显式版本和确定性失败；不提供旧格式 fallback。

## 模块边界

- `WorldSurfaceRuntime` 拥有 authority repository、editor、compiler service、query/picking、GPU pools、
  presentation 和 render session。
- `HexMap` 只负责浏览器 renderer、camera/controls、世界原子替换和 camera-driven demand。
- `WorldSimulationRuntime` 不依赖 Three.js 或相机驻留状态。
- `GenerationCheckpointCoordinator` 位于 `three-hex-map/persistence`，不会进入只需要渲染的入口。

验收命令和层级见 [testing.md](./testing.md)。

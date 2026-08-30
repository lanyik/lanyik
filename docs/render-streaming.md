# 渲染与流式加载

生产路径只有一条：

```text
WorldAuthoritySource
  -> WorldAuthorityRepository (32×32 semantic / 128×128 hydrology byte budgets)
  -> EffectiveWorldSnapshot (base + delta, exact revision)
  -> SurfaceCompilationService (20×20 transferable window)
  -> CompiledSurfaceChunk (16×16 ownership, 66×66 fields)
  -> SurfaceTexturePool / SurfaceFogTexturePool
  -> GroundLayer -> WaterLayer -> VegetationLayer -> dynamic fog
```

## 需求集合

`planWorldRenderDemand()` 从相机目标生成规范化的精确 render-chunk 集合。可见与预取使用不同 lane，LOD 只改变共享地面/水体/植被表现，不重新定义权威块。有限世界裁掉越界请求，环绕世界在加入集合前规范化，因此同一个物理块不会重复驻留。

`WorldRenderSession.updateDemand()` 先验证完整集合，再创建 authority lease 和 compiler token。任一硬预算无法容纳新增精确集合时，本次新增 demand 全部回滚；不会静默缩半径或切换旧渲染器。

## 编译与过期结果

每个编译请求同时携带：

- descriptor/world identity；
- semantic chunk revision；
- hydrology region revision 和 feature revision；
- compiler revision 与 profile version；
- session epoch 与 render-chunk generation。

Worker 返回后，服务重新校验完整 dependency key 和 token。旧编辑 revision、旧世界会话或已被替换的请求只能得到 `stale`，不能挂载或上传。

输入 window 的权威数组永不转移。服务从显式 byte-budgeted buffer pool 构造临时 transferable 副本；Worker 必须把六个 window buffer 连同编译结果一并归还。

## GPU 与表现层

一个 render chunk 在四张 `DataArrayTexture` 中使用相同 page/layer/generation。静态 field 整层上传；动态雾使用独立 16×16 R8 pool。slot generation 拒绝迟到上传和迟到释放，context restore 从 CPU backing store 重建当前页。

同一 texture page 内的 Ground/Water chunk 共享 `ShaderMaterial`，但 array layer、有效边界和水面 phase 是逐 draw 状态。每次 `onBeforeRender` 更新这些值后必须设置 `uniformsNeedUpdate`，确保连续使用同一材质的 chunk 不会误采样前一块的 GPU slot。多块 WebGL2 E2E 会强制绘制全部已挂载块，并逐 draw 核对实际 layer 集合与已分配 slot 集合。

chunk 外圈 position 使用 `1/64` tile 的 render-only overlap guard，`surfaceUv` 和权威 field 采样不偏移；它负责消除独立 mesh 变换后的亚像素漏缝。地面边界法线通过一格 field gutter 做相同全局位置的中心差分。世界坐标材质细节、六边格、岸线、波浪、泡沫、天空和距离雾必须跨 chunk 连续，不能以 chunk-local 随机相位重新开始。

依赖图固定保证 Ground 在 Water 之前、Water 在 Vegetation 之前，拆除顺序相反。地面与水体读取同一高度、水位、岸线 SDF、flow 和 body profile，并共享同一解析六边格规则；植被实例来自 compiled seed，而不是主线程重新解释语义。

## 编辑传播

`WorldDeltaStore` 提交产生精确 `WorldChangeSet`。会话只使受影响的 16×16 render chunks 失效，并保留未受影响的 lease、GPU slot 和 draw object。导航使用 32×32 chunk，模拟使用 64×64 chunk；二者从同一个 change set 获取各自的精确 dirty set。

## 生命周期

`HexMap.loadWorld()` 在独立 Scene 中把新 runtime 完整加载并稳定后再原子替换旧 Scene。并发或过期 load 不发布。WebGL context lost/restore 由同一 session 驱动 texture、fog、ground、water 和 vegetation 恢复。

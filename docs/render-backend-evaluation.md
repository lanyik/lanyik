# 渲染后端与裁剪决策

## 当前决策

生产后端是 Three.js `WebGLRenderer` + WebGL2。地面使用共享 16×16 合并网格的三档 LOD，连续水体和
植被按同一 render chunk 挂载；surface fields 存放于分页 `DataArrayTexture`，动态雾使用独立 R8 池。

当前没有 WebGPU fallback，也没有第二套公开渲染路径。更换后端必须以真实硬件 trace 证明收益，并一次性
迁移地面、水体、植被、array texture、context restore 和固定种子视觉验收，不能只做 capability probe。

## 可复现 CPU 基准

运行：

```powershell
npm run benchmark:render-backends
```

脚本以 16×16 render chunk 粒度比较 chunk frustum culling 与逐实例 CPU culling/compaction。结果只用于
判断 CPU crossover，不宣称测量了 GPU compute。记录新测量值时必须同时记录 Node、操作系统、CPU、
候选实例数、可见比例和迭代次数。

## 重新评估门槛

只有代表性硬件满足以下至少一项，才开始 WebGPU/GPU-culling 原型：

- render submission 或 culling 的 p95 达到 2 ms；
- 完成材质和相邻区块批处理后，持续 draw calls 仍超过 500；
- trace 证明 chunk-level overdraw 是 GPU 瓶颈，精确裁剪预计至少减少 30% submission；
- 新层需要现有 Worker/frame budget 无法承担的 GPU compute。

原型也必须继续消费 v2 compiled surface，不得恢复 packed tile、12×12 `TerrainMesh` 或旁路 resolver。

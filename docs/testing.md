# 测试与验收

## 分层

| 层级 | 覆盖 |
|---|---|
| 单元/契约 | 格式 golden、负坐标、排水终止、CAS、事务策略、dependency key、stale token、预算、逆序释放 |
| 浏览器 E2E | 真实 module Worker transfer/crash replacement、WebGL2 field upload、逐 draw layer、Ground/Water/Vegetation、context restore、唯一生产 demo，以及 v1 操作壳到 v2 runtime 的面板/拾取/WASD/右键环绕映射 |
| Soak | 重复原子替换世界，检查 demand、CPU/GPU budget、WebGL 资源和 JS heap |
| Benchmark | 49 个语义块、16-region 水文、effective snapshot、20×20 window、66×66 compile/upload、1/9/49 presentation、delta CAS、模拟 tick |
| 视觉图库 | 固定 compiled lake/shore/vegetation 的 near/middle/far 截图，以及至少 4 个相邻 chunk、混合 LOD 的地面/水面接缝隔离图 |

## 普通门禁

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## 基建/发布门禁

```powershell
npm run benchmark:check
npm run review:world-style
$env:FOUNDATION_SOAK_ITERATIONS='500'; npm run test:soak
```

本地完整收口可以先用较小但非零的 soak 次数验证流程；正式冻结或发布使用 500 次。

测试必须等待可观察状态或受控 Promise，不用定时器猜测竞态。E2E 中能力探测只能决定是否 skip；一旦能力存在，必须真实执行传输、绘制、context restore 或资源替换并验证结果。接缝测试同时验证 canonical UV、gutter 法线采样和 render-only overlap，并分别隐藏水面、地面、植被输出隔离截图。视觉验收保留图片作为 CI artifact，不把跨 GPU 不稳定的像素图作为仓库内 golden。

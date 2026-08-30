# 基础设施 v1 冻结记录（历史）

状态：v1 于 2026-08-27 冻结，随后由
[世界表面与渲染基础 v2](./surface-render-foundation-v2.md) 完整替代。

v1 建立了生命周期 generation、取消、资源字节预算、优先级队列、checkpoint CAS 和浏览器 soak 的
基础不变量。v2 保留这些不变量，但已经删除 v1 的 source/residency/streamer/controller、packed chunk、
旧 worker 请求和兼容入口。

本文件只记录迁移背景，不描述当前可调用 API。当前模块边界见 [package-boundaries.md](./package-boundaries.md)，
运行时契约见 [foundation-infrastructure.md](./foundation-infrastructure.md)，验收命令见
[testing.md](./testing.md)。

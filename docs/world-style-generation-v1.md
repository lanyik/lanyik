# 世界风格生成 v1（历史记录）

状态：已被 [世界表面与渲染基础 v2](./surface-render-foundation-v2.md) 替代。

v1 曾使用 packed tile、`WorldSurfaceResolver` 的运行时再解析、12×12 `TerrainMesh`、字符串水体
modifier 和两套生成入口。这些 API 与实现已经在 v2 一次性生产切换中删除，本文不再是实现依据，
也不能用于恢复兼容路径。

保留的历史结论只有：固定 seed、descriptor 和坐标必须与请求顺序、Worker 数、缓存命中及卸载重载
无关；视觉质量必须由固定种子图库和交互验收共同守门。v2 通过 typed semantic/hydrology authority、
effective revision 和统一 surface compiler 延续并加强这些不变量。

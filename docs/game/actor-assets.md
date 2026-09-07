# 角色资产与动画构建

对应 `scripts/lib/survivor-actors.mjs`、`presentation/ActorModels.ts` 与 `CombatLayer.ts`。

## 来源与授权

模型采用 Kay Lousberg 的 KayKit CC0 角色包，可用于商业项目。原始 GLB 与原文许可证保存在
`apps/survivor/assets/actors`；`sources.json` 记录固定提交 URL、文件大小和 SHA-256。
构建不访问外网，源模型哈希不符时明确失败。

| 用途 | 文件 | 官方仓库 / 固定提交 |
|---|---|---|
| 守夜人 | Rogue_Hooded.glb | [Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) / `672074b73ba276876a19e8816ecdc5241817ab47` |
| 骸骨仆从、潜行者、重卫、术士与领主 | Skeleton_Minion / Rogue / Warrior / Mage.glb | [Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) / `15b62b9bad122f72926c10fb14d622c73819fa54` |

许可原文分别为 `adventurers-LICENSE.txt`、`skeletons-LICENSE.txt`，随生产资源一起发布。
Git 对这两份原文禁用换行转换，以保留来源清单中的原始文件哈希。
领主使用放大的术士模型及紫色标记；精英使用金色标记，受击短暂提亮。

## 离线处理

`npm run app:prepare` 在受控的 `.assets/actors` 内生成生产文件。提取源文件内嵌 PNG，
读取 Idle 和 Running_A 动作，用真实骨骼变换求出顶点位置；角色统一为 1.25 逻辑单位高。
奔跑周期为 0.8 秒，均匀采样 8 帧，重算法线并导出 morph position / normal。
保留 UV、材质分组、双面斗篷和眼睛发光材质，删除运行时不需要的骨架及其余动作。
五个模型加纹理约 5.82 MiB；生成 manifest 记录帧数、周期、顶点/三角形数、来源哈希与产物大小。
这些生成文件不入 Git，源文件与构建脚本共同构成可重建输入。

## 运行时与所有权

主角使用常驻 Mesh，怪物各类型、各材质 primitive 使用固定容量的 InstancedMesh。
每个怪物仅写入变换、色彩和相邻两帧的 morph 权重，不创建逐怪 Skeleton 或 AnimationMixer。
动作相位由战斗 tick 和稳定实体 ID 决定，暂停时动作随模拟冻结；静止回到 Idle。
四个怪物类型各两个 primitive，只有内圈实例进入活跃前缀，不为中圈/外圈提交动画。

模型首次初始化异步加载，地图重新加载时复用同一组模型；资源加载或预算申请失败会释放已创建资源。
所属世界 signal 失效后拒绝挂载，应用关闭时释放几何、材质、atlas、实例 morphTexture 与资源账本。
实例 morphTexture 在最大容量时预分配，再把 count 设为零，使预算采样覆盖真实纹理容量。
资源申请通过后才挂载到表现层；无需更改地图内部代码。

浏览器验收检查五个模型请求成功、真实 WebGL 无错误并生成 HUD/角色背包截图。
基建生命周期改动仍执行标准浏览器验收和 500 次世界替换 soak。

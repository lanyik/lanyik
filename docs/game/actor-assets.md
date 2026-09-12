# 角色资产与动画构建

对应 `scripts/lib/actor-source.mjs`、`scripts/lib/survivor-actors.mjs`、
`scripts/prepare-survivor-assets.mjs`、`presentation/ActorModels.ts`、`ActorPose.ts` 与 `CombatLayer.ts`。

## 当前试装与许可

本轮采用 Quaternius 的 Fantasy Outfits 游侠与 Bestiary 免费怪物。
两个怪物基础模型导出四组模型，六种玩法类型共享这些模型池；未购买付费资源。
原来的 KayKit 模型与未使用许可已移除。候选比较见 [角色美术调研](actor-art-research.md)。

| 输入 | 用途 | 作者来源 / 许可 |
|---|---|---|
| `ranger/Male_Ranger.gltf` 与配套文件 | 游侠服装、护肩、兜帽 | [Fantasy Outfits](https://quaternius.itch.io/modular-character-outfits-fantasy) / CC0 |
| `head/Superhero_Male_FullBody.gltf` 与配套文件 | 仅保留头部、眼睛与眉毛，移除衣服内部身体 | [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) / CC0 |
| `animation/UAL1_Standard.glb` | Idle、Jog、Walk、Sword Idle、Spell Idle、Punch、Sword Attack、Spell Shoot | [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) / CC0 |
| `bestiary/Imp.glb`、`Puglin.glb` 与两张原版配色 | 两种怪物及持械、体型、施法姿势的试装变体 | [Bestiary](https://quaternius.itch.io/bestiary-dungeon-monsters-kit) / QAL 1.0 |

实际输入位于 `apps/survivor/assets/actors`，`sources.json` 对每个文件记录作者页面、
下载包 SHA-256、包内原始路径、单文件字节数、SHA-256 与许可。构建离线运行，
模型、缓冲、纹理和许可读取均须通过来源清单，未登记或哈希不符明确失败。
原始 glTF、BIN、图片与许可禁用 Git 换行转换，以保持可重建的字节输入。
头部导出中两个法线图 URI 有重复 `_png`，导入描述明确映射到包内对应原图，源文件不改写。

四份原文许可 `outfits-LICENSE.txt`、`base-characters-LICENSE.txt`、`animations-LICENSE.txt`、
`bestiary-LICENSE.txt` 与清单随游戏构建发布。Bestiary 只能按 QAL 使用：允许作为游戏的一部分，
禁止作为独立资产、模板或资源包再分发；不能把全部项目角色统称为 CC0。

## 离线处理

`npm run app:prepare` 在已验证位于应用目录内的 `.assets` 中生成生产文件。

1. 读取真实蒙皮与骨架，独立提取颜色、法线、金属/粗糙度和发光贴图。
2. 用 meshoptimizer 简化网格，保留法线、UV、蒙皮权重与骨骼索引变化；目标索引数为原来的 40%，
   误差上限 `.008`，实际数量由保真约束决定。头部按颈部高度裁掉隐藏身体，再压紧索引与顶点。
3. 用通用动作骨架的世界旋转增量映射到目标绑定姿势；保留目标肢体长度，只按髋骨高度比例传递上下起伏，
   不导入水平根运动。所有旋转归一化，缺动作或缺骨骼明确失败，不让局部身体静默留在 T 姿势。
4. 分别生成静止基准和八帧循环移动姿势，怪物再生成八帧非循环攻击姿势（包含首尾）。位置与作者法线都经过蒙皮，保留跨 UV 接缝的平滑明暗。
   离线求值使用 LoopOnce 并锁定末帧，防止恰好采样 duration 时回到第一帧；移动片段不重复采样终点。
5. 主角四张 1024² 图集，怪物各四张 512² 图集；材质区域有四像素边缘延展。
   UV 随图集重新映射，金属与粗糙度因子写入 ORM 通道，保留法线和眼睛发光。
6. 每组模型导出一个材质 primitive，删除运行时骨架与其他动作；生产五组模型及纹理约 14.5 MiB。

| 生产模型 / 用途 | 基准身高 | 静止 / 移动 | 移动周期 | 攻击片段 | 三角形 |
|---|---:|---|---:|---|---:|
| Ranger / 守夜人 | 1.60 | Idle / Jog | 0.9333 秒 | — | 14,084 |
| Puglin / 地精仆从 | 1.00 | Idle / Walk | 1.3333 秒 | Punch_Cross | 3,096 |
| Imp / 小恶魔斥候，移除武器与锁链 | 1.25 | Idle / Jog | 0.9333 秒 | Punch_Jab | 5,340 |
| Puglin_Brute / 持棍地精重卫 | 1.00 | Sword Idle / Walk | 1.3333 秒 | Sword_Attack | 3,096 |
| Imp_Shaman / 蓝色小恶魔术士，保留锁链、移除狼牙棒 | 1.25 | Spell Idle / Jog | 0.9333 秒 | Spell_Simple_Shoot | 6,576 |

赤脊冲锋者复用 Puglin_Brute 并染橙红，幽光祭司复用 Imp_Shaman 并染绿。
玩法 kind 与生产模型索引分离，由 `EnemyDefinitions.model` 映射；不会按六种玩法额外复制两组 GPU 资源。

运行时仍按核心半径缩放敌人，重卫、精英和领主因此具有更大轮廓。
领主采用术士变体，HUD 名称为裂爪领主。基础数值与新增攻击时序由 `EnemyDefinitions.ts` 决定。
生成 manifest 顶层 frames 记录八帧移动；各模型记录总帧数、攻击名称、真实周期、身高、顶点/三角形数、primitive 数、图集尺寸与产物字节数。
模型 extras 携带周期，运行时按模型自己的周期播放，不再固定假定全部为 0.8 秒。

## 场景协调

应用构建时仅对地形图集 `land` 与 `_plains` 两格做饱和度 `.42`、亮度 `.8` 的处理，
把荧光绿收敛为苔绿色；图集布局、地形语义和引擎原始纹理保持一致。
战斗层添加固定相机方向的柔和补光（`0xe2ebdf`、强度 `1.6`、方向 `-6,9,7`），
让皮革、面部与深色怪物在当前灯光下可读。补光与目标对象一起归战斗层所有。

## 运行时与所有权

主角使用常驻 Mesh；四组敌人模型各一个固定容量 InstancedMesh，六种玩法共享池，最多四次敌人模型绘制。
每只怪物只写入变换、颜色和相邻两帧 morph 权重，不创建逐怪 Skeleton 或 AnimationMixer。
矩阵、颜色和出生锚的 GPU 更新范围仅为可见前缀；morphTexture 使用 RedFormat，按 Three 支持的整张纹理上传权重，空池不上传。
每局开始先清空实例池、技能和投影，并隐藏整个角色/雾根节点；等新局首个表现状态到达再显示，避免加载期间继续绘制上一局满载角色。
事实位置保留双精度，实例与出生锚写入相对插值玩家位置的局部坐标；根节点负责世界平移，避免远行时 Float32 位置量化。
移动相位由模拟动画时间、真实周期和实体 ID 确定，静止使用独立 Idle 基准。
攻击权重由 ECS 动作进度确定，前摇与后摇各映射到动画一半，末帧不循环回首帧；切换动作清除另一组权重，暂停时随模拟冻结。
预警扇形/圆环及敌方弹道颜色读取同一动作与阵营组件，具体规则见[战斗 ECS 与行为树](simulation-and-ai.md)。
颜色与发光图用 sRGB，法线与 ORM 保持线性数据。贴图使用无颜色转换、无预乘、无翻转的 ImageBitmap 解码，关闭 Texture.flipY 以匹配 glTF UV。

可见性与 AI 更新圈分离：`ActorVisibility.ts` 在玩家周围 24–30 逻辑单位 smoothstep 淡出，
接近时反向淡入，使用 alpha hash 保留深度写入。
距离取当前点和出生点到玩家距离的较大值；CPU 剔除时预留模型半径。
每个池保留固定 640×2 float 的 `actorHome` 属性，避免追兵在出生区块卸载时突然消失。
宝箱和地面物品继续共用距离淡出。

模型、四类贴图和[技能图集](skills-and-effects.md)首次异步加载，地图重载复用同一组资源。GLB 或贴图失败会释放已创建资源，
错误包含具体文件名，可在资源恢复后重试同一世界；预算申请通过后才挂载。
五个 GLB 与二十张角色贴图共用有界并发队列，上限由 `GAME_CONFIG.presentation.assetLoadConcurrency` 指定，默认 4；技能图集单独加载。
初始化信号传入 fetch；取消或失败会停止队列和在途请求，立即释放已完成的半成品。
GLTF/ImageBitmap 解码任务取消时停止等待，晚到结果自行释放；已建立 Texture 的像素位图随 texture.dispose 关闭。
实例 morphTexture 按最大容量预分配，每只怪物一行含基准权重及十六个 morph 权重，使资源账本覆盖真实容量。
应用关闭时释放几何、材质、四类贴图、实例 morphTexture、补光、三类攻击预警池、技能图集实例池、持续护罩、边缘雾与资源账本。
没有更改引擎的生命周期、资源核算、流送或调度语义。

## 验证

源文件检查与动作测试覆盖全部输入哈希、未登记输入、缺失动作/骨骼、真实怪物肢体长度不变、
水平根运动去除，以及动作切换回到相同姿势。
浏览器验收覆盖五个 GLB、二十张贴图、移动时真实 morph 权重、每种怪物一个 primitive、
GLB 和法线图失败后的重试、外圈实例、装备交互、非循环攻击姿势与预警，以及关闭后 CPU/GPU 账本归零。
通过共享消息分类检查真实 WebGL 上传错误与图形 warning；只排除明确的截图 `ReadPixels` 读回性能提示。
单测还覆盖网络挂起、解码挂起期间取消的半成品/晚到资源释放，以及大坐标下小位移和可见前缀上传。
实机截图检查完整战场和模型细节；基建生命周期改动仍执行 500 次世界替换 soak。

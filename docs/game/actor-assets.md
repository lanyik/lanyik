# 角色资产与动画构建

导航：[总导航 · 游戏设计](../README.md#game) · [按任务阅读](../README.md#routes)

对应 `scripts/lib/actor-source.mjs`、`scripts/lib/survivor-actors.mjs`、
`scripts/lib/survivor-creatures.mjs`、`scripts/prepare-survivor-assets.mjs`、`presentation/ActorModels.ts`、`ActorPose.ts` 与 `CombatLayer.ts`。

## 当前试装与许可

当前采用 Quaternius 的 Fantasy Outfits 游侠与 Bestiary 免费怪物。
已有怪物导出三组模型，另有程序化蛛兽与岩石守卫；六种玩法共享五个敌人池，未购买资源。
原来的 KayKit 模型与未使用许可已移除。早期候选比较保留在 [2026-09-08 角色美术调研归档](../archive/2026-09-08-actor-art-research.md)，不作为当前资产推荐。

| 输入 | 用途 | 作者来源 / 许可 |
|---|---|---|
| `ranger/Male_Ranger.gltf` 与配套文件 | 游侠服装、护肩、兜帽 | [Fantasy Outfits](https://quaternius.itch.io/modular-character-outfits-fantasy) / CC0 |
| `head/Superhero_Male_FullBody.gltf` 与配套文件 | 仅保留头部、眼睛与眉毛，移除衣服内部身体 | [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) / CC0 |
| `animation/UAL1_Standard.glb` | Idle、Jog、Walk、Punch、Sword Attack、Spell Shoot | [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) / CC0 |
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
4. 分别生成放松待机基准和八帧循环移动姿势，怪物再生成八帧非循环攻击姿势（包含首尾），最后追加四帧循环呼吸待机。导入角色待机只取 `Idle_Loop`，不使用持剑/施法准备姿势。位置与作者法线都经过蒙皮，保留跨 UV 接缝的平滑明暗。
   离线求值使用 LoopOnce 并锁定末帧，防止恰好采样 duration 时回到第一帧；移动片段不重复采样终点。
5. 主角四张 1024² 图集，怪物各四张 512² 图集；材质区域有四像素边缘延展。
   UV 随图集重新映射，金属与粗糙度因子写入 ORM 通道，保留法线和眼睛发光。
6. 每组模型导出一个材质 primitive，删除运行时骨架与其他动作。加入程序化模型后共六个 GLB、二十四张图集，约 22.35 MiB；主角 12 帧，敌人 20 帧。未使用的独立 Imp 生产模型已移除，源 Imp 仍供术士使用。

| 生产模型 / 用途 | 基准身高 | 静止 / 移动 | 移动周期 | 攻击片段 | 三角形 |
|---|---:|---|---:|---|---:|
| Ranger / 守夜人 | 1.60 | Idle / Jog | 0.9333 秒 | — | 14,084 |
| Puglin / 地精仆从 | 1.00 | Idle / Walk | 1.3333 秒 | Punch_Cross | 3,096 |
| Puglin_Brute / 赤脊冲锋者 | 1.00 | Idle / Walk | 1.3333 秒 | Sword_Attack | 3,096 |
| Imp_Shaman / 蓝色小恶魔术士，保留锁链、移除狼牙棒 | 1.25 | Idle / Jog | 0.9333 秒 | Spell_Simple_Enter → Shoot → Exit | 6,576 |
| RiftSpider / 裂隙蛛兽 | 约 .60 | Breathing / 八足交替步态 | .72 秒 | 前足抬起与毒牙前刺 | 9,192 |
| StoneSentinel / 裂岩守卫 | 约 1.50 | Breathing / 沉重步态 | 1.50 秒 | 双臂前击 | 3,760 |

赤脊冲锋者复用 Puglin_Brute 并染橙红，幽光祭司复用 Imp_Shaman 并染绿。
玩法 kind 与生产模型索引分离，由 `EnemyDefinitions.model` 映射；六种玩法使用五组敌人 GPU 资源。

程序化模型在构建时生成身体、关节、肢节和眼睛，三类动作保持相同拓扑；不把人形 UAL 绑定到八足骨架。八帧移动、八帧含首尾的攻击、四帧三秒呼吸使用相同求值函数。合并顶点时保留临时部件身份，防止接触部位误焊，全部 morph 同步重映射，随后删除临时属性。蛛兽使用代码生成的甲壳颜色/法线/粗糙度，岩石守卫使用已登记 CC0 Rocky Terrain；右半图集为发光眼睛/核心。两者单 primitive、顶点色与标准材质，无运行时建模、骨架或逐实体材质。程序化造型为项目作品，并非下载的专业雕刻角色。

运行时仍按核心半径缩放敌人，重卫、精英和领主因此具有更大轮廓。
领主采用术士变体，HUD 名称为裂爪领主。基础数值与新增攻击时序由 `EnemyDefinitions.ts` 决定。
生成 manifest 顶层 frames / idleFrames 记录八帧移动和四帧待机；各模型记录总帧数、待机/攻击名称、移动/待机周期、身高、顶点/三角形数、primitive 数、图集尺寸与产物字节数。

## 动作过渡与施法手部

`ActorPoseMixer` 按 ECS 槽保存前一姿势、过渡起点、动作和完整实体句柄，固定容量 1857，总 CPU 缓冲 328,689 字节并进入表现资源账本。状态切换后 140ms smoothstep 混合，期间再次切换从当前混合姿势接续；槽复用或新世界重置不会继承上一只怪的姿势。移动、待机继续循环，攻击按权威 progress 播放，释放点仍为 .5；模型池压紧不会改变动画状态归属。

术士采用完整 Enter/Shoot/Exit 序列，占攻击阶段的 0–.43/.43–.64/.64–1，仍烘焙八个攻击采样。核查原骨架后使用 `hand_l`，将每个移动、攻击、待机采样的手部世界位置按相同身高归一化，写入 GLB 的 60 个 `castingHand` 数值。运行时手部飞刃和连线使用与网格相同的 morph 权重，不需要实时骨架。

`ActorSockets.generated.ts` 由同一构建步骤写入释放帧 11/12 的平均手部位置；模拟使用这个位置按真实朝向和普通/精英/领主体型缩放、旋转，生成整组弹道。构建缺骨骼、动作或手部曲线会明确失败。发射海拔取模拟缓存的身体脚下高度加手部高度；确认视线及身体到手部的发射段无遮挡后创建弹道。释放后保存权威海拔、上一海拔、竖直速度和年龄，表现只插值 XYZ，不再用 .45 秒衔接沿途地面高度。模拟高度场为同源宏观表面的 0.5 单位栅格近似；角色表现仍使用表面三角扇插值与微位移余量。

抬手飞刃和血契连线使用同一手部曲线，由独立的 `EnemyPresentation` 固定实例池提交；血契与领主攻击不复用玩家法阵，伤害/治疗时机由固定 tick 决定。岩卫石脊使用自身攻击姿势，不套用术士手部曲线；受祭司祝福的同伴显示三片护骨。新增法术不增加 GLB、骨架或动画池。测试覆盖姿势中断、句柄复用、导出曲线与模拟常量一致，以及不同朝向/体型的整组弹道只释放一次。
模型 extras 携带周期，运行时按模型自己的周期播放，不再固定假定全部为 0.8 秒。

## 场景协调

应用的树木、岩地贴图与统一比例由[场景资产合同](environment-assets.md)定义；`land` 使用 Grass005 草地，饱和度 `.7`、亮度 `.95`。
草地碎石与山岩采用两个独立 CC0 材质，图集格位语义和引擎原始资产保留。
战斗层添加固定相机方向的柔和补光（`0xe2ebdf`、强度 `1.6`、方向 `-6,9,7`），
让皮革、面部与深色怪物在当前灯光下可读。补光与目标对象一起归战斗层所有。

## 运行时与所有权

主角使用常驻 Mesh；五组敌人模型各一个固定容量 InstancedMesh，六种玩法共享池，最多五次敌人模型绘制。
每只怪物只写入变换、颜色和相邻两帧 morph 权重，不创建逐怪 Skeleton 或 AnimationMixer。
矩阵、颜色和出生锚的 GPU 更新范围仅为可见前缀；morphTexture 使用 RedFormat，按 Three 支持的整张纹理上传权重，空池不上传。
每局开始先清空实例池、技能和投影，并隐藏整个角色/雾根节点；等新局首个表现状态到达再显示，避免加载期间继续绘制上一局满载角色。
事实位置保留双精度，实例与出生锚写入相对插值玩家位置的局部坐标；根节点负责世界平移，避免远行时 Float32 位置量化。
移动和待机相位由模拟动画时间、各自真实周期和实体 ID 确定；导入角色待机 2.5 秒，程序化怪物待机 3 秒，四帧不重复采样终点。切换至待机清空移动/攻击权重，再只写待机区段；主角和敌人的待机区段分别从 8 / 16 开始，加载时严格校验帧数和两种周期。
攻击权重由 ECS 动作进度确定，前摇与后摇各映射到动画一半，末帧不循环回首帧；切换动作清除另一组权重，暂停时随模拟冻结。
预警扇形/直线及敌方弹道颜色读取同一动作与阵营组件，具体规则见[战斗 ECS 与行为树](simulation-and-ai.md)。
颜色与发光图用 sRGB，法线与 ORM 保持线性数据。贴图使用无颜色转换、无预乘、无翻转的 ImageBitmap 解码，关闭 Texture.flipY 以匹配 glTF UV。

可见性与 AI 更新圈分离：`ActorVisibility.ts` 在玩家周围 34–42 逻辑单位 smoothstep 淡出，
接近时反向淡入，使用 alpha hash 保留深度写入。
距离取当前点和出生点到玩家距离的较大值；CPU 剔除时预留模型半径。
每个池保留固定 896×2 float 的 `actorHome` 属性，避免追兵在出生区块卸载时突然消失。
宝箱和地面物品继续共用距离淡出。

模型、四类贴图和[技能图集](skills-and-effects.md)首次异步加载，地图重载复用同一组资源。GLB 或贴图失败会释放已创建资源，
错误包含具体文件名，可在资源恢复后重试同一世界；预算申请通过后才挂载。
六个 GLB 与二十四张角色贴图共用有界并发队列，上限由 `GAME_CONFIG.presentation.assetLoadConcurrency` 指定，默认 4；技能图集单独加载。
初始化信号传入 fetch；取消或失败会停止队列和在途请求，立即释放已完成的半成品。
GLTF/ImageBitmap 解码任务取消时停止等待，晚到结果自行释放；已建立 Texture 的像素位图随 texture.dispose 关闭。
实例 morphTexture 按最大容量预分配，每只怪物一行含基准权重及二十个 morph 权重，使资源账本覆盖真实容量。
应用关闭时释放几何、材质、四类贴图、实例 morphTexture、补光、近战/冲锋预警池、敌方四组表现池、技能图集实例池、持续护罩、边缘雾与资源账本。
没有更改引擎的生命周期、资源核算、流送或调度语义。

## 验证

源文件检查与动作测试覆盖全部输入哈希、未登记输入、缺失动作/骨骼、真实怪物肢体长度不变、
水平根运动去除，以及动作切换回到相同姿势。
浏览器验收覆盖六个 GLB、二十四张贴图、移动时真实 morph 权重、每种怪物一个 primitive、
GLB 和法线图失败后的重试、外圈实例、装备交互、非循环攻击姿势与预警，以及关闭后 CPU/GPU 账本归零。
通过共享消息分类检查真实 WebGL 上传错误与图形 warning；只排除明确的截图 `ReadPixels` 读回性能提示。
单测还覆盖网络挂起、解码挂起期间取消的半成品/晚到资源释放，以及大坐标下小位移和可见前缀上传。
实机截图检查完整战场和模型细节；基建生命周期改动仍执行 500 次世界替换 soak。

# 资产构建、角色表现与环境

导航：[文档索引](../README.md#game)

本页维护资产输入、离线处理、动作/声音、环境与资源所有权；美术目标和未完成视觉能力归[视觉改造项目](visual-overhaul.md)，通行归[探索与地形](exploration-and-homestead.md)，通用材质/阴影/输出归[渲染流送](../render-streaming.md)。

## 输入与许可

| 来源清单 / 构建入口 | 内容与约束 |
|---|---|
| [actors/sources.json](../../apps/survivor/assets/actors/sources.json)、[survivor-actors](../../scripts/lib/survivor-actors.mjs)、[survivor-hero](../../scripts/lib/survivor-hero.mjs)、[survivor-creatures](../../scripts/lib/survivor-creatures.mjs) | Quaternius 游侠服装、基础头部、UAL 动作及 Bestiary；另有项目程序化蛛兽/岩卫 |
| [environment/sources.json](../../apps/survivor/assets/environment/sources.json)、[survivor-environment](../../scripts/lib/survivor-environment.mjs)、[survivor-scenery](../../scripts/lib/survivor-scenery.mjs) | 地表、树木、Poly Haven 石材/营火台及固定副本布景 |
| [homestead/sources.json](../../apps/survivor/assets/homestead/sources.json)、[survivor-homestead](../../scripts/lib/survivor-homestead.mjs) | Quaternius Medieval Village 家园建筑及共享碰撞足迹 |
| [公共纹理来源](../../public/textures/sources.json) | 演示继承的图集/描述/战争迷雾输入，不套用扫描素材 CC0 |
| [effects/sources.json](../../apps/survivor/assets/effects/sources.json)、[audio/sources.json](../../apps/survivor/assets/audio/sources.json) | 特效来源与项目原创合成声音，按各自清单分发 |

清单是文件列表、来源 URL、下载包/文件哈希和字节数的唯一记录。构建经 sourceReader 校验，模型、缓冲、纹理和许可未登记或不匹配即失败；只读离线输入，不运行时下载。原始 glTF/BIN/图片/许可禁用 Git 换行转换，描述中的路径映射不改写源文件。

服装、基础角色、UAL 为 CC0；Bestiary 使用 QAL 1.0，不能把全部角色统称 CC0。四份角色许可及来源清单随构建发布，Bestiary 不能作为独立资产、模板或资源包再分发。扫描/树皮/建筑等具体归属以原文为准，[唯一索引](../README.md#assets)列出许可入口，不能因合并文档删除它们。

prepare-survivor-assets 只替换校验 realpath 后的应用 .assets 生成目录。根 public 混合演示源码、输入和受跟踪模型，只有声明产物可清理，包构建边界见[应用设计](../app-development.md#包与构建入口)。模型数、三角形、图集尺寸和动作时长以生成 manifest/代码为准，不手工维护第二张表。

## 角色离线处理

读取真实骨架/蒙皮及颜色、法线、ORM、发光通道；减面保持法线/UV/权重/索引，裁去头部模型衣内隐藏身体并压紧数据。动作按源骨架世界旋转增量映射目标绑定姿势，保留目标肢体长度，只按髋高传垂直起伏，不引入水平根运动；缺动作/骨骼明确失败。

敌人烘焙移动/攻击/待机 morph 并去掉运行时骨架；主角保留合并 Skeleton 与单个 SkinnedMesh，烘焙骨骼片段。非循环采样锁末帧，循环 morph 不重复终点，骨骼轨道保留终点并优化；待机使用 Idle_Loop，不拿持剑/施法预备代替。

颜色与材质图集有边缘延展，重映射 UV 并写入材质因子。角色每模型一个 primitive；玩法 kind 与模型池索引分开，变体共享资源。程序化异形使用自己的拓扑/动作求值，不套人形骨架；合并顶点保留临时部件身份并同步重映射全部 morph。

HeroClips.generated 与 GLB extras 来自同一次构建，包含时长/循环和上身分区；运行时严格校验骨骼、片段与轨道完整性。手部曲线和 ActorSockets.generated 同样来自烘焙，模拟按体型/朝向生成发射点，表现用同一姿势插值，不能仅手改模拟常量。

修改入口：[ActorModels](../../apps/survivor/src/presentation/ActorModels.ts)、[ActorPose](../../apps/survivor/src/presentation/ActorPose.ts)、[HeroPose](../../apps/survivor/src/presentation/HeroPose.ts)、[HeroAnimation](../../apps/survivor/src/presentation/HeroAnimation.ts)。

## 主角动作与声音

HeroPose 选择上下身片段、相位和方向，HeroAnimation 独占采样/过渡。髋腿播放位移，spine_01 子树独立出手/施法；切换平滑混合，半途再次切换从当前混合姿势接续。首次/重置直接建立有效姿势，过渡每帧更新旋转和位置，不能旧姿势保持后跳终点。瞄准扭转在基础混合后加，不累积进下帧。

普攻只在实际弹道创建后出手；技能读真实阶段及 castLocksMovement。移动施法保留腿部，仅锁移动前摇/引导使用全身，后摇释放腿部；取消不继续假播。受击覆盖上身，死亡全身最高优先。腿按实际位移/速度，上身按真实出手方向；扭转有角度限制和分摊，反向步态有滞回，不改命中/权威朝向。

源素材只有前向移动，反向采样不等于专业后退/侧移；普攻暂借通用施法片段，职业武器动作仍待制作。死亡立即停玩法，常驻主角用有界表现时间完成非循环倒地并保持末帧；暂停/隐藏/加载/失败冻结，恢复不补时间、新局重置，冻结不跳第零帧、倒地不继续受击闪烁。

PlayerFeedback 是固定投影，每类保留最新事件 tick、同 tick 合并；只有实际释放/掉血/成功拾取写提示，闪避、全吸收、献祭或失败拾取不能伪造。它不入存档、不消费玩法随机数，RenderFrame 复制而非借用可变对象。批量发布可丢中间音效，过期/暂停/读档前事件不补播。

CombatAudio 归 HexCombatView，首次用户手势创建并解锁唯一 AudioContext，PCM 合成后复用。声音是项目原创波形，没有外部录音/配乐/配音；近处命中筛选、同类间隔和声部数有上限，满额按重要性替换，死亡停其他声部，总增益/压缩限制叠音。

暂停/隐藏/加载/失败/切图停声，恢复读最新状态；迟到解锁不能复活已关闭实例。关闭释放节点/缓冲并关 AudioContext。解锁失败显示可重试原因，不改变权威战斗。开关/音量是会话设置，切图重开保留、回主界面重置，UI 归界面设计，不写角色存档。

## 敌人动作与批量渲染

ActorPoseMixer 按完整实体句柄及 ECS 槽持有前姿势和过渡起点，固定容量并计 CPU。动作切换/再次中断连续接续；槽复用或世界重置清旧姿势，模型池压紧不改变状态归属。移动/待机按模型周期循环，攻击按权威 progress 非循环映射，清另一组权重；暂停随模拟冻结。

术士的手部飞刃/连线与 morph 使用相同权重；发射前模拟确认身体到手部及目标视线，释放后表现只插值权威 XYZ，不依沿途地面重算高度。EnemyPresentation 持固定池，不因增加法术额外创建每敌 Skeleton/动画池。

主角常驻单个 SkinnedMesh，敌人按模型固定 InstancedMesh，只更新可见矩阵/颜色/出生锚前缀；morphTexture 预分配最大容量并按支持方式上传，空池不传。位置和淡出锚先转玩家附近局部坐标，避免远行 Float32 量化。

可见性与 AI 圈分开，距离/出生位置共同控制稳定覆盖淡出，CPU 剔除留模型半径；追兵不会因出生块卸载突消失。颜色和深度 pass 共用骨骼/morph及淡出，影子不另造角色实体；预警/护盾继续使用地面投影。

## 加载与资源所有权

CombatLayer 统一拥有模型、图集、实例、地面投影与环境布景。加载有界并发，fetch 绑定初始化信号；必需项失败取消同批并释放完成项。GLTF/ImageBitmap 解码不可中断时停止等待，晚到结果单独释放，不能挂到过期会话。预算准入后才挂载，地图重载复用，开始新局先清池/投影/姿势并隐藏旧根，收到首帧再显示。

主角骨骼纹理在计费前分配，关键帧/插值/分层缓存按 backing buffer 去重计 CPU；敌人 morph 按满容量计 GPU。几何、材质、纹理/位图、Skeleton、深度材质和实例数据均随所有者释放，共享引用只由最终所有者释放一次。

颜色/发光是 sRGB，法线/ORM 线性；ImageBitmap 无颜色转换、预乘和翻转，Texture.flipY 配合 glTF UV。统一天空照明，不由角色加相机补光或独立曝光。游戏预算覆盖所有账户，非所在场景的已加载布景仍计常驻工作集；账本不代表驱动实际显存。

## 环境、家园与副本

森林和导航共用 CombatEnvironment 尺度、候选与树根；树根 Y=0、XZ 保持生成原点，不能按偏心树冠居中导致碰撞偏移。树皮/叶片来源、EZ-Tree 固定 bundle 和 MIT 原文见[离线生成器](../../scripts/vendor/README.md)，浏览器不包含生成器。

树木三档 LOD 共用分枝骨架和近档材质/纹理，远档只换几何，不重新抽枝。Standard clone 保留 PBR 和贴图引用，albedoScale 只乘一次。叶片 alpha-test/双面/薄叶透射参与太阳阴影，无逐树透明排序或骨架；几何/生成材质和原纹理 lease 分别释放。

荒野与副本共用[森林风动](../render-streaming.md#森林风动)，颜色/深度变形一致、根不动、保守扩展边界；碰撞不跟树冠摆动。风动不等于已解决 LOD 切换，已有远近轮廓差异仍需视觉验收。

家园建筑 OBJ/MTL 离线去辅助线、保留线性颜色并合成索引几何；归一化包围盒写 HomesteadModels.generated，渲染与碰撞共用。运行时不带解析器/外网请求。外围海面/海雾仅装饰，复用宿主时间、雾和预算，不扩展可玩范围。

副本共用 ChallengeLayout 的有限营地→石路→河岸→领主路线；Poly Haven 石头和营火台经离线保边减面，归一至保守圆柱，再由布局指定大小与碰撞。石材/木料/橡树共用实例池和来源纹理，道路薄石可跨越，有限场地树木尚无距离 LOD。

ChallengeSurface 沿共享岸线生成有限连续地面/水面，细部只向河内侵蚀，水岸共用顶点边界。草/土权重同时用于颜色、法线、粗糙度、AO，湿岸响应一致；地面接现有 GroundProjection，目标仍由 CombatLayer 独占释放。逻辑地图用 external-surface 关闭内置绘制，soil 排草，仍提供总览/地类；这是有限副本方案，荒野仍为原六边形地表。

Campfire 用有限火焰面片和不投影的局部暖光，HDR 加色、深度测试且不写深度，现有时间驱动，不消费战斗随机数；Standard 模型接受局部光，Raw 草仍只用环境/太阳。尚无完整建筑废墟、烟雾/余烬，也无水面屏幕空间反射/折射/透射。

## 地表数据和着色

地表各语义格及扫描用途由来源清单约束；颜色/法线/粗糙度/AO 离线输出紧凑图集与线性表面数组。TerrainAtlas.surfaceBuffer 按颜色层顺序、自底向上存 RG 法线 XY、B 粗糙度、A AO，严格校验长度后直接上传，不经 Canvas 预乘或色彩转换。可选表面描述缺省时只走颜色材质，不请求不存在文件。

full/fast 共用宏观草土/坡面混合及材质权重，UV 梯度和镜像法线方向一致，先应用各材质响应再按同权重混合。积雪保留陡坡裸岩，细节不改几何/通行。soil 非必需通用格，缺失不执行自动草土混合；显式作者 soil 的要求归世界生成合同。

颜色数组/战争迷雾声明 sRGB，表面线性；边界在线性空间混合，不提前截 HDR 或手写近似显示转换。地形反射与 Standard 的共同口径、直接光近似及像素验证归[场景照明](../render-streaming.md#场景照明与颜色输出)，参数直接查实现。

## 天空、雾与光照

静态 Skybox 在初始化/上下文恢复烘焙 HDR 立方体和 PMREM，天空、雾、环境照明使用同一辐射，宿主统一曝光。skyVisible 只控制背景/天空雾，不撤掉环境照明；不逐帧重烘焙，恢复换图释放旧图，临时烘焙目标/生成器在成功失败都释放。

SkyFog 对地形/水/草/标准材质按水平径向距离混入同视线天空颜色，在线性 HDR 合成；它没有沿视线积分密度，不是体积雾。BoundaryMist 水平环面、ChallengeMist 环面/圆筒和家园海雾仍是二维噪声薄片，低视角会露边，没有场景深度交界消隐。昼夜、逐帧体积云和动态光照编辑尚未实现。

近景太阳阴影统一由宿主持有，角色/地面/树/实体按同几何姿势投影；叶片 alpha-test 和风动保留，前景透视不挖掉影子。水/草受影，当前没有屏幕空间接触阴影。尺寸、浮动原点、裁剪、HDR 目标和恢复失败语义均归[渲染设计](../render-streaming.md)，不在资产文档重复。

## 验证

离线检查输入哈希/未登记读取、缺骨骼/动作、肢体长度、去水平根运动、非循环末帧、重复构建字节一致、包围圆柱及许可发布。角色/环境改动核对加载失败、挂起解码取消、晚到资源、远坐标和可见前缀上传，最终账户归零。

轻量 hero-presentation 用真实 GLB 检查上下身移动施法、向后瞄准、倒地、音频解锁/限流/释放；混合检查中间帧连续旋转及中断，不能只看起止截图。资源回到预热基线，Three 自有 PBR 纹理不能误算角色泄漏。full/fast 材质、森林风/影与场景连贯性须真实 WebGL/像素检查，shader 字符串断言不替代画面。

检查组合及性能适用范围见[测试策略](../testing.md)；小画幅单角色通过不代表完整战场帧率/听感，截图仅作本地审查产物。

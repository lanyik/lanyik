# 荒原环境资产与表面渲染

导航：[总导航 · 游戏设计](../README.md#game) · [按任务阅读](../README.md#routes)

美术方向已确定为写实暗黑，完整世界、技能和界面的目标及里程碑归[视觉改造项目](visual-overhaul.md)。本页描述当前实现，现有资产以免费、可离线构建和随源码合法分发的资源为基础。新增资产先核对许可、原始归属与构建复现，再检查比例、材质响应和轮廓是否符合场景样板；不因资源分辨率更高就直接替换。

对应 `scripts/lib/survivor-environment.mjs`、`survivor-scenery.mjs`、`src/objects/Forest.ts`、`TerrainMesh.ts`、`TerrainArrayTexture.ts`、`terrainMaterial.ts` 和 `SunLight.ts`。源文件及哈希固定于 [environment 来源清单](../../apps/survivor/assets/environment/sources.json)。

## 副本路线布景

现有四个首领副本共用 [ChallengeLayout](../../apps/survivor/src/core/ChallengeLayout.ts) 的固定营地→石路→河岸→首领空地布局，独立随机流不消费战斗随机数。61 名敌人的种类、强度和出生位置沿用副本规则。该布景属于有限副本，尚未扩展为荒野聚落建筑系统。

首批扫描模型为 Poly Haven 的 [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01)（Kless Gyzen，六块石头）与 [Stone Fire Pit](https://polyhaven.com/a/stone_fire_pit)（Sebastian Platen）。原始 glTF、二进制与 1K 颜色/法线/粗糙度或 ARM 贴图进入来源清单；保留 [CC0 原文](../../apps/survivor/assets/environment/polyhaven-CC0.txt)，归属随清单发布。构建校验全部字节与 SHA-256，使用已有 meshoptimizer 离线保边减面，单石 900–2978 三角形、营火台 699 三角形；UV 保留，几何归一到半径/高度均为 1 的圆柱。原始扫描尺寸不作为游戏体型，布局显式提供半径、高度及朝向，与碰撞共用边界。

[ChallengeScenery](../../apps/survivor/src/presentation/ChallengeScenery.ts) 使用六组石头、一组营火台、橡树枝干、叶片和木料，共 10 个实例池；当前为 83 个石材实例（13 个实体、70 个嵌地路石）、6 根木料及 67 棵树。三根营地倒木使用保守圆柱碰撞，三根小柴木位于已有实体营火台内；木料由有限低面数几何生成，断端做不规则收缩，复用 Bark001 贴图及焦黑色调。路石顶部为 .025 游戏单位，仅作可跨越表面细节。树木复用原有橡树生成器、源贴图和比例，有限场地使用近景几何，尚无距离 LOD；枝干与叶片已接入下述共用风动，实例矩阵仍为静态。两份树木深度材质归布景所有，随布景销毁。枝干和叶片复用 `installForestOcclusion`，以玩家上方 .9 游戏单位为观察中心、半径 2 单位；绘制前转换至当前视图空间，保留完整阴影及实体碰撞，避免前景树冠遮住玩家。纹理按每来源共享，PBR 颜色以 sRGB 解码，表面通道为线性数据，直接参与现有太阳阴影与天空照明。

所有几何、纹理、解码图像和实例缓冲随 `CombatLayer` 一次加载、计入必要资源账户，切图复用并按地点隐藏，最终统一销毁；失败/取消释放已完成部分，无运行时外网请求。构建移除随机几何 UUID，`survivorScenery.test.js` 验证重复构建字节一致、几何处于权威包围圆柱内及许可原文发布。通行、遮挡和出生保证归[地形通行](terrain-navigation.md#副本固定布景)。

### 连续岸坡与营火

[ChallengeSurface](../../apps/survivor/src/presentation/ChallengeSurface.ts) 持有有限副本的地面和水面，共两次颜色绘制。岸坡沿 `challengeBank` 生成，Z 向间距 .25 游戏单位，细部侵蚀仅向河内偏移；水线与岸坡共用同一行顶点坐标，水面 Y=-.3，可通行地面 Y=0。地面 66816 三角形、水面 11520 三角形，静态缓冲不逐帧上传。宏观道路、首领空地、营火周边和河岸的草土权重预写入顶点；颜色、法线、粗糙度及 AO 共用权重。湿土向水边降低亮度和粗糙度，水面按岸距改变深浅色并以世界坐标法线表现涟漪；当前没有屏幕空间反射、折射或水体透射。

地面复用 Forest Ground 04 和 Grass005 的已校验原始输入，离线生成两套 512² 颜色/法线/ORM，共六张贴图（RGBA8 含 mip 约 8 MiB）。ORM 的 R/G/B 分别为 AO/粗糙度/零金属度；来源清单登记新增用途，原始字节、归属及许可不变。两份 Standard 材质接入太阳、天空照明与雾，陆地投影并受影，水面受影；地面在最终输出前采样 `CombatLayer` 已有的 `GroundProjection`，角色光环、掉落提示和敌方预警保持同一投影范围与优先级。新增采样纹理通过材质 uniforms 进入现有去重资源账本，投影目标仍只由 `CombatLayer` 销毁。

副本逻辑地图以 `external-surface` 关闭内置六边形地面/水面几何，仍为总览和植被提供地类；道路、空地和岸边的 `soil` 保持草丛排除语义。修饰合同归[世界生成](../world-style-generation-v1.md#生成地表与作者编辑)。这是有限副本的作者布景，荒野仍用原有海岸距离场和 `COMBAT_WATER_APPEARANCE`，没有宣称解决整个程序化世界的岸线。

[Campfire](../../apps/survivor/src/presentation/Campfire.ts) 在扫描石台内使用六条分段火焰面片（一次绘制）和一盏作用距离 5 游戏单位的暖色 PointLight，轻微闪动由既有渲染时间驱动，不消费玩法随机数。火焰使用线性 HDR 加色混合、关闭深度写入并保留深度测试；局部灯不创建阴影目标，Standard 地面、人物与道具接受其照明，原有草丛 Raw 材质仍只使用环境光及太阳。火焰、水波和树木共享更新入口，无新增帧循环、烟雾粒子池或音频资产。树木、火焰、岸坡和贴图均随布景加载/复用/释放。

本批补齐湿润岸坡、暖火与倒木，尚无完整建筑废墟、烟雾和余烬系统；远处边界雾及天空仍待大气联调。

## 共享资产与家园

演示与游戏共用的原始地形图集、图集描述和战争迷雾纹理由 [public/textures/sources.json](../../public/textures/sources.json) 登记字节数、SHA-256 与仓库来源提交。这三份是继承的演示输入，不套用后续扫描素材的 CC0 标记；原有第三方许可与归属文本保持原样。游戏构建复用现有 `sourceReader` 校验三份输入，只复制 `war-fog.jpg`，另生成 `terrain.png`、`land-atlas.json` 和 `terrain-surface.bin`。根 `public/` 保留演示源码、共享纹理输入及模型；`public/js/` 是被 Git 忽略的可重建产物，构建边界见[包边界](../package-boundaries.md#demo-build-and-startup)，不能整目录当缓存删除。

家园使用 [Quaternius Medieval Village](https://quaternius.com/packs/medievalvillage.html) 的 CC0 成品模型：Inn、Blacksmith、House_1、Well。原始 OBJ、MTL、作者许可原文和逐文件下载地址、字节数、SHA-256 保存在 [homestead 来源清单](../../apps/survivor/assets/homestead/sources.json)。不再用 Box/Cone 拼房屋。

`scripts/lib/survivor-homestead.mjs` 由资产准备脚本调用，校验所有输入，去除 Blender 导出的独立辅助线（避免 OBJLoader 把完整物体识别为线），保留建筑三角形及线性 MTL Kd 颜色，合并为每模型一份带顶点色的索引几何。统一居中并落地，按最大水平跨度分别归一化到 8/7/6/2 游戏单位；包围盒写入 `HomesteadModels.generated.ts`，供碰撞与布景共享，渲染几何写入 `.assets/homestead/models.json`，许可及来源清单随包发布。运行时无 OBJ/MTL 解析器、额外纹理或外网请求，四份几何共用一份 Standard 材质。

`HomesteadSea` 用共享平面生成宽 600 游戏单位的外围海面和两层沿海云雾，波纹/云团由 shader 计算，共三次绘制，无贴图、渲染目标或独立帧循环。海面与云雾通过现有 fog chunks 接入天空距离雾，海雾只在地图外缘出现，与战争迷雾无关。家园资产由 `CombatLayer` 的资源账户统一登记和释放；仅家园显示。地图和玩法边界见[探索与家园](exploration-and-homestead.md)。

## 比例与实例化

一个游戏单位为 34 世界单位，主角 1.6，即 54.4。树根高度归零，保留生成器树干根部 XZ=0，不能按不对称树冠中心平移，否则会偏离导航树干碰撞。应用 `treeScale=1`，稳定缩放抖动 0.8–1.2；每格树候选密度 .45，草高 3。森林与导航共用 `COMBAT_ENVIRONMENT`，水岸与碰撞规则见[地形通行](terrain-navigation.md)。

| 气候资产路径 | 实际树种 / 预设 | 高度 | 近 / 中 / 远三角形 |
|---|---|---:|---:|
| oak | 橡树 / oak_medium | 155 | 7246 / 3938 / 1788 |
| pinia | 松树 / pine_medium | 185 | 9104 / 5124 / 1612 |
| palm | 干地白蜡树 / ash_medium | 165 | 9352 / 5656 / 2116 |

路径是既有气候槽位；干地槽现在明确使用白蜡树，未声称它是棕榈。游戏资源覆盖应用生成目录，库演示资产独立保留。每棵树两部件：枝干和 alpha-test 叶片；区块同物种共享两份材质，各档 LOD 使用同一套骨架位置，不重新抽取随机分枝。

山体幅度为 480，实际海拔由连续 relief 决定。v22 降低高频噪声层数与局部细节权重，保留连续丘陵、谷地山口与高峰，详见[地形通行](terrain-navigation.md)。渲染、刷怪和通行共用权威高度。`WorldView.ts` 统一视野合同：远景地形雾 1156–1700，地形绘制距离 2312，植被 1700，LOD 距离 420/1000（均为显示单位）；地图加载半径两块、保留三块，半径四块的玩法驻留先于角色 34–42 游戏单位淡出边界加载。

天空开启时，`src/rendering/SkyFog.ts` 对地形/水/草着色器与标准材质统一应用径向雾，并采样同一摄像机视线的线性天空辐射。雾内片元增加一次立方体采样，在线性 HDR 场景内混合，最终统一映射为显示颜色。距离、颜色与资源生命周期详见[渲染流送](../render-streaming.md#材质坐标与贴地)。

## 免费森林构建

[EZ-Tree](https://github.com/dgreenheck/ez-tree) MIT，作者 Daniel Greenheck。离线 bundle 固定 `dcf309bd86bd521083d9c70f01f2de45fdc7c457`，许可证及复现方法见 `scripts/vendor`。浏览器不包含树木生成器。原 Kenney OBJ/MTL 和相应未使用许可已移除。

三档 detail 分别为 sectionStride 2/3/6、segmentFactor .85/.6/.4、leafStride 2/4/8，叶片放大 1.15/1.4/1.8，远档使用单平面叶片。枝干保持几何 UV；叶片使用原作者带 alpha 的 oak/pine/ash 图片。Bark001/Bark014 颜色、OpenGL 法线与粗糙度来自 ambientCG（CC0），归属原文随游戏发布。

近档 GLB 使用外部颜色/法线/ORM/叶片图片；中远档只存几何与材质描述，不重复请求纹理。Forest 以近档材质共享全部 LOD。标准材质 clone 保留完整 PBR 参数及贴图引用，资产 albedoScale 只乘一次；原材质不被修改。基础颜色材质转换为 Standard 后参与统一场景照明。

叶片 `alphaTest=.42`、双面，`forestFoliage` 材质标记启用薄叶背光透射（第一盏平行光，背光余弦平方、系数 .22），透射同样受太阳阴影遮挡。枝干与叶片投影并受影，深度 pass 保留 alpha-test 轮廓；没有半透明排序、逐树材质或逐树骨架。几何和生成材质由 ForestSharedResources 释放，原始纹理由模型资产 lease 所有；中远档继续共享近档材质。

荒野三种树与副本橡树共用[森林风动](../render-streaming.md#森林风动)。树冠缓慢摆动并带细小颤动，根部固定；最大侧向偏移不超过模型高度的 5%，不改变树干碰撞。模型各部件和 LOD 共用高度，稳定旋转/缩放提供个体相位；颜色、法线与太阳阴影同步变化。仅使用既有几何和材质，不修改来源资产或增加运行时下载。荒野已有三档 LOD 的轮廓差异与切档方式保持现状，风动不等同于解决所有远近切换问题。

## 地表数据和着色

[ambientCG Grass005](https://ambientcg.com/view?id=Grass005) 用于 land，[Forest Ground 04](https://polyhaven.com/a/forest_ground_04) 用于 soil，[Rocky Terrain](https://polyhaven.com/a/rocky_terrain) 用于 mountain；均为 CC0，Grass005 是 bitmap 元素与程序化混合制作的草坪。原先无地类引用的 `_plains` 槽明确改为 soil，移除未使用 Rocky Terrain 02 源文件。固定 1K 颜色、OpenGL 法线、粗糙度、AO 输入，颜色饱和度 .7、亮度 .95，缩至 512 格；其余五格保留原语义。源文件固定字节数与 SHA-256，Grass005 还记录原压缩包 SHA-256 与包内路径。

草地按原有连续宏观噪声 .48–.78 混入最多 72% 林地土壤，颜色和表面通道使用同一权重；坡面再混合裸岩。不增加数组层数，土壤混合活跃时多读取两次颜色和两次表面纹理。通用图集可以省略 soil，此时不执行草土混合。full/fast 共用该代码。

`ForestOcclusion` 在共享枝干和叶片材质的 alpha-test 后插入局部覆盖抖动。`HexMapOptions.foregroundFadeRadius/Height` 是非负世界单位，默认为零（普通地图不启用观察目标虚影），游戏取 68/30.6。观察中心每帧变换到视图空间，适配轨道旋转、缩放、世界替换与浮动原点；没有逐树透明排序或额外 draw call。

八个语义格紧凑排入 2048×1024 图集，间距 4，运行时每层 504²。颜色与表面各八层 RGBA8，加 mip 共约 20.67 MiB；此前 2048² 图集含八个空槽，一份十六层颜色数组已占同等显存。

`TerrainAtlas.surfaceBuffer` 声明可选的线性表面材质数据。二进制文件按颜色数组相同顺序、每层自底向上存储：RG 为法线 XY、B 为粗糙度、A 为 AO。构建时剥除边距。运行时严格验证字节长度，直接上传数组；不经过 Canvas 的 alpha 预乘或颜色转换，AO 为零也不会损坏法线。未提供表面描述的图集使用颜色照明 shader，不请求额外文件。

两种地表质量共用材质采样：显式 UV 梯度、双偏移宏观混合、镜像重复时修正法线 XY 方向。先对每个参与材质应用法线、粗糙度 GGX 高光和 AO 环境项，再执行原有边界/坡面混合，防止颜色与材质细节使用不同权重。积雪使用相同光照，坡度 .35–.8 逐步降低覆盖，最多减少 85%，保留陡坡裸岩。纹理周期为四格；坡度 .22–.85 增加岩石覆盖，最大 85%。细节不改变几何高度。

颜色数组与战争迷雾纹理声明 sRGB，由采样器解码，表面数组保持线性数据。边界/坡面在线性空间混合，不再提前截断亮度或以 2.2 次幂近似显示转换。

天空、Standard 模型、地面、水面和草共用世界太阳（高度 24°、方位 205°）及预过滤天空。`WorldLighting` 将同源环境图和太阳绑定到自定义材质；地形环境反射已使用 Standard 同源的粗糙度/视角积分，直接高光仍为自身 GGX 近似，边界见[场景照明](../render-streaming.md#场景照明与颜色输出)。移除固定半球/环境补光与战斗层独立补光；雾和投影都参与同一个线性合成。

`Skybox` 使用 Three.js `Sky` 的散射、太阳与云层 shader，初始化及 WebGL 恢复时烘焙六面 256² RGBA16F 立方体（含 mip 约 4 MiB），再生成 768×1024 RGBA16F PMREM（6 MiB）。天空辐射在烘焙源头统一缩放 .25，背景、雾和环境照明共用该结果；曝光由宿主最终输出控制。`skyVisible` 只控制背景与天空雾，关闭背景仍有天空环境照明。

这是静态天空，尚无昼夜变化、逐帧体积云或动态光照编辑入口。帧循环只采样现有纹理，不重新烘焙；恢复时生成新的 PMREM 并重新绑定，旧图立即释放。PMREM 生成器及其临时目标在烘焙结束或失败时释放；没有新增下载资源。线性场景目标、抗锯齿、预算及输出所有权见[渲染流送](../render-streaming.md#场景照明与颜色输出)。

边界遮掩仍使用透明几何：荒野 `BoundaryMist` 为三层水平环面，副本 `ChallengeMist` 为环面与圆筒，家园海面上方为两层水平薄雾。它们叠加二维噪声，不具备体积密度、沿视线散射或场景深度交界消隐；低视角会暴露薄片或壳体边界。与距离雾一起组成当前过渡表现，尚未达到[山地与大气验收目标](visual-overhaul.md#山地与大气验收缺口)。

游戏通过 `GameConfig.presentation.shadowRadius=420` 开启固定 2048² 近景太阳阴影，半宽约 12.35 游戏单位（沿光照平面度量）。陆地、森林、家园建筑及副本实体投影并受影，水面和草受影；树冠风动同步投影，前景透视只改变颜色覆盖，不改变遮光。目标、远行坐标、区块裁剪和释放由[近景太阳阴影合同](../render-streaming.md#近景太阳阴影)统一定义。当前无屏幕空间接触阴影。

CPU 数组与 GPU mip 进入已有资源账本；世界加载等待两个请求，失败明确拒绝，取消或 dispose 终止在途请求，晚到数据不上传，所有材质共同引用的数组只释放一次。验证同时覆盖真实 full/fast 渲染、材质加载/取消及森林所有权，不能只用 shader 文本断言代替画面检查。

游戏 GPU 账本上限由 `GameConfig` 配置，约束所有账户，并非预先分配显存，也不代表驱动实际显存。新增布景在非副本中仍常驻，新增资产或调整分辨率时必须计入完整工作集并重新测量；地图库的通用默认预算不由游戏配置改写。

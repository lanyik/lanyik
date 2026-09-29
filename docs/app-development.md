# 应用、包边界与会话生命周期

导航：[文档索引](README.md#game)

本文负责仓库包边界、启动、主线程集成、状态发布、输入、生命周期和诊断。玩法和表现分别查索引中的领域设计；已有能力与未完成事项只维护在[开发重点](game/development-priorities.md)。

## 应用边界

应用是模块化单体：纯数据核心、Worker 执行端、地图适配器、批量表现、React HUD 和组合入口。[源码分层](README.md#game-structure)规定依赖方向，核心不导入 React、Three.js、DOM、Worker 或地图库内部模块。

游戏状态归应用，地形流送不拥有战斗事实。应用只通过公开地图能力控制镜头、读取线程观测及注册渲染层，不访问 HexMap 私有控制器和 Worker 池。

应用模块只导出实际跨模块或独立行为测试所需接口，实现细节保持私有；基础库公开 API 按包合同维护，不能仅以应用无调用者为由删除。

| 修改内容 | 入口 | 必须联查 |
|---|---|---|
| 组合与页面生命周期 | [bootstrap](../apps/survivor/src/app/bootstrap.tsx) | 失败宿主、监听、资源和重复关闭 |
| 会话、输入与发布 | [CombatSession](../apps/survivor/src/app/CombatSession.ts) | 世代、暂停屏障、命令顺序和快照 |
| 战斗线程 | [worker 目录](../apps/survivor/src/worker/) | 单一权威、序列、缓冲归还、整组关闭 |
| 地图与表现适配 | [adapters](../apps/survivor/src/adapters/)、[presentation](../apps/survivor/src/presentation/) | 单位转换、加载取消、挂载与预算 |
| 存储 | CharacterRepository、SpiritRepository | [角色与永久进度合同](game/character-saves.md) |

## 启动、会话与发布

开始界面先于 3D 和战斗资源创建；种子预览、继续与读档范围由存档设计维护。bootstrap 先建立可显示失败的宿主，再创建资源与会话，同步 WebGL 创建失败也能显示原因和重试。

每局只有一个 Worker CombatSimulation，独占实体、随机流及玩法状态。CombatSession 管加载、暂停/隐藏、输入批次和通知期限；React 消费只读低频快照并提交命令，不修改模拟。快照分支复用及订阅规则归[UI 性能](game/interface-design.md#更新与性能)。

快照公开会话 generation，交互区按世代重建。开始/重开前清空实例、投影、旧角色显示和输入；窗口、选择、浮窗与拖拽不继承上一局，即使新局再次分配相同物品 ID。

命令、死亡和屏障可立即发布状态，常规 HUD 降频发布；表现帧独立转移。线程观测沿现有帧循环采样，口径归[模拟诊断](game/combat-architecture.md#生命周期与诊断)。

成功拾取/开箱后的换装提示只引用实际入包的物品 ID，并随当前库存重新验证；集合有界且排序稳定，手动卸装不伪装成新拾取，重开清空。提示按钮仍提交正式命令。

## 时钟、输入与暂停

HexMap 独占 RAF；应用通过帧事件安排输入、表现/镜头和诊断，不再启动独立绘制循环。固定模拟不随屏幕刷新率变化，积欠 tick 和命令均有界，主线程不等待 Worker 才绘制。

批次顺序、丢弃及线程失败语义归[Worker 合同](game/combat-architecture.md#多-worker-职责与执行协议)，会话只安排完整批次，不插入模拟阶段。暂停先停新 tick，等待在途工作后发零 tick 屏障，收到最终快照再确认。

隐藏、失焦、暂停、死亡和关闭按输入合同清理/停止操作；恢复可见不能覆盖玩家主动暂停。暂停可处理允许的低频角色命令，但移动、施法等实时操作只在有效运行态接受。

会话另向 CombatView 发布表现活动状态：暂停、隐藏、加载、旅行和失败停用动画尾段及声部，死亡只停止玩法时钟，允许主角倒地收尾。音频与主角终态时钟归[角色表现](game/assets.md#主角动作与声音)，不创建第二条 RAF，也不推进权威 tick。

自动战斗通过同一命令通道开启，移动意图在权威 Worker 合成，React 不每帧发送自动移动。手动优先与施法协作见[自动战斗](game/combat-architecture.md#玩家自动战斗)。

查询线程只有显式启用且满足预算/工作量时参与；宿主选项由 bootstrap 校验，生产默认来自 GameConfig。失败不在主线程续跑旧局。

## 世界与表现适配

家园、荒野和副本共享角色检查点，地图源与权威地形必须选择同一 location 和生成参数。旅行先完成 Worker 屏障和自动保存，再替换世界及战斗 Worker；保存失败保留原世界，详见[探索与家园](game/exploration-and-homestead.md)。

加载前的未发布 source 由适配器清理，调用 HexMap.loadWorld 后按地图所有权合同释放。出生搜索有明确范围，找不到合法位置就失败，不能伪造通行或换种子掩盖问题。

游戏坐标与显示缩放由统一配置转换。权威坐标保留双精度，写实例矩阵前转为局部位置，角色、淡出锚与投影共用原点；浮动原点不能改变噪声/纹理相位。

贴地缓存有界，区块/世界/地表变化时失效；表现高度读取生效地表，弹道插值权威 XYZ。模型、动画、特效、掉落和雾的细节归[角色资产](game/assets.md#角色离线处理)、[环境资产](game/assets.md#环境家园与副本)及[技能表现](game/combat-architecture.md#构筑提交与交互)，资源统一归战斗层。

小地图复用地图库 WorldMinimap 与只读总览，RegionMapBinding 隔离 UI 和适配器。地域叠层只计算视口元数据，不能创建远处遭遇或第二个 3D 世界；跨世界预览的临时源有明确关闭边界。

小地图导航转换坐标后提交玩法命令，镜头只跟随 Worker 发布的位置。世界切换取消旧采样；面板卸载、严格模式重挂载及应用关闭释放消费者，早于关闭其世界源和预算账户。交互与探索规则归各自领域。

## 取消、失败与关闭

CombatSession.start 使用加载世代拒绝迟到结果，开始加载即停止时钟、清输入并终止旧战斗线程。主线程拥有全部 Worker 与端口；重开可以复用图形资源，但创建新的整组战斗 Worker。

资产有界并发，fetch 接受初始化取消信号；任一必需资产失败取消同批其他请求并释放半成品。解码不可中断时及时结束等待，晚到结果单独释放，不接收过期挂载；位图、模型、纹理和实例数据都必须有关闭路径。

加载失败、线程错误、非法协议或超时使会话明确失败，关闭整组并拒绝等待者。重试前完整释放，清理失败保留原因并要求刷新，不在半清理对象上再次初始化。

正常 pagehide 停止帧并异步关闭，重复关闭返回同一 Promise；页面进入往返缓存则暂停而不拆掉恢复所需监听。资源失败显示真实原因，不静默换模型、地图或执行后端。

## 包与构建入口

当前根包是 three-hex-map，游戏位于 apps/survivor，通过公开入口消费库。[连续世界重组](decisions/continuous-world-foundation.md)仍是提案，没有移动包或改变导出。

| 入口 | 责任 |
|---|---|
| three-hex-map | HexMap、渲染、世界源、流送、runtime 基础类型、存储能力合同及规范化工具 |
| three-hex-map/persistence | IndexedDB 缓存、稀疏增量与世代检查点实现 |
| three-hex-map/pathfinding | 版本化导航摘要和分层路径查询 |

各入口独立输出 ESM、CommonJS 和类型声明；classic global 只从渲染入口构建，不发布可选持久化/寻路实现。根包不可混入 IndexedDB 实现，构建后由 check:package-boundaries:built 检查。运行时尺寸看当前构建输出，不把旧包大小当固定预算。包没有游戏 simulation 入口。

扩展使用地图公开资源账户和图层宿主，不直接修改共享账本；直接创建 HexMapRendererHost 时传入独占 resources 账户，宿主连同构造失败一起负责释放。森林辅助函数、HDR 和材质所有权见[渲染流送](render-streaming.md)。

库构建先生成森林 LOD、库与世界 Worker，再复制声明的浏览器产物到 public/js。copy-demo-assets.cjs --check 逐字节检查输出与构建/依赖输入；check:generated:built 同时检查受跟踪森林模型。public/js 可重建，public 其余部分包含演示输入和共享资产，不能整目录删除。

Windows [run-demo.bat](../run-demo.bat) 与 [run.bat](../run.bat) 分别启动演示和游戏生产预览，固定仓库工作目录，检查环境/依赖并构建后启动；端口、Node 范围和运行命令以[项目 README](../README.zh-CN.md)及脚本为准。失败保留错误，不终止其他占端口进程，脚本保持 CRLF 和 ASCII 控制台文本。

## 构建与本地诊断

运行命令见[项目 README](../README.zh-CN.md)和[测试策略](testing.md)。开发服务使用源码与热更新，生产预览只提供已有构建；修改源码不会自动更新正在运行的生产包，两种来源的浏览器存档相互独立。

资产准备验证目标 realpath，只替换应用生成目录，不删除源输入或在线下载；来源归资产设计。

RuntimeLog 由 bootstrap 持有，在当前来源本地存储有界事件和错误，低频写入、跨刷新保留。记录命令表示发出操作，不表示已提交；不记录逐 tick 数据或完整角色存档，不上传日志。

存储禁用、配额或损坏时报告原因，不删除原记录或阻断玩法。全局错误/WebGL 监听随应用注销，主界面、菜单与失败界面共用导出入口。浏览器/系统崩溃可能没有末条日志，不能仅靠缺失 pagehide 判定原因。

快捷键避开浏览器保留组合，具体输入见[界面设计](game/interface-design.md)。日志容量与字段读 RuntimeLog，不在文档复制参数。

## 验证

按[变更矩阵](testing.md#change-based-local-validation)选择检查；会话/所有权变化覆盖失败、挂起加载中关闭、旧结果、重复重开、Worker 退出及 UI 身份重置。RuntimeLog 和 Bootstrap 测试覆盖存储失败及监听清理。

交付开发地址前运行 check:app:dev，验证实际 Vite 模块和未打包 Worker；生产构建或 HTTP 200 不能替代。物品协议/线程边界重构后先重启服务并刷新，再检查实际页面。

图形验证同时检查 console error、pageerror 和图形 warning；仅排除测试已明确分类的 Chromium 截图读回性能提示，不能宽泛忽略警告。生命周期与驻留改动追加测试策略要求的长期检查。

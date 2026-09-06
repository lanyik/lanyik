# 应用入口、会话与游戏时钟

状态：已实现。对应 `apps/expedition` 的首个开发阶段，提供真实地表勘察、地块选中、
暂停、1/2/4 倍时间和按种子重新加载星球，并已接入 [矿藏与登陆勘察](./mineral-survey.md)。
工业规则的整体设计见 [App 开发设计](../app-development.md)。建筑、库存、生产和游戏
存档仍待实现；推荐登陆区已通过起步条件筛选，点击其他地块不表示完成建造选址校验。

## 运行与构建

在仓库根目录使用 Node.js 22.12+，首次执行 `npm ci` 安装整个 npm workspace。

| 命令 | 行为 |
|---|---|
| `npm run app:dev` | 准备资产和库输出，启动 `http://127.0.0.1:5173` |
| `npm run app:build` | 准备资产和库输出，检查应用类型，生成 `apps/expedition/dist` |
| `npm run app:preview` | 在 `http://127.0.0.1:4174` 预览已构建的应用 |
| `npm run app:typecheck` | 生成库类型后检查应用、配置和测试 |
| `npm test` | 同时运行基建与应用的纯数据合同测试 |
| `npm run test:app:e2e` | 构建应用并运行真实 Chromium 集成测试 |

应用采用 React 19.2.8、Vite 8.2.2，实际依赖锁定在根 `package-lock.json`。
[`package.json`](../../apps/expedition/package.json) 通过本地包依赖消费
`three-hex-map` 的公开输出；Vite 去重 React 与 Three.js，不直接导入基建源码或
`public/js` 演示产物。基建源码变更后执行 `npm run app:prepare` 更新库输出和资产；
应用源码由 Vite 开发服务器更新。

[`prepare-app-assets.mjs`](../../scripts/prepare-app-assets.mjs) 将现有地形纹理与
oak/palm/pinia 模型复制到应用的 `.assets` 目录。此目录和应用 `dist` 均为忽略提交的
生成物。地形 Worker 通过公开子路径的 `?url` 导入，由 Vite 输出带内容摘要的独立文件。
构建代码放入 `bundles`，避免默认 `assets` 与现有 `Assets` 模型目录在 Windows 上冲突。
地图和模型 URL 使用应用构建的 `BASE_URL`。

## 代码职责

| 入口 | 当前职责 |
|---|---|
| [main.tsx](../../apps/expedition/src/main.tsx) | 启动、启动失败展示和开发热替换时的释放 |
| [bootstrap.tsx](../../apps/expedition/src/app/bootstrap.tsx) | 组合地图、会话、React；持有动画回调、页面事件与退出顺序 |
| [GameSession.ts](../../apps/expedition/src/app/GameSession.ts) | 会话状态、时间/定位命令、勘察报告、选中快照、异步加载发布边界 |
| [WorldView.ts](../../apps/expedition/src/app/WorldView.ts) | 应用实际使用的加载、释放和地块信息接口 |
| [GameClock.ts](../../apps/expedition/src/core/GameClock.ts) | 不依赖 DOM、React 或 Three.js 的固定游戏时钟 |
| [HexWorldView.ts](../../apps/expedition/src/adapters/HexWorldView.ts) | 地形勘察与 source 所有权移交、地图/矿藏层接入、选中与错误转发 |
| [App.tsx](../../apps/expedition/src/presentation/App.tsx) | 订阅会话快照、展示勘察信息、发送暂停/倍率命令和重载请求 |

当前不创建空的工业模拟器、库存容器或通用系统注册器。第一条采集规则实现时再建立
权威资源状态和逐 tick 作业入口，游戏时间随后只提交实际完成的业务 tick。

## 时间合同

固定步长为 100ms，支持 1、2、4 倍。`GameClock.sample()` 接收绝对单调时间戳，转换
为整数微秒后计算差值，避免按帧舍入累计漂移。余数保留到下一次采样；改变倍率时保留
已经累计的游戏时间，不按新倍率重新缩放它。

独立的 `requestAnimationFrame` 驱动会话，地图自己持有渲染循环。暂停、改倍率、
重新可见后，首个动画帧只建立新时间基准；暂停和隐藏期间没有待补算时间。用户主动
暂停不会被页面可见事件取消。当前时钟累计帧间隔最多 250ms，即 4 倍下每次采样最多
推进 10 tick，多余现实时间直接舍弃，没有无限追赶队列。这是调度上界，后续真实工业
负载仍需按总设计验证执行预算与实际倍率显示。

非法、非有限、超出安全整数范围或倒退的时间戳，以及未定义倍率，明确报错。
页面重载或新星球成功加载会从 tick 0、1 倍和未暂停状态开始；本阶段不保存游戏时间。

## 会话状态与所有权

`idle → loading → ready` 是正常启动过程。每个新的加载请求增加会话修订号：旧请求
晚到，无论成功或失败都不能修改当前状态。只有当前加载成功后才重置时钟并发布
`ready`。种子去除两端空白后要求 1–128 字符。

加载期间清除选中、停止时间并禁用时间命令。加载失败或地图报告运行错误时转为
`failed`，展示实际原因并停止时间；用户可以重新发起勘察。失败不会自动替换种子或
生成另一份世界。新勘察先筛选起步区域，通过后在推荐登陆位置加载确定性地形。
初始相机采用约 49° 的斜俯视角，便于同时查看起步空地和周边矿区。游戏入口将
`cameraMaxDistance` 配置为 1800，最近距离沿用 100；首次取景距离为 950，相机高于
目标地表约 712。重新勘察恢复到距离区间中点 950，并保留当前朝向。
地形显示距离为 2800，植被显示距离为 2400；近/中 LOD
距离维持 550/1100，扩大视野时仍由分级细节和现有预算控制绘制开销。
之后沿用地图的移动、旋转和滚轮缩放操作，定位矿区保留当前缩放和朝向。

`HexWorldView` 持有一个 `HexMap`；每次加载创建独立 `ProceduralWorldSource`，先由适配器
拥有并用于可取消的地形勘察，其所有权在调用 `HexMap.loadWorld()` 时移交地图。
地图负责替换时取消旧 Worker 工作、
卸载旧世界和清除地图选中。应用修订号额外保护自身 UI/时间状态的发布。

React 经 `useSyncExternalStore` 读取缓存的只读快照。没有完成 tick 或发生操作时
不会因动画帧重新发布快照。选中信息及其特征数组由会话复制并冻结，外部修改不能
悄悄改变已发布的状态。界面不直接写时钟或地图内部状态。

退出先取消应用动画帧、移除页面监听、卸载 React，再关闭会话并等待地图
`disposeAsync()`。关闭幂等，晚到的加载和选中不能重新打开会话。浏览器进入页面
往返缓存时只暂停，返回时重新检查可见性；实际离开时开始释放。强制关闭页面不保证
异步释放完成，本阶段没有依赖页面关闭事件的存档行为。

## 验证与下一步

[GameClock 测试](../../apps/expedition/tests/GameClock.test.ts) 验证多种刷新率的一致性、
暂停余数、倍率切换、卡顿上界和非法输入。
[GameSession 测试](../../apps/expedition/tests/GameSession.test.ts) 用受控 Promise 验证
竞争加载、异步错误、关闭和过期发布，同时检查隐藏/主动暂停与快照所有权。
[浏览器测试](../../apps/expedition/tests/e2e/application.spec.ts) 使用生产构建，验证真实
Worker、WebGL 地块选中、时间操作、星球替换，以及 Worker 加载失败后的显式重试。
浏览器产物位于 `test-results/app`；CI 同时执行应用构建与应用 E2E。

矿藏与起步区域筛选已实现，正式合同见 [矿藏与登陆勘察](./mineral-survey.md)。下一阶段
接入指挥中心放置、库存和采集闭环；已开采量属于权威玩法状态，不能由地图模型保存。

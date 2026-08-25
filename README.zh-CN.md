# three-hex-map

[English](README.md) | 简体中文

项目关联仓库：[lanyik/lanyik](https://github.com/lanyik/lanyik)。
本定制版本基于原始项目
[gunyakov/three-hex-map](https://github.com/gunyakov/three-hex-map) 开发。

## 程序化世界演示

这是一个以图形表现为核心、风格类似《文明》的 3D 世界查看器。项目保留了上游的实例化地形、水面、海岸、山脉、草地和森林渲染，并加入了基于种子的确定性世界生成。

```bash
npm install
npm start
```

打开 <http://127.0.0.1:3000>。可以通过语言选择器切换英文和简体中文，选择结果会跨刷新保存。在“世界生成”面板中修改种子、宽度或高度并重新生成地图。演示默认生成四向循环的环形世界：越过任意边界后会从另一侧继续。

操作方式：使用 **WASD** 移动，左键选择格子，按住右键拖动环绕观察，滚轮缩放。默认页面只展示图形能力，不会自动启动单位、回合或战争迷雾玩法。

项目基于 [three.js](https://threejs.org/)，通过实例化渲染与自定义着色器构建浏览器端的《文明》风格六边形地形。渲染按可见区块批处理，不会为每个格子单独创建一次绘制。

[在线演示](https://gunyakov.github.io/three-hex-map/public/index.html) · [更新日志](CHANGELOG.md)

![项目截图](public/main.png)

## 主要功能

- **四向环形世界**：支持可选的 `wrapX`/`wrapY` 地图拓扑、物理重复的流式区块、摄像机循环、跨接缝选择、邻居查询、迷雾和寻路。程序化演示默认使用周期噪声并同时循环两个坐标轴。
- **大气天空**：程序化天空穹顶提供蓝色天顶、地平线大气雾和具有物理方向的太阳，低角度观察时不再出现空白背景。
- **完整世界流送**：地形、水面、草地和树木按 `12×12` 逻辑区块拆分。统一调度器负责距离/视锥剔除、三档稳定 LOD、CPU 几何延迟构建、WebGL 延迟上传，以及相互独立的 128 个 GPU 区块缓存和 192 个 CPU 区块缓存。近景保持原始最高细分与装饰密度。
- **大型程序化世界**：宽高均支持 8–512 格。演示使用独立 Worker 生成世界，创建 `512×512` 地图时不会让主线程中的摄像机和界面停止响应。
- **实例化地形**：每个可见区块使用 `InstancedBufferGeometry` 批量绘制陆地、水面、草地和树木；网格线、地貌边缘混合及海滩坡面均由着色器计算。
- **动态水面**：海洋和海岸格子使用正弦波叠加与解析法线生成动画水面，并带有闪光、菲涅尔效果和朝海岸移动的风格化浪花。
- **河流**：给草地格子添加 `"river"` 修饰符即可显示带噪声弯曲河岸、植被带、3D 河床和深浅渐变的动态河道。连接关系根据邻居自动判断，支持交汇、源头、湖泊与入海口。
- **湖泊**：`"lake"` 修饰符会在六边形内部生成湖面并保留噪声弯曲的草地湖岸；相邻湖泊会合并，河道会穿过湖岸流入湖中。
- **森林与草地**：林地格子使用实例化 glTF 树木，不同格子可通过 `treeModel` 混用树种；草地包含受风影响的程序化草叶。两者都会自动避开河流和湖面。
- **城市**：带有 `city` 数据的格子会显示 3D 城市模型和悬浮文字标签。
- **单位与游戏循环**：可选的 `GameEngine` 提供 glTF 动画单位、点击移动、受地形和单位限制的 A* 寻路，以及悬停路线预览。
- **战争迷雾**：未探索格子显示迷雾纹理，已探索但不可见的格子会变暗；效果覆盖地形、水面、草地、树木、城市和单位。可以临时隐藏再恢复而不丢失状态。
- **实时调节**：绝大多数视觉参数都是公开属性背后的实时着色器 uniform，可直接通过演示中的 dat.gui 面板调节，无需重建地图。

## 开始使用

### 本地运行演示

```bash
git clone https://github.com/lanyik/lanyik.git three-hex-map
cd three-hex-map
npm install
npm run start   # 构建库与演示，然后启动 public/ 静态服务器
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。演示入口 [public/index.html](public/index.html) 也是最直接的用法参考，其中配置了控制面板和所有实时参数。

### 作为库使用

three.js 是一个 **peer dependency**，需要由你的页面或构建工具提供。

```ts
import { HexMap } from "three-hex-map";

const map = new HexMap({
    element: "canvas",            // <canvas> 的 CSS 选择器
    size: 40,                     // 六边形外接圆半径，单位为世界坐标
    texturesBaseUrl: "textures/" // terrain.png / land-atlas.json / war-fog.jpg
});

await map.load(mapData);          // MapInfo，参见下方“地图数据”

map.on("click", ({ x, y, tile }) => console.log("clicked", x, y, tile));
map.on("hover", ({ x, y, tile }) => console.log("hover", x, y, tile));
```

永久移除画布时请调用 `map.dispose()`。`GameEngine` 持有自己的地图实例，
对应使用 `game.dispose()` 释放资源。

也可以直接使用包含单位选择、点击移动和单位视野迷雾的游戏循环：

```ts
import { GameEngine } from "three-hex-map";

const game = new GameEngine({ element: "canvas", fogOfWar: true });
await game.init(mapData, unitsData); // unitsData: UnitPlacement[] (id/type/x/y)

game.on("unitClick", coords => console.log(game.currentUnit?.actions));
game.on("end_move", payload => console.log("unit arrived", payload));
```

## 地图数据

`HexMap.load()` 和 `GameEngine.init()` 接收普通的 `MapInfo` 对象。完整示例见 [public/gameInfo/map.json](public/gameInfo/map.json)：

```jsonc
{
  "w": 40,
  "h": 34,
  "wrapX": true,
  "wrapY": true, // 可选；省略或设为 false 时为有边界地图
  "data": {
    "0": {                         // x 列
      "0": {                       // y 行
        "type": "land",            // sea | coastal | land | sand | tundra | snow
        "modifiers": ["wood"],     // 可选修饰符
        "treeModel": "Assets/models/oak", // 可选的格子独立树种
        "city": { "name": "Rome", "model": "Assets/models/monument" }
      }
    }
  }
}
```

横向循环的平顶六边形地图宽度必须为偶数，才能让交错列在接缝处保持相同奇偶关系。`generateWorld({ ..., topology: "toroidal" })` 会强制执行这一限制，并生成四边连续、没有人工海洋衰减的周期地形。

### 格子修饰符

| 修饰符 | 效果 |
|---|---|
| `"hill"` | 显示为丘陵地形 |
| `"wood"` | 在格子上散布实例化树木模型 |
| `"river"` | 生成穿过六边形的动态河道，并自动连接相邻河流、湖泊、海洋和海岸；只有一个出口时会显示源头水潭 |
| `"lake"` | 水面填充六边形并保留草地湖岸；相邻湖泊会合并，相邻河流会通过湖岸开口流入 |

修饰符是自由字符串，因此新增修饰符不需要改变核心数据结构，只需要为读取它的着色器或图集补充支持。

### 单位

单位以位置数组声明：`{ id, type, x, y }`。其中 `type` 是模型文件夹，例如 `Assets/units/viking_boat`，文件夹中包含 `model.glb` 和 `info.json`。`info.json` 同时保存模型校正参数（位移、旋转、缩放）及玩法数据（移动点数、生命值、攻防、视野、允许进入的地形和动画）。树木与城市模型沿用相同的文件夹约定。

## 配置项

除 `element` 外全部可选。完整说明位于 [`HexMapOptions`](src/HexMap.ts)，常用选项如下：

| 分组 | 配置项 |
|---|---|
| 布局 | `size`, `texturesBaseUrl` |
| 网格 | `gridVisible`, `gridColor`, `gridWidth`, `gridOpacity` |
| 水面 | `waterColorShallow/Deep`, `waterWaveAmplitude/Frequency/Speed`, `waterSparkleIntensity`, `waterFresnelIntensity`, `waterDepth`, `beachWidth` |
| 海岸浪花 | `coastalWavesEnabled`, `coastalWaveColor/Count/Speed/Width/Range/Distortion/Opacity` |
| 地貌混合 | `landBlendWidth`, `waterCornerRounding` |
| 河流与湖泊 | `riverWidth`, `riverBankWidth`, `riverCurvature`, `riverColorShallow/Deep`, `riverBankColor`, `riverFlowSpeed`, `riverDepth`, `lakeShoreWidth` |
| 树木 | `treesPerTile`, `treeModel`, `treeScale` |
| 草地 | `grassEnabled`, `grassDensity`, `grassBladeWidth/Height`, `grassWindStrength/Speed` |
| 流式渲染 | `renderDistance`, `lodEnabled`, `lodNearDistance`, `lodFarDistance`, `vegetationRenderDistance`, `chunkLodHysteresis`, `gpuChunkCacheSize`, `cpuChunkCacheSize` |
| 战争迷雾 | `fogTexture`, `fogDarkenFactor`, `fogTextureSize` |
| 仅 GameEngine | `fogOfWar`, `preventCellClick` |

绝大多数配置也作为 `HexMap` 实例上的实时属性公开，例如 `map.riverCurvature = 0.8` 和 `map.waterWaveSpeed = 2`。这些属性直接更新着色器 uniform；只有树木/草地密度和尺寸等少数配置需要重建对应图层。

流式管线、LOD 保证、缓存生命周期及视锥计算详见 [docs/render-streaming.md](docs/render-streaming.md)。运行时统计可以通过 `map.streamingStats` 获取。

生成大型世界时，建议在主线程之外运行生成器：

```ts
import { WorldGeneratorClient } from "three-hex-map";

const generator = new WorldGeneratorClient(
    // 将包中的 world-generator.worker.mjs 复制到公共资源目录。
    new URL("/assets/world-generator.worker.mjs", window.location.href)
);
const world = await generator.generate({
    seed: "continent",
    width: 512,
    height: 512,
    topology: "toroidal"
});
await map.load(world);
generator.dispose();
```

如果不希望预先保存整个世界，可以直接使用多 Worker 无限流式模式。该模式只让镜头附近的 Chunk 驻留在 JavaScript 和 GPU 内存中，以 16 位紧凑数据传输，并在坐标过大前自动平移 Three.js 世界根节点：

```ts
await map.loadInfinite({
    seed: "endless-continent",
    workerUrl: new URL("/assets/world-generator.worker.mjs", window.location.href),
    workerCount: 4,
    chunkSize: 24,
    initialTile: { x: 0, y: 0 }
});

console.log(map.infiniteStreamingStats);
```

`chunkSize` 必须是 12 的倍数；还可配置 `loadRadius`、`retentionRadius`、`maxResidentChunks` 和 `floatingOriginThreshold`。普通演示仍使用有限环形地图，打开 `/?infinite` 可体验无限模式；附加 `x`/`y` 查询参数可以测试极大逻辑坐标。通过 `map.add()` 添加的 `Unit` 会保留在可重定位的世界根节点下；跨未加载 Chunk 的全局模拟和寻路应由上层应用按 Chunk 处理，避免重新把整个世界放回内存。

## 战争迷雾

`HexMap` 会渲染调用方提供的迷雾状态：`map.setTileFog(x, y, state)` 中，`0 = 未探索`（迷雾纹理）、`1 = 已探索`（变暗）、`2 = 当前可见`。开启 `fogOfWar` 的 `GameEngine` 会根据所有单位的位置和视野范围自动更新这些状态。

`map.warFogVisible = false` 可以临时隐藏迷雾用于检查地图。底层状态仍会持续记录，重新设为 `true` 后会恢复最新迷雾结果。

## 事件

`HexMap` 和 `GameEngine` 均继承自 `EventEmitter`。主要事件包括：`load`、`click`、`hover`、`unitClick`、`start_move`、`cell_enter`、`end_move`，以及 `HexMap` 每个渲染帧发出的 `frame` 事件。

## 脚本

| 脚本 | 作用 |
|---|---|
| `npm run build:lib` | 构建 `dist/`，包括 ESM、CJS、全局 UMD 包和类型声明 |
| `npm run build:demo` | 执行 `build:lib`，并将包和第三方资源复制到 `public/` |
| `npm run server` | 在 3000 端口提供 `public/` 静态服务 |
| `npm run start` | 执行 `build:demo` 后启动服务器 |
| `npm run typecheck` | 执行 `tsc --noEmit` |

## 更新日志

发布记录见 [CHANGELOG.md](CHANGELOG.md)。当前包版本为 **0.5.0**，大型世界流送与 LOD 等当前开发内容记录在 **Unreleased** 中。

## 致谢

- 灵感来源：[threejs-hex-map](https://github.com/Bunkerbewohner/threejs-hex-map)。
- 寻路部分基于 weixiaofan 的 [hexpath](https://github.com/weixiaofan/hexpath)[^1]。

## 许可证

[ISC](LICENSE)

[^1]: 相关源码已为 TypeScript 兼容性重新整理为类，并加入单位限制和地形类型支持。

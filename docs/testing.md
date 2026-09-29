# Test strategy

导航：[总导航 · 验证与决策](README.md#verification) · [按任务阅读](README.md#routes)

Tests protect observable behavior and failure boundaries. Counts are not acceptance
targets. Read the owning contract from the [documentation index](README.md) before
choosing checks; development and cleanup criteria are in [AGENTS](../AGENTS.md).

## Test layers

| Layer | What it proves | Location / owning contract |
|---|---|---|
| Unit and contract | Deterministic rules, validation, state transitions and public API results | `tests/helpers`, `tests/world`, `tests/runtime`, `tests/rendering`, `tests/persistence` |
| Fault and interleaving | Cancellation, competing writers, failure, stale publication and resource ownership | Tests beside the owning contract; [foundation](foundation-infrastructure.md) |
| Foundation acceptance | Cross-component invariants beyond individual contract tests | `tests/stability` |
| Browser | Real Workers, WebGL, input routing, recovery and assembled application behavior | `tests/e2e`, `apps/survivor/tests/e2e` |
| Soak | Repeated world replacement and bounded retained resources | `tests/e2e/foundation-soak.spec.ts` |
| World-style review | Topology metrics and far/middle/near/debug captures | `tests/world/worldStyleGallery.review.ts`, `tests/gallery`; [world style](world-style-generation-v1.md) |
| Game simulation | ECS identity, action timing, settlement, status, items and progression | `apps/survivor/tests`; [game contracts](README.md#game) |
| Benchmarks | Reproducible hot-path, simulation and query-worker budgets | [benchmark scope](#benchmark-scope) |
| Documentation | Local links, heading anchors and documentation index reachability | `scripts/check-docs.mjs`, `tests/helpers/documentation.test.js` |
| Optimization decisions | Trigger declarations and committed evidence integrity | [optimization gates](testing.md#优化门禁) |

Use the lowest layer that observes the contract. Similar-looking tests stay when
they protect different commit points, protocol versions or ownership boundaries.
Use controlled promises for interleavings and fixed seeds for stochastic rules;
do not replace behavior assertions with capability flags or implementation-shaped
expectations. Keep compile-time negative assertions: `tsc` checks their
`@ts-expect-error` contracts even when runtime execution is intentionally skipped.

Root tests are grouped by domain: option merging belongs in `tests/helpers`, event
dispatch in `tests/runtime`, and generation/Worker requests in `tests/world`.
Worker mocks are scoped to their own suite and restored after each test.
Inventory shortcut fixtures derive affixes and bonuses through the equipment helper
before real checkpoint restoration; invalid empty-affix gear cannot exercise UI locking.
Browser combat fixtures advance through the session's normal in-flight barrier;
they do not bypass it with direct transport calls, which could race an automatic
save during slow screenshots. Production Worker entry points expose no fixture state.
Pause continuous simulation before awaiting quiescence for a scripted teleport;
the pause helper preserves an already paused session. Fog dragging keeps real
pointer capture and endpoint movement; the separate 100-event burst checks frame
coalescing without redundant browser round trips. The travel-interface fixture
holds a real session's persistence promise between pointer down and up to verify
that autosave cannot swallow destination selection; WebGL journeys remain separate.
Full-resolution homestead/fog journeys allow 360 seconds in software rendering;
the repeated world-replacement journey allows 540 seconds. These are total test
budgets, not relaxed action, loading, Worker-response or performance limits.
Repeated save/load journeys call the public session travel transaction and verify
every return; initial entry, final exit and post-refresh restoration still use UI input.
The assembled HUD/resource journey uses the test Worker's damage-immunity fixture so
software-rendered layout checks cannot kill its actor before keyboard assertions.
Combat death and automatic-combat shutdown remain separate gameplay/Worker checks.
Regional ecology checks keep the full coordinate sweep but validate each immutable
chunk layout once while it remains resident; reconstructed chunk instances are
checked again. Residency, population consumption and reentry have separate checks.
Both TypeScript gates enable unused-declaration checks. Remove dead declarations
instead of preserving test-only production branches or compatibility scaffolding.

## Change-based local validation

Run `npm run check:docs` and `git diff --check` for every change. Add the applicable
rows below; a documentation-only edit does not require a browser soak or CPU benchmark.
Multiple changed boundaries require the union of their checks.

| Changed boundary | Required local checks |
|---|---|
| Documentation, links, navigation only | Documentation gate; manually compare changed behavior descriptions with code |
| Documentation checker | `npm test -- tests/helpers/documentation.test.js` plus the documentation gate against this repository |
| Benchmark sampling, statistics or diagnosis only | Focused benchmark-helper tests and the affected real benchmark scenarios; check every round and instrumented/uninstrumented workload counters |
| Test organization or application export visibility only, without runtime behavior changes | Affected unit suite(s), corresponding typecheck; app export changes also build the app |
| Library algorithms or public types | `npm test`, `npm run typecheck`, `npm run build`; public exports/package changes also `npm run check:package-boundaries:built` |
| Pure gameplay rules, settlement, status, inventory or saves | `npm run test:app`, app typecheck/build; also the relevant browser flows if a published state, command, schema or UI contract changes |
| Input, UI, animation, shaders, asset loading or browser wiring | Affected unit suites and build; `npm run test:e2e` for library behavior or `npm run test:app:e2e` for game behavior |
| Lifecycle ownership, world replacement, Worker/WebGL recovery, scheduling, residency or resource accounting | Affected unit and browser suites plus the 500-iteration soak below |
| Terrain classification, modifiers, vegetation, climate or surface semantics | Library checks and `npm run review:world-style`; game checks when collision or game visuals also change |
| Simulation hot paths, AI, spatial queries or capacities | Game checks plus `npm run benchmark:app`; query scheduling/transport/kernel changes also `npm run benchmark:app:workers` |
| Library hot paths or memory layout | Library checks plus `npm run benchmark:check` |
| Enemy stats or combat formulas | Game checks and `npm run report:combat-balance`; review the regenerated calibration against [balance rules](game/items.md#数值校准) |
| Inventory/HUD rendering performance | UI/browser checks and the full-inventory measurement described in [UI performance](game/interface-design.md#更新与性能) |
| Build, generation inputs, package outputs or optimization register | Owning checks plus `check:generated`, `check:package-boundaries` or `check:optimization-gates` as applicable |

Game tests consume the built library. After a clean install or changes to library
code/assets, first run `npm run app:prepare`. Thereafter
`npm run build --workspace @preview/survivor` typechecks and builds the app without
rebuilding unchanged inputs. `npm run app:build` includes the preparation step.
Do not race tests or typechecks against a command that replaces their `dist` or
`apps/survivor/.assets` inputs; finish asset preparation before starting game tests.

For lifecycle changes, in PowerShell:

```powershell
$env:FOUNDATION_SOAK_ITERATIONS='500'
npm run test:soak
Remove-Item Env:FOUNDATION_SOAK_ITERATIONS
```

Before handing off a running development URL, run `npm run check:app:dev` against
the existing server on port 5173. This checks actual Vite modules and the unbundled
Worker, including item generation/pickup, skill dragging, map sampling, narrow
layouts and shader errors. A production build or HTTP 200 does not prove that the
development server is serving the current modules. Item-schema or cross-Worker
contract refactors require a development restart and refresh before this check.

## CI and release gates

[CI](../.github/workflows/ci.yml) runs the complete verification set on pushes and
pull requests: documentation, root tests/types, optimization register, library
build, app types/tests, both game benchmarks, generated artifact consistency,
package boundaries and library hot-path budgets. Browser jobs then run library
and game E2E; the scheduled job additionally enables the 500-iteration soak.
The local matrix selects relevant checks without weakening this CI coverage.

The verify job checks and benchmarks its already-built outputs using
`check:generated:built`, `check:package-boundaries:built` and `benchmark:check:built`.
The unsuffixed commands build first and are self-contained for local use.
Release or infrastructure freeze acceptance runs the complete set and the soak;
the [foundation contract](foundation-infrastructure.md) defines the protected invariants.

`check:optimization-gates` validates structured evidence and trigger states; CI
software rendering does not substitute for physical GPU evidence. Gallery captures,
pixel comparisons and WebGL counters prove different things from Node CPU timing.
See [validation inputs and local outputs](README.md#evidence) for retention
boundaries. Historical reports are not maintained in the current documentation tree.

## Benchmark scope

The library benchmark performs an untimed warmup and five measured runs and gates
the median. JSON includes runtime, CPU, raw samples and spread. `--check` requires
`--expose-gc`; warmups accept 1–5, samples an odd 3–15 and threshold scale a positive
finite value through the `FOUNDATION_BENCHMARK_*` variables. Invalid values fail.

Game timing separates real travel combat, full-capacity AI/movement/attack generation
and procedural-terrain combat. Travel health is restored between ticks to measure
the complete route with actual hit settlement; crowded input discards hits so all
targets remain available. Neither establishes starter-character survival or GPU
frame rate. Exact scene construction and budgets live in
[the benchmark](../scripts/benchmark-survivor.mjs); ownership and capability limits belong to
[simulation and AI](game/combat-architecture.md#实体时钟与容量) and [terrain navigation](game/exploration-and-homestead.md#通行数据).

`enemyNavigation` and `enemyCrowd` additionally measure eight actors escaping a
concave wall and approaching from one side of the player. They disable attacks,
retain real behavior/movement, and report arrivals, overlap pairs and spacing
outside the timed operation. Stationary actor-ticks include intentional waiting
at a destination and are not solely terrain stalls. Gameplay changes compare
these outcomes separately from CPU cost; they do not require old combat RNG to match.

`npm run benchmark:app` retains latency statistics for all five rounds: nearest-rank
P50/P95/P99, maximum, worst 1-based sample ordinals, over-budget count/fraction, longest
consecutive run and cumulative excess. Pooled percentiles use all operations;
consecutive runs never cross round boundaries. Fixed timing buffers are allocated
before each loop; setup, resets, assertions and report construction are excluded.
Cold fixture operations remain measured, with construction time reported separately
where applicable. This operation-only mean is not a before/after speedup against old
reports that included loop bookkeeping.

The existing mean-budget gate remains enforced. Per-operation overruns against that
budget and the simulation tick period are observations, not newly calibrated CI limits.
Maximum and sample identity matter when synchronized events occupy less than 1% of
ticks; a low P99 alone does not establish smooth execution.

For focused diagnosis, run
`node --expose-gc scripts/benchmark-survivor.mjs --check --scenarios=fireEffects,autoAvoidance,terrain,autoCombat --profile --output=report.json`.
Omit `--scenarios` for the full suite. Output contains the source commit, benchmark
source hashes and runtime bundle hash. Stage probes run in separate repeated fixtures
after ordinary samples, time synchronous inclusive/self cost and count calls, and
record bounded GC events overlapping measured operations. Nested inclusive costs
must not be added together; probe overhead and GC correlation are not causal or FPS
claims. Workload counters must match the corresponding uninstrumented fixtures.
Profiles are limited to those four scenarios; no timers or hooks enter the production
simulation, Worker protocol or UI. These artificial pressure workloads do not
establish a full-capacity browser guarantee. Keep generated reports in ignored
local output directories rather than committing them as documentation.
For a same-harness comparison, `--runtime-ref=<commit-hash>` bundles the committed
TypeScript runtime through Git reads; installed dependencies and built library inputs
stay the same. The report identifies that runtime separately from the benchmark source.
Relative TypeScript imports resolve against that Git tree, including files renamed
or removed in the current worktree.

Gameplay streaming CPU samples include one prefetch job per moving tick in the
explicit immediate runner. Cache growth now occurs before residency changes and
may include a window not reached by the end of a replay; compare authoritative
state separately from these intentionally changed cache counters. Preparation is
included in the independent stage profile, not hidden as untimed setup.
`node --expose-gc scripts/benchmark-survivor-streaming.mjs <output.json>` additionally
runs the scheduled path through real Node MessageChannel tasks: one warmup and five
rounds of startup, 600 travel/automatic ticks and far teleport. It retains wall time,
yield wait and uninterrupted slice timings, and compares checkpoints/RNG, snapshots,
entity arrays and regional layouts with the immediate runner outside timed operations.
Slice timing is diagnostic instrumentation; startup includes construction and the
teleport destination is validated before measurement. It does not establish browser
input latency. Compare revisions with the same harness and validate historical
runtime replay separately from timing observations.

The query benchmark includes candidate preparation, copy, transfer and join costs,
with the stationary index built before timing. It measures real Node threads, not
browser input latency. Serial and scheduled full-capacity queries have budget gates;
enabling production parallel queries additionally requires an improvement over
serial execution. Configuration and thresholds live in the query benchmark and GameConfig;
authority and cancellation follow the [Worker contract](game/combat-architecture.md#多-worker-职责与执行协议).

`node --expose-gc scripts/benchmark-survivor-pipeline.mjs <baseline-commit>` builds
the committed baseline through Git reads without replacing the worktree. It times
expiry events and snapshot sharing separately, checks an exact 1,200-tick open-terrain replay,
and compares native render copies with sparse slot writes. Snapshot cloning and
status setup are excluded from their respective timings; this is Node CPU evidence.
`--replay-only` skips timings. Replay also covers 600 ticks each of procedural-terrain
travel and automatic combat, comparing checkpoints (including RNG), UI snapshots,
entity component arrays and regional layouts every 60 ticks against the baseline.
An interleaved burn replay also compares admission, replacement, consumption, cleanse,
callback reapplication, entity reuse, ordered damage events and individual saved layers.
Avoidance replay compares 288 candidate scores across positive/negative chunk boundaries,
curved shots, different heights, early score limits and reused projectile slots.
`node scripts/benchmark-survivor-combat.mjs <preview-url>` observes the complete
2560×1440 browser path with a valid mixed-school build, moving/resting input,
durable enemies and replenished player vitals. It retains real casting, AI, hit
settlement, Worker pacing and rendering; an 8-second warmup precedes a 15-second
sample. It asserts that all three status families actually occur, reports raw
diagnostic windows and never infers GPU timing from frame rate.

## 视觉改造样板

在已构建的游戏生产预览上运行：

```powershell
node scripts/review-survivor-visual.mjs http://127.0.0.1:4174 .browser-artifacts/visual-current
```

固定输入归 [B1 fixture](../scripts/lib/survivor-visual-fixture.ts)，美术范围归[视觉改造](game/visual-overhaul.md#b1-固定光照样本)。采样在独立浏览器上下文运行，不读取或覆盖用户存档。三个静止检查点分别预热 2 秒、采样 3 秒，再加载林地检查点进行真实键盘移动与战斗；帧样本上限为 4096，越界失败。可在命令末尾添加 `--play=forest`、`--play=clearing` 或 `--play=shore` 打开可操作窗口，关闭窗口结束脚本。

同一命令末尾加 `--route` 可记录真实首领副本的 camp/path/bank/boss 四个检查点，或用 `--play=camp`（也支持 path/bank/boss）直接游玩。副本检查点通过正常卷轴开场规则生成，然后使用已有会话加载入口；布局共用生产 `ChallengeLayout`，首领观测点在出生位置前方 4 单位，避免暂停画面重叠。前后对照逐点核对 checkpoints.json，只比较字节一致的检查点。路线上每段可走性由 `ChallengeTerrain.test.ts` 连续扫掠验证；该采样视频是分检查点展示加短实战窗口，未证明全路线实战存活或最终美术完成。

检查绘制缓冲确为 2560×1440，以及生产近景阴影已启用、半宽 420、目标实际分配为 2048²，保存原尺寸截图、720p 视频、检查点和 JSON。CPU 统计来自地图 afterframe，GPU 来自已有异步 timer 的新样本；分别记录样本量、P50/P95/P99/max、查询支持/丢弃情况、浏览器、设备标识及账本估算，不从帧率推导 GPU 耗时。显存账本不是驱动实测 VRAM；硬件/驱动及目标配置需随验收证据登记。静止样本不代表完整游戏性能，移动样本的真实战斗结果也不应伪装为固定 tick 重放。编译警告单独保留，运行时和 shader 错误使采样失败。

报告记录 fixture 哈希和浏览器实际加载脚本的路径/内容哈希；工作区 HEAD 仅是来源背景，不代表尚未提交的构建内容。输入延迟保留会话诊断窗口的读数，不把重复读取当作独立输入事件。

Windows 独显回归可显式设置 `$env:PLAYWRIGHT_ANGLE_BACKEND='d3d11'` 后运行 `npm run test:app:e2e`，完成后 `Remove-Item Env:PLAYWRIGHT_ANGLE_BACKEND`。省略变量沿用默认浏览器后端；不自动切换，也不放宽交互超时。B1 本机默认后端实际为 SwiftShader，HDR 场景约两秒一帧并导致传送点击超时，因此完整游戏回归使用独显，软件路径不宣称通过。

游戏浏览器检查保留全部运行时错误和未知图形警告，仅将截图回读通知及 ANGLE X4122 中小于双精度相对舍入精度的常量加法诊断视为非故障；每行诊断均须匹配，混合警告和 shader 编译错误仍失败。视觉原始报告保留这些编译警告，不修改生产日志。

浏览器 `linear-lighting.spec.ts` 验证 HDR 高亮、透明线性混合、Raw/标准材质同输出、真实环境反射及缩放记账；`near-shadows.spec.ts` 读回实际像素，验证 full/fast 地形和 Standard 同受影、环境光保留、alpha-test、实例 morph 投影与原点重置。单测验证绝对 texel 对齐、镜头外投影区块驻留和 32 MiB 固定预留；恢复及 500 次切图 soak 显式启用阴影。根演示加 `?shadows`（已有查询参数时用 `&shadows`）可查看同档效果。

`forest-wind.spec.ts` 通过实际颜色/深度材质像素检查树根固定、树冠位移、不同细分档共享相位、周期边界连续及 4096/8192 单位原点平移；单测检查共享深度材质跨 LOD/副本保留并只释放一次，以及裁剪边界覆盖风动。路线和荒野样板使用生产树木，不冻结环境时钟；前后照片和短测不属于同风相位重放，动作以短视频和受控像素测试复核。

副本连续岸坡由 `ChallengeSurface.test.ts` 验证水线接缝、可达地面高度、贴图记账及投影目标的借用所有权；`ChallengeTerrain.test.ts` 保留路线、出生与碰撞边界。`boss-challenge.spec.ts` 在真实副本检查作者地面、营火、阴影、内置六边形表面退出以及切图复用；资产测试验证六张 512² 贴图重复构建字节一致。`fog-and-damage.spec.ts` 的远景雾对照明确选择已驻留的可见陆地网格，避免把同样含有 terrain 注释的草/水 shader 当作陆地探针。

## Meaning of the 500-iteration soak

One iteration is one `HexMap.loadWorld()` replacement, not a tick or terrain tile.
Every twenty-fifth iteration starts competing loads and requires the last to win.
The settled session is sampled for lifecycle work, shared work domains, residency,
WebGL resources, GPU queries and heap bounds. The active minimap may retain its
designed two non-critical overview requests; superseded work domains cannot accumulate.
Final disposal releases the minimap and map, leaving no queued work or budget
reservations. Deterministic interleaving tests remain necessary to diagnose failures.

## 优化门禁

[optimization-gates.json](optimization-gates.json)是高成本优化的机器登记；运行 npm run check:optimization-gates 检查所属文档 marker、测量命令、触发表达式、证据和决策路径。它验证决策完整性，不代表 CI 已测得物理 GPU 或视觉质量阈值。

状态依次为 deferred → triggered → approved → implemented。deferred 不附触发证据、不开始实现；triggered 至少有一份本地 JSON 满足完整触发组；approved 还需审阅后的决策接受成本与验证计划；implemented 要求设计、实现及所属合同已一起落地。组内 AND、组间 OR，布尔指标只按精确相等判断，不能跳过触发和决策。

证据 schema、字段和运算以[检查器](../scripts/check-optimization-gates.mjs)及登记为准。非 deferred 状态必须引用真实存在的输入，检查器重新计算触发条件；口头宣称或无关文件不能推进状态。批准还需仓库内决策记录，可直接写在所属设计中，无需另建一篇。只保留当前门禁实际读取的最小依据，普通历史报告和截图按[本地产物规则](README.md#evidence)清理。

当前 [WebGPU/GPU 裁剪](render-streaming.md#渲染后端与优化门禁)仍待实机瓶颈证据；[自动河网](world-style-generation-v1.md#海域与排水河网)已因明确用户需求实现。河网也可由重复缺陷或玩法需求触发，具体组合归 JSON，不能用河网需求替代 GPU 证据，也不能把视觉河流描述为可导航/可编辑水系。

新增优化先登记所属文档、marker、可复现测量入口及触发条件；证据通过并明确批准后再展开实现设计。

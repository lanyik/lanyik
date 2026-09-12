import { memo } from "react";
import type { WorkerLoad } from "../app/WorkerLoadSampler";
import type { RuntimePerformanceSnapshot } from "../app/FramePerformance";
import { GAME_CONFIG } from "../core/GameConfig";

const ms = (value: number | undefined) => value === undefined ? "—" : `${value.toFixed(1)} ms`;

export const WorkerLoadPanel = memo(function WorkerLoadPanel({ workers, performance: perf }: {
    readonly workers: readonly WorkerLoad[]; readonly performance: RuntimePerformanceSnapshot | undefined;
}) {
    return <section className="worker-load" aria-label="Worker 负载">
        <header><strong>帧与响应</strong><span>{perf ? `${(perf.windowMs / 1000).toFixed(1)} 秒` : "采样中"}</span></header>
        <dl className="frame-summary" data-runtime-fps={perf?.fps}>
            <div><dt>FPS</dt><dd>{perf?.fps?.toFixed(1) ?? "—"}</dd></div>
            <div title="按主循环加收包均摊耗时、GPU 较慢的一侧倒推；未包含所有页面工作，属于耗时估算"><dt>理论 FPS{perf?.gpuMs === undefined ? " · CPU" : ""}</dt><dd>{perf?.theoreticalFps?.toFixed(0) ?? "—"}</dd></div>
            <div title="窗口内实际完成的逻辑 tick；批次跨窗口送达会有波动"><dt>逻辑 Hz / 目标</dt><dd>{perf?.logicalHz.toFixed(1) ?? "—"} / {GAME_CONFIG.timing.simulationHz}</dd></div>
            <div title="1000 / 每 tick 平均完整模拟耗时，包含必需查询等待；只估算吞吐能力，不改变目标频率"><dt>预计逻辑上限</dt><dd>{perf?.theoreticalLogicHz?.toFixed(0) ?? "—"} Hz</dd></div>
            <div><dt>帧间隔 P95</dt><dd>{ms(perf?.frameP95Ms)}</dd></div>
            <div title="统一帧回调内的平均耗时；浏览器布局与异步 UI 工作另外观察长帧"><dt>主循环 CPU</dt><dd>{ms(perf?.mainMs)}</dd></div>
            <div title={perf?.gpuSupported ? `异步 GPU 计时，样本年龄 ${ms(perf.gpuSampleAgeMs)}` : "GPU 计时不可用或尚未采样"}><dt>GPU</dt><dd>{ms(perf?.gpuMs)}</dd></div>
            <div title="距离收到最近完整模拟结果的时间；暂停时结果不更新"><dt>快照年龄{perf && !perf.running ? " · 暂停" : ""}</dt><dd>{ms(perf?.snapshotAgeMs)}</dd></div>
            <div title="最近一次移动输入变化，从主线程采样到采用该输入的结果被绘制；不含设备与输入事件排队"><dt>采样→绘制</dt><dd>{ms(perf?.inputLatencyMs)}</dd></div>
            <div title="每 tick 完整模拟耗时占目标周期的比例，包含必需查询等待"><dt>逻辑预算占比</dt><dd>{perf?.logicBudgetPercent === undefined ? "—" : `${perf.logicBudgetPercent.toFixed(1)}%`}</dd></div>
        </dl>
        <details className="frame-details"><summary>阶段耗时与积压</summary>
            <dl>
                <div><dt>主循环 P95</dt><dd>{ms(perf?.mainP95Ms)}</dd></div>
                <div><dt>每 tick / 执行段</dt><dd>{ms(perf?.logicStepMs)} / {ms(perf?.logicExecuteMs)}</dd></div>
                <div><dt>AI 近 / 远 / UI</dt><dd>{GAME_CONFIG.timing.activeAiHz} / {GAME_CONFIG.timing.distantAiHz} / {GAME_CONFIG.timing.snapshotHz} Hz</dd></div>
                <div><dt>角色 / 镜头</dt><dd>{ms(perf?.presentationMs)}</dd></div>
                <div><dt>地图挂载队列</dt><dd>{ms(perf?.mountMs)}</dd></div>
                <div><dt>收包 / UI 发布</dt><dd>{ms(perf?.messageMs)}</dd></div>
                <div><dt>浏览器长帧数</dt><dd>{perf?.longFrames ?? "—"}</dd></div>
                <div><dt>最长浏览器帧</dt><dd>{ms(perf?.longFrameMaxMs)}</dd></div>
                <div><dt>长帧阻塞 / 渲染尾段</dt><dd>{ms(perf?.blockingMaxMs)} / {ms(perf?.layoutMaxMs)}</dd></div>
                <div><dt>最近模拟执行</dt><dd>{ms(perf?.executeMs)}</dd></div>
                <div><dt>最近查询等待</dt><dd>{ms(perf?.queryWaitMs)}</dd></div>
                <div><dt>最近通信 / 调度</dt><dd>{ms(perf?.transportMs)}</dd></div>
                <div><dt>最近完整往返</dt><dd>{ms(perf?.roundTripMs)}</dd></div>
                <div><dt>在途批次 / 积压 tick</dt><dd>{perf ? `${perf.pendingRequests} / ${perf.pendingSteps}` : "—"}</dd></div>
                <div><dt>积压丢弃 tick</dt><dd>{perf?.droppedSteps ?? "—"}</dd></div>
                <div title={`本局累计：帧间隔超过 ${GAME_CONFIG.timing.maxCatchUpMs}ms 追赶上限而裁掉的时间；暂停和隐藏时间不计入`}><dt>超出追赶上限</dt><dd>{ms(perf?.clockClampedMs)}</dd></div>
            </dl>
            <p className="worker-load-note">浏览器长帧覆盖超过 50ms 的页面工作；不可用时显示 —。</p>
        </details>
        <header><strong>Worker 负载</strong><span>{perf ? `${(perf.windowMs / 1000).toFixed(1)} 秒` : "采样中"}</span></header>
        <div className="worker-load-columns"><span>线程 / 任务频率</span><span>占用</span><span>最近耗时</span></div>
        {workers.map(worker => <div className="worker-load-row" key={worker.key} data-worker={worker.key}
            data-occupancy={worker.occupancy} data-completed={worker.completed} data-sampled={worker.sampled}
            title={`${worker.label} · 已完成 ${worker.completed} 次${worker.busy ? ` · 在途${worker.task ? `：${worker.task}` : ""}` : ""}`}>
            <span className="worker-load-name">{worker.label}<small>{worker.sampled ? `${worker.tasksPerSecond.toFixed(1)} 次/s` : "采样中"}</small></span>
            <span className="worker-load-meter"><i style={{ width: `${worker.occupancy * 100}%` }} /><b>{worker.sampled ? `${(worker.occupancy * 100).toFixed(1)}%` : "—"}</b></span>
            <span className="worker-load-time">{worker.completed ? `${worker.lastTaskMs.toFixed(2)} ms` : "—"}</span>
        </div>)}
        <p className="worker-load-note">模拟固定 {GAME_CONFIG.timing.simulationHz}Hz · 碰撞按 tick 需求 · 地形按需<br />任务占用含通信与等待</p>
    </section>;
});

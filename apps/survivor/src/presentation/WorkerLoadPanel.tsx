import { memo } from "react";
import type { WorkerLoad } from "../app/WorkerLoadSampler";
import type { RuntimePerformanceSnapshot } from "../app/FramePerformance";

const ms = (value: number | undefined) => value === undefined ? "—" : `${value.toFixed(1)} ms`;

export const WorkerLoadPanel = memo(function WorkerLoadPanel({ workers, performance: perf }: {
    readonly workers: readonly WorkerLoad[]; readonly performance: RuntimePerformanceSnapshot | undefined;
}) {
    return <section className="worker-load" aria-label="Worker 负载">
        <header><strong>帧与响应</strong><span>{perf ? `${(perf.windowMs / 1000).toFixed(1)} 秒` : "采样中"}</span></header>
        <dl className="frame-summary" data-runtime-fps={perf?.fps}>
            <div><dt>FPS</dt><dd>{perf?.fps?.toFixed(1) ?? "—"}</dd></div>
            <div><dt>帧间隔 P95</dt><dd>{ms(perf?.frameP95Ms)}</dd></div>
            <div title="统一帧回调内的平均耗时；浏览器布局与异步 UI 工作另外观察长帧"><dt>主循环 CPU</dt><dd>{ms(perf?.mainMs)}</dd></div>
            <div title={perf?.gpuSupported ? `异步 GPU 计时，样本年龄 ${ms(perf.gpuSampleAgeMs)}` : "GPU 计时不可用或尚未采样"}><dt>GPU</dt><dd>{ms(perf?.gpuMs)}</dd></div>
            <div title="距离收到最近完整模拟结果的时间；暂停时结果不更新"><dt>快照年龄{perf && !perf.running ? " · 暂停" : ""}</dt><dd>{ms(perf?.snapshotAgeMs)}</dd></div>
            <div title="最近一次移动输入变化，从主线程采样到采用该输入的结果被绘制；不含设备与输入事件排队"><dt>采样→绘制</dt><dd>{ms(perf?.inputLatencyMs)}</dd></div>
        </dl>
        <details className="frame-details"><summary>阶段耗时与积压</summary>
            <dl>
                <div><dt>主循环 P95</dt><dd>{ms(perf?.mainP95Ms)}</dd></div>
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
                <div title="本局累计：帧间隔超过 250ms 追赶上限而裁掉的时间；暂停和隐藏时间不计入"><dt>超出追赶上限</dt><dd>{ms(perf?.clockClampedMs)}</dd></div>
                <div><dt>延后任务 / 累计失效</dt><dd>{perf ? `${perf.deferredPending} / ${perf.deferredDiscarded}` : "—"}</dd></div>
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
        <p className="worker-load-note">任务占用含通信与等待</p>
    </section>;
});

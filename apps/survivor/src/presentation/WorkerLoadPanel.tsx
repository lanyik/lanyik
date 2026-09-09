import { memo } from "react";
import type { WorkerLoad } from "../app/WorkerLoadSampler";

export const WorkerLoadPanel = memo(function WorkerLoadPanel({ workers }: { readonly workers: readonly WorkerLoad[] }) {
    return <section className="worker-load" aria-label="Worker 负载">
        <header><strong>Worker 负载</strong><span>近 1 秒</span></header>
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

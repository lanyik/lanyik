import { useState } from "react";
import type { RuntimeLog } from "../app/RuntimeLog";

export function RuntimeLogExport({ log }: { readonly log: RuntimeLog }) {
    const [error, setError] = useState(log.storageError);
    const download = () => {
        const url = URL.createObjectURL(new Blob([log.export()], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = `rift-diagnostics-${Date.now()}.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setError(log.storageError);
    };
    return <div className="runtime-log-tools"><button onClick={download}>导出诊断日志</button>
        <small>最近 64 条，仅保存在当前浏览器。</small>{error && <span role="alert">日志记录不可用：{error}</span>}</div>;
}

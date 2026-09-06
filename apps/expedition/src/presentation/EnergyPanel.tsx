import type { PowerSnapshot } from "../core/power/PowerGrid";

export function EnergyPanel({ power, paused }: { power: PowerSnapshot; paused: boolean }) {
    const seconds = Math.ceil(power.ticksUntilChange / 10);
    return <details className="energy-panel" data-testid="energy-panel" data-daylight={power.daylight} data-generation={power.generationKW}
        data-consumption={power.consumedKW} data-stored-joules={power.storedJ}>
        <summary><span className="day-phase">{power.daylight ? "☀ 白昼" : "☾ 夜间"} <small>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</small></span>
            <span>发电 <b>{power.generationKW}</b> / 需求 <b>{power.demandKW}</b> kW</span>
            <span>储能 <b>{(power.storedJ / 1000).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}</b> kJ</span>
            <span className="energy-expand">{paused ? "已暂停" : "电网详情"} ▾</span></summary>
        <div className="energy-details">
            <p>第 {power.day} 日 · 白昼 3 分钟 / 夜间 1 分钟 · 发电先供应设备，余电充能。</p>
            {power.networks.map(network => <div className="network-row" key={network.id} data-network={network.id}>
                <strong>电网 {network.id.replace("building-", "#")}</strong><span>{network.members} 台设备</span>
                <span>发电 {network.generationKW} / 需求 {network.demandKW} / 供给 {network.consumedKW} kW</span>
                <span>储能 {(network.storedJ / 1000).toLocaleString("zh-CN")} / {(network.capacityJ / 1000).toLocaleString("zh-CN")} kJ</span>
                <span>充电 {network.chargeKW} / 放电 {network.dischargeKW} kW</span>
            </div>)}
            <p>各电网独立结算；优先级相同时按建造顺序供电。暂停期间功率读数保留，电量不变。</p>
        </div>
    </details>;
}

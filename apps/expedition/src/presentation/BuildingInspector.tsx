import type { GameSession, SessionSnapshot } from "../app/GameSession";
import { BUILDINGS, MINING_CYCLE_TICKS } from "../content/buildings";
import { POWER_PRIORITIES, PRIORITY_NAMES, type PowerPriority } from "../content/energy";
import { ITEM_IDS, ITEMS, type ItemAmounts } from "../content/items";
import { MINERALS } from "../content/minerals";
import { RECIPES, RECIPE_IDS, type RecipeId } from "../content/recipes";
import type { BuildingStatus } from "../core/construction/Industry";

const statuses: Record<BuildingStatus, string> = {
    ready: "运行正常", mining: "采集中", processing: "加工中", "warehouse-full": "仓库已满", depleted: "矿点已枯竭",
    disconnected: "作业通路中断", disabled: "已停机", "no-grid": "未接入电网", "insufficient-power": "供电不足",
    "missing-input": "缺少原料", "output-full": "产物等待仓容", "output-pending": "产物待入库", night: "夜间停发", charging: "充电中", discharging: "放电中"
};
const materialText = (values: ItemAmounts) => ITEM_IDS.filter(id => values[id]).map(id => `${values[id]} ${ITEMS[id].name}`).join(" + ");
const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });

export function BuildingInspector({ session, state }: { session: GameSession; state: SessionSnapshot }) {
    const building = state.selectedBuilding;
    if (!building) return null;
    const definition = BUILDINGS[building.kind];
    const power = building.power;
    const network = state.industry?.power.networks.find(network => network.id === power?.networkId);
    const recipe = building.recipe && RECIPES[building.recipe];
    const batch = building.batch && RECIPES[building.batch.recipe];
    const disabled = state.status !== "ready";
    return <section className="building-inspection" data-testid="building-inspection" data-building={building.kind}>
        <div className="inspection-heading"><h3>{definition.name}</h3><span className="building-state" data-status={building.status}>
            {state.paused && ["mining", "processing", "charging", "discharging"].includes(building.status) ? "时间已暂停" : statuses[building.status]}</span></div>
        {building.mineral && <>
            <p>{MINERALS[building.mineral.mineral].name} · 5 单位 / 秒</p>
            <progress aria-label="采集进度" max={MINING_CYCLE_TICKS} value={building.progress} />
            <p>剩余矿量 <b data-testid="mine-remaining">{number(building.remaining!)}</b></p>
        </>}
        {definition.storage > 0 && <p>提供 {number(definition.storage)} 单位共享仓容</p>}
        {recipe && <div className="recipe-controls">
            <label htmlFor="building-recipe">加工配方</label>
            <select id="building-recipe" value={building.recipe} disabled={disabled} onChange={event => session.dispatch({
                type: "configure-building", id: building.id, recipe: event.target.value as RecipeId
            })}>{RECIPE_IDS.map(id => <option key={id} value={id}>{RECIPES[id].name}</option>)}</select>
            <p className="recipe-flow">{materialText(recipe.inputs)} → {materialText(recipe.outputs)} · {recipe.ticks / 10} 秒</p>
            {batch && <p>当前批次：{batch.name}{building.batch!.recipe !== building.recipe ? " · 完成后切换" : ""}</p>}
            <progress aria-label="加工进度" max={batch?.ticks ?? recipe.ticks} value={building.batch?.progress ?? 0} />
        </div>}
        {power && <div className="device-power" data-testid="device-power" data-network={power.networkId ?? "none"}>
            <p>接入电网 <b>{power.networkId?.replace("building-", "#") ?? "尚未覆盖"}</b></p>
            {definition.power?.demandKW && <p>设备用电 <b>{power.consumedKW} / {definition.power.demandKW} kW</b></p>}
            {definition.power?.generation && <p>发电功率 <b>{power.generationKW} kW</b></p>}
            {definition.power?.node && <p>供电覆盖 <b>{definition.power.node.coverage} 格 · 节点连接 {definition.power.node.linkRange} 格</b></p>}
            {definition.power?.storage && <>
                <p>储存电量 <b data-testid="battery-energy" data-joules={power.storedJ}>{number(power.storedJ / 1000)} / {number(power.capacityJ / 1000)} kJ</b></p>
                <progress aria-label="储能电量" max={power.capacityJ} value={power.storedJ} />
                <p>充电 / 放电 <b>{power.chargeKW} / {power.dischargeKW} kW</b></p>
                <small>拆除退还建材，储存电量不回收。</small>
            </>}
            {network && <p>本网发电 / 需求 <b>{network.generationKW} / {network.demandKW} kW</b></p>}
        </div>}
        {definition.power?.demandKW && <label className="priority-control">供电优先级
            <select aria-label="供电优先级" value={building.priority} disabled={disabled} onChange={event => session.dispatch({
                type: "configure-building", id: building.id, priority: Number(event.target.value) as PowerPriority
            })}>{POWER_PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_NAMES[priority]}</option>)}</select>
        </label>}
        {definition.power && building.kind !== "command-center" && building.kind !== "power-relay" && <button className="device-toggle" disabled={disabled}
            onClick={() => session.dispatch({ type: "configure-building", id: building.id, enabled: !building.enabled })}>{building.enabled ? "停止运行" : "启动设备"}</button>}
        {building.kind !== "command-center" && <button className="demolish-button" disabled={disabled}
            onClick={() => session.dispatch({ type: "demolish", id: building.id })}>拆除并回收材料</button>}
    </section>;
}

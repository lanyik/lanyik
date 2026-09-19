import { useMemo, useState } from "react";
import { HOMESTEAD, type WorldLocation } from "../core/Homestead";
import { CHALLENGES, CHALLENGE_SPAWN, CHALLENGE_ARENA, isChallenge, challengeBossName, challengeRegion } from "../core/BossChallenge";
import type { CombatSnapshot } from "../core/CombatState";
import type { ExplorationSnapshot } from "../core/Exploration";
import type { AttachRegionMap, MapDestination } from "../app/RegionMapBinding";
import { RegionMap } from "./RegionMap";
import { UiIcon } from "./UiIcon";
import { WorldTravelGraph } from "./WorldTravelGraph";

const name = (id: WorldLocation) => id === "homestead" ? "灯火营地" : id === "wilds" ? "荒野" : CHALLENGES[id].name;
export function WorldTravelPanel({ combat, exploration, attach, initial, busy, close, travel }: {
    combat: CombatSnapshot; exploration: ExplorationSnapshot; attach: AttachRegionMap; initial?: WorldLocation; busy: boolean;
    close(): void; travel(destination: WorldLocation, point?: { x: number; z: number }): void;
}) {
    const [selected, setSelected] = useState<WorldLocation>(initial ?? combat.world.location);
    const location = combat.world.location, challenge = isChallenge(selected), progress = challenge ? combat.challenges[selected] : undefined;
    const scrolls = combat.player.inventory.reduce((count, item) => count + (item.type === "scroll" && item.value === selected ? item.size : 0), 0);
    const needsScroll = challenge && selected !== location && (!progress || progress.claimed);
    const locked = busy || combat.gameOver || needsScroll && !scrolls;
    const preview = useMemo<CombatSnapshot>(() => {
        if (selected === combat.world.location) return combat;
        const run = isChallenge(selected) ? combat.challenges[selected] : undefined;
        const position = selected === "homestead" ? HOMESTEAD.spawn : selected === "wilds" ? combat.wildsPosition : run && !run.claimed ? run.position : CHALLENGE_SPAWN;
        return { ...combat, world: { ...combat.world, location: selected }, player: { ...combat.player, ...position },
            region: isChallenge(selected) ? challengeRegion(combat.challenges[selected]?.level ?? combat.player.level) : combat.region };
    }, [combat, selected]);
    const navigate = (point: MapDestination) => { if (!locked) travel(selected, point); };
    return <section className="world-travel window" role="dialog" aria-label="世界传送">
        <header className="window-heading"><div className="window-title"><UiIcon name="travel" /><div><span className="eyebrow">WAYFARER / 世界航图</span><h2>世界传送</h2></div></div>
            <button className="close-button" aria-label="关闭世界传送" disabled={busy} onClick={close}><UiIcon name="close" /><kbd>H</kbd></button></header>
        <div className="travel-workspace">
            <WorldTravelGraph combat={combat} selected={selected} busy={busy} select={setSelected} />
            <div className="travel-region-detail">
                <RegionMap key={selected} combat={preview} exploration={exploration} expanded embedded attach={attach} navigationDisabled={locked}
                    onToggle={() => {}} onExpandedChange={() => {}} onNavigate={navigate} />
                <div className="travel-rules" aria-live="polite"><h3>{name(selected)}{challenge && ` · ${challengeBossName(selected)}`}</h3>
                    {challenge ? <><p>固定浓雾围场，直径 {CHALLENGE_ARENA.radius * 2}。1 位 Boss 与 60 名随从；入场等级 Lv.{progress && !progress.claimed ? progress.level : combat.player.level}，本轮固定。</p>
                        <ul><li>普通怪生命 / 伤害 ×1.3，Boss ×1.5；击杀经验 ×3。</li><li>没有初始宝箱。清空后中心生成七彩宝箱，必得一件三星彩装。</li>
                            <li>开启消耗对应卷轴 1 张；离开、倒下、刷新保留进度，继续不收费。击杀与领奖不可通过旧档回退。</li></ul>
                        <p>{progress && !progress.claimed ? `第 ${progress.round} 轮 · ${progress.remaining ? `剩余 ${progress.remaining} / 61` : "已清场，请到地图中心领取宝箱"}` : progress?.claimed ? "上轮奖励已领取。消耗新卷轴开启下一轮，清除上轮残留掉落。" : `持有卷轴 ${scrolls} 张 · 独立按彩装概率掉落`}</p></>
                        : <p>{selected === "homestead" ? "64 × 64 安全家园。回城恢复生命和法力，可整理装备、打造和练习技能。" : "返回上次荒野位置，或在已解锁陆地选点。已解锁同级及以下不限次；更高等级的探索区域共用 5 秒传送冷却，暂停时不计时。"}</p>}
                </div>
            </div>
        </div>
        <footer className="travel-actions"><span>{needsScroll ? `入场消耗：${name(selected)}卷轴 ×1 · 持有 ${scrolls}` : "浏览地图期间战斗暂停"}</span>
            <button disabled={locked || selected === location} onClick={() => travel(selected)}><UiIcon name="travel" />{selected === location ? "当前所在 · 可在地图选点" : selected === "homestead" ? "回到家园" : selected === "wilds" ? "出战荒野" : needsScroll ? "使用卷轴开启" : "继续挑战"}</button></footer>
    </section>;
}

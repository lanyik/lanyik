import { useMemo, useState } from "react";
import { HOMESTEAD, type WorldLocation } from "../core/Homestead";
import { CHALLENGE_SPAWN, CHALLENGE_ARENA, isChallenge, challengeBossName, challengeRegion } from "../core/BossChallenge";
import type { CombatSnapshot } from "../core/CombatState";
import type { ExplorationSnapshot } from "../core/Exploration";
import type { AttachRegionMap, MapDestination } from "../app/RegionMapBinding";
import { RegionMap } from "./RegionMap";
import { WorldTravelGraph } from "./WorldTravelGraph";
import { WindowHeader } from "./WindowChrome";

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
        <WindowHeader title="世界传送" icon="travel" shortcut="H" close={close} disabled={busy} help={<><p>左侧点击区域节点，右键拖动画布；右侧查看区域地图，滚轮缩放、右键拖动、点击选择落点。</p><p>选择“区域入口”返回默认位置，或选择“地图选点”传送到解锁区域。浏览期间暂停战斗与传送冷却。</p></>}><span>战斗已暂停</span></WindowHeader>
        <div className="travel-workspace">
            <WorldTravelGraph combat={combat} selected={selected} busy={busy} select={setSelected} />
            <div className="travel-region-detail">
                <RegionMap key={selected} combat={preview} exploration={exploration} expanded embedded attach={attach} navigationDisabled={locked}
                    onToggle={() => {}} onExpandedChange={() => {}} onNavigate={navigate}
                    entryAction={{ disabled: locked || selected === location, travel: () => travel(selected),
                        description: needsScroll ? `消耗卷轴 ×1 · 持有 ${scrolls}` : selected === location ? "已在当前区域，可切换地图选点" : selected === "wilds" ? "返回上次荒野位置" : selected === "homestead" ? "返回营地，恢复生命和法力" : "保留本轮进度，无需卷轴",
                        label: selected === location ? "当前所在" : selected === "homestead" ? "回到家园" : selected === "wilds" ? "出战荒野" : needsScroll ? "使用卷轴开启" : "继续挑战" }}>
                    <div className="travel-rules" aria-live="polite">
                        {challenge ? <><div className="travel-rule-stats"><span>领主 <b>{challengeBossName(selected)}</b></span><span>奖励 <b>三星彩装</b></span><span>经验 <b>×3</b></span></div>
                            <p>{progress && !progress.claimed ? `第 ${progress.round} 轮 · ${progress.remaining ? `剩余 ${progress.remaining} / 61` : "已清场，请到地图中心领取宝箱"}` : `持有卷轴 ${scrolls} 张 · 入场等级 Lv.${combat.player.level}`}</p>
                            <details><summary>挑战规则</summary><ul><li>直径 {CHALLENGE_ARENA.radius * 2} 的固定浓雾围场。1 位 Boss 与 60 名随从，入场等级本轮固定。</li><li>普通怪生命 / 伤害 ×1.3，Boss ×1.5；击杀经验 ×3。</li><li>无初始宝箱。清空后中心生成七彩宝箱，必得一件三星彩装。</li><li>开启消耗对应卷轴 1 张，卷轴独立按彩装概率掉落。离开、倒下、刷新保留进度，继续不收费；旧档无法回退击杀和领奖。</li><li>领取奖励后消耗新卷轴开始下一轮，清除上轮残留掉落。</li></ul></details></>
                            : <p>{selected === "homestead" ? "64 × 64 安全家园 · 休整、打造与技能练习" : "同级及以下不限次 · 越级已探索区域共用 5 秒冷却，暂停冻结"}</p>}
                    </div>
                </RegionMap>
            </div>
        </div>
    </section>;
}

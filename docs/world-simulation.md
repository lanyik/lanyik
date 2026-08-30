# 世界模拟运行时

`WorldSimulationRuntime` 是与渲染驻留解耦的确定性实体模拟器。它不包含 Three.js 对象，不读取相机，
也不通过渲染区块推断远处实体是否继续运行。

```ts
import {
    IndexedDbSimulationChunkStore,
    WorldSimulationRuntime
} from "three-hex-map/simulation";

type ArmyState = { supplies: number };
const simulation = new WorldSimulationRuntime<ArmyState>({
    chunkSize: 96,
    activeTickIntervalSeconds: 0.1,
    backgroundTickIntervalSeconds: 5,
    maxTicksPerAdvance: 50,
    checkpointIntervalSeconds: 30,
    store: new IndexedDbSimulationChunkStore({ worldId: "campaign-slot-1" })
});

simulation.registerSystem({
    id: "consume-supplies",
    update(context) {
        for (const army of context.entities) {
            context.setEntityState(army.id, {
                supplies: army.state.supplies - context.deltaSeconds
            });
        }
    }
});

simulation.addEntity({ id: "army-b", x: 12000, y: -4000, state: { supplies: 100 } });
simulation.setActivityAnchor({ id: "player-a", x: 0, y: 0, radiusChunks: 2 });
await simulation.advance(deltaSeconds);
```

system 每轮收到不可变实体快照，并通过 context 暂存更新、移动、删除和生成。变更只在确定性 tick round
之间应用，因此跨 chunk 移动不会在一轮内执行两次。chunk 和 system 遍历顺序稳定。

`maxTicksPerAdvance` 限制长暂停后的追赶峰值；丢弃的 tick 可从 `stats` 观察。`hibernateChunk()` 保存并
释放冷 chunk，`wakeChunk()` 恢复；内置 store 支持 `listChunks()`，新 runtime 可用
`restoreStoredChunks()` 原子恢复全部快照。格式错误、重复 ID、非法坐标或 chunk 归属错误都会在发布
任何实体前失败。

`wakeChunk()`、`hibernateChunk()`、`advance()` 和 `flush()` 共用有序操作队列。存储 await 后会再次
检查生命周期 revision，旧 restore 不能越过 `dispose()` 发布。调用方应在存档 barrier 先
`await runtime.flush()`。

模拟和 `WorldDeltaStore` v3 通过 `GenerationCheckpointCoordinator` 的同一 manifest generation 提交。
路线规划由应用消费 `SemanticNavigationIndex` 后写入自身实体状态；已删除的 `ArmyMarch` 和
`HierarchicalPathfinder` helper 不属于当前 API。

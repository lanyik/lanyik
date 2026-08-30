# WorldDeltaStore v3

基础语义与生成水文可重建；存档只保存稀疏语义覆盖和用户编辑的完整水文 feature。

## 原子提交

```ts
const result = await store.commit({
  descriptor,
  expectedRevision: currentRevision,
  semanticMutations: [{ x: 8, y: 9, macroHeight: 42000 }],
  hydrologyMutations: [{
    kind: "upsert",
    expectedRevision: featureRevision,
    feature: riverFeature
  }]
});
```

一次 commit 在一个事务中校验世界 CAS、feature CAS、坐标、量化字段、feature 图连接和河网无环性。任一检查失败都不会发布部分 semantic 或 hydrology 状态。空变更不会增加 revision。

内存与 IndexedDB 实现共享同一契约。IndexedDB 把世界记录读、CAS 检查和写放在一个 read/write transaction 中，因此两个 store 实例不能同时赢得同一个 expected revision。

## 编辑策略

`WorldEditTransaction` 提供 raise terrain、paint material、paint vegetation、upsert/delete river/lake 等类型化操作。提高受约束水体下方地面时必须选择：

- `reject`：冲突即拒绝整个事务；
- `preserve-channel`：把地面夹到当前水文约束；
- `coupled`：要求同一事务提交对应水文 feature 变更，或交给显式 hydrology rebaker。

连续编辑由 `WorldEditor` 串行化到最新 `effectiveRevision`，不会用启动时的旧 revision 覆盖前一笔编辑。

## 生效快照与失效

Store 返回不可变 `EffectiveDeltaSnapshot`。`EffectiveWorldView` 把它与 base authority 合并，并为编译、查询、导航和模拟产生结构化依赖。`WorldChangeSet` 根据两格表面影响半径计算 semantic chunks、hydrology regions/features、render chunks、navigation chunks 和 simulation chunks。

## 保存屏障

`saveBarrier(descriptor)` 等待当前提交队列，返回拥有自身 buffer 的 format-1 checkpoint，并清空仅用于待落盘统计的 commit log。`restoreBarrier()` 严格校验 descriptor、delta format 3、checkpoint format、revision 和 feature 图后原子替换状态。

Generation checkpoint v2 可以把 delta barrier 与 simulation checkpoint 放进同一 manifest generation。旧 packed delta、旧 descriptor 和旧 checksum 不迁移。

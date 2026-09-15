import type { CombatRewards } from "../src/core/CombatRewards";
import { recycleRef } from "../src/core/Recycling";
import { afterEach, expect, test, vi } from "vitest";
import { CombatSession } from "../src/app/CombatSession";
import type { CombatSimulation } from "../src/core/CombatSimulation";
import type { CombatView } from "../src/app/CombatView";
import { createStarterEquipment, equipmentScore } from "../src/core/Equipment";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";

afterEach(() => vi.unstubAllGlobals());

test("pickup recommendations rank real upgrades, expire after swaps, and respect dismissal and restart", async () => {
    vi.stubGlobal("document", { hidden: false });
    const view: CombatView = { workerActivity: [], load: async () => ({ x: 0, z: 0 }), readMovement: () => ({ x: 0, z: 0, active: false }),
        reset: () => {}, render: () => {}, clearMovement: () => {}, dispose: async () => {} };
    let transport: LoopbackCombatTransport;
    const session = new CombatSession(view, () => transport = new LoopbackCombatTransport());
    await session.start("prompt-events");
    session.dispatch({ type: "toggle-pause" });
    const simulation: CombatSimulation = transport!.simulation;
    const source = simulation as unknown as { rewards: CombatRewards; collectEquipment(): void };
    const pickup = async (id: number, damage: number) => {
        const starter = createStarterEquipment();
        const bonuses = { ...starter.bonuses, damage };
        source.rewards.drop({ ...starter, id, locked: false, bonuses, score: equipmentScore(bonuses) }, 0, 0);
        source.collectEquipment();
        session.dispatch({ type: "sort-inventory" });
        await session.settled;
    };
    await pickup(10, 20); await pickup(11, 30);
    expect(session.getSnapshot().upgrades.map(item => item.id)).toEqual([11, 10]);
    session.dispatch({ type: "equip", itemId: 11 });
    await session.settled;
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    session.dispatch({ type: "unequip", slot: "weapon" });
    await session.settled;
    session.frame(performance.now());
    expect(session.getSnapshot().upgrades).toHaveLength(0); // Returned gear is not a new pickup.
    await pickup(12, 40);
    session.dispatch({ type: "dismiss-upgrade", itemId: 12 });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    expect(session.getSnapshot().combat!.player.inventory.some(item => item.id === 12)).toBe(true);
    await pickup(13, 50);
    session.dispatch({ type: "craft", operation: { kind: "recycle", item: recycleRef(session.getSnapshot().combat!.player.inventory.find(item => item.id === 13)!) } });
    await session.settled;
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    await pickup(14, 60);
    session.dispatch({ type: "restart" });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    await session.dispose();
});

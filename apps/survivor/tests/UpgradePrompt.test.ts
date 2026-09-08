import { afterEach, expect, test, vi } from "vitest";
import { CombatSession } from "../src/app/CombatSession";
import type { CombatSimulation } from "../src/core/CombatSimulation";
import type { CombatView } from "../src/app/CombatView";
import { createStarterEquipment, equipmentScore, type Equipment } from "../src/core/Equipment";

afterEach(() => vi.unstubAllGlobals());

test("pickup recommendations rank real upgrades, expire after swaps, and respect dismissal and restart", async () => {
    vi.stubGlobal("document", { hidden: false });
    const view: CombatView = { load: async () => ({ x: 0, z: 0 }), readMovement: () => ({ x: 0, z: 0, active: false }),
        render: () => {}, clearMovement: () => {}, dispose: async () => {} };
    const session = new CombatSession(view);
    await session.start("prompt-events");
    session.dispatch({ type: "toggle-pause" });
    const simulation = (session as unknown as { simulation: CombatSimulation }).simulation;
    const source = simulation as unknown as { dropItem(item: Equipment, x: number, z: number): void; collectEquipment(): void };
    const pickup = (id: number, damage: number) => {
        const starter = createStarterEquipment();
        const bonuses = { ...starter.bonuses, damage };
        source.dropItem({ ...starter, id, bonuses, score: equipmentScore(bonuses) }, 0, 0);
        source.collectEquipment();
        session.frame(performance.now());
    };
    pickup(10, 20); pickup(11, 30);
    expect(session.getSnapshot().upgrades.map(item => item.id)).toEqual([11, 10]);
    session.dispatch({ type: "equip", itemId: 11 });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    session.dispatch({ type: "unequip", slot: "weapon" });
    session.frame(performance.now());
    expect(session.getSnapshot().upgrades).toHaveLength(0); // Returned gear is not a new pickup.
    pickup(12, 40);
    session.dispatch({ type: "dismiss-upgrade", itemId: 12 });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    expect(session.getSnapshot().combat!.player.inventory.some(item => item.id === 12)).toBe(true);
    pickup(13, 50);
    session.dispatch({ type: "discard", itemId: 13 });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    pickup(14, 60);
    session.dispatch({ type: "restart" });
    expect(session.getSnapshot().upgrades).toHaveLength(0);
    await session.dispose();
});

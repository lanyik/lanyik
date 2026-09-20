import type { CombatRewards } from "../src/core/CombatRewards";
import { afterEach, expect, test, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { createConsumable, type InventoryItem } from "../src/core/InventoryItem";
import { createOrb } from "../src/core/Orbs";
import { createStarterEquipment } from "../src/core/Equipment";
import { createAffixItem } from "../src/core/AffixItem";
import { IndexedDBCharacterRepository } from "../src/app/CharacterRepository";
import { CombatSession } from "../src/app/CombatSession";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";
import { shareSnapshot } from "../src/app/ShareSnapshot";
import type { CombatWorld } from "../src/core/CombatWorld";
import { StatusKind } from "../src/core/StatusSystem";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
    const simulation = new CombatSimulation("character-save");
    const state = simulation as unknown as { rewards: CombatRewards; inventory: InventoryItem[]; orbDust: number };
    state.inventory = [{ ...createStarterEquipment(), id: 2, locked: false }, createOrb(3, "magic", "bounty"), createConsumable(4, "legendary", "mana-percent", 7), createAffixItem(5, { stat: "damage", value: 30, rarity: "rare" })];
    state.rewards.nextItemId = 6; state.rewards.gold = 4567; state.orbDust = 89;
    simulation.equipOrb(3, 0); simulation.setAutoRecycle("consumable", "common");
    return simulation;
}
test("character roundtrip preserves all categories, identity, skills, cooldowns and origin; spirit remains permanent", () => {
    const simulation = fixture();
    for (let i = 0; i < 12; i++) simulation.step({ x: 1, z: 0, active: true });
    const checkpoint = structuredClone(simulation.checkpoint()), restored = new CombatSimulation(checkpoint.seed, checkpoint.origin, checkpoint.player.spiritRealm);
    restored.restore(checkpoint);
    expect(restored.checkpoint()).toEqual(checkpoint);
    const grown = new CombatSimulation(checkpoint.seed, checkpoint.origin, { revision: 1, souls: 90, attributes: { might: 2, vitality: 0, agility: 0, spirit: 0 } });
    grown.restore(checkpoint);
    expect(grown.getSnapshot().player.attributes.might).toBe(checkpoint.player.attributes.might + 2);
    expect(grown.spiritProgress.souls).toBe(90);
    simulation.dispose(); restored.dispose(); grown.dispose();
});
test("bad versions, item duplicates, non-finite stats and invalid stacks cannot load", () => {
    const simulation = fixture(), checkpoint = simulation.checkpoint();
    expect(() => validateCharacterCheckpoint({ ...checkpoint, version: -1 } as never)).toThrow(/版本/);
    expect(() => validateCharacterCheckpoint({ ...checkpoint, player: { ...checkpoint.player, gold: NaN } })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...checkpoint, player: { ...checkpoint.player, inventory: [...checkpoint.player.inventory, checkpoint.player.inventory[0]] } })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...checkpoint, nextItemId: 2 })).toThrow();
    expect(() => validateCharacterCheckpoint({ ...checkpoint, attackCooldown: -.01 })).toThrow();
    simulation.dispose();
});
test.each(["casting", "frozen"])("saving during %s keeps weapon cooldown valid and restores without attack debt", mode => {
    const simulation = new CombatSimulation("save-during-action");
    const { entities: e } = simulation as unknown as { entities: CombatWorld };
    simulation.toggleAutoCast();
    if (mode === "casting") simulation.castSkill("pulse");
    else e.status.apply(StatusKind.Frozen, e.world.ids[e.player], e.world.ids[e.player], 1, 240, 0);
    for (let tick = 0; tick < 12; tick++) {
        simulation.step({ x: 0, z: 0, active: false });
        expect(simulation.checkpoint().attackCooldown).toBe(0);
    }
    const saved = simulation.checkpoint(), restored = new CombatSimulation(saved.seed, saved.origin);
    restored.restore(saved); expect(restored.checkpoint()).toEqual(saved);
    simulation.dispose(); restored.dispose();
});
test("IndexedDB slots persist across reopen; corrupt slot is isolated; auto does not overwrite manual", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const simulation = fixture(), checkpoint = simulation.checkpoint(), repository = new IndexedDBCharacterRepository();
    await repository.save("manual-1", checkpoint); await repository.save("auto", { ...checkpoint, kills: 42 }); repository.close();
    const reopened = new IndexedDBCharacterRepository(), entries = await reopened.list();
    expect(entries.find(entry => entry.slot === "manual-1")?.save?.checkpoint).toEqual(checkpoint);
    expect(entries[0].save?.checkpoint.kills).toBe(42); expect(entries[2].save).toBeUndefined();
    await expect(reopened.save("manual-2", { ...checkpoint, version: 9 } as never)).rejects.toThrow();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("survivor-characters", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, tx = db.transaction("characters", "readwrite");
            tx.objectStore("characters").put({ ...entries[1].save, slot: "manual-2", generator: -1 }, "manual-2");
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
        };
    });
    const checked = await reopened.list(); expect(checked[2].error).toContain("版本"); expect(checked[1].save?.checkpoint).toEqual(checkpoint);
    reopened.close(); simulation.dispose();
});
test("save barrier includes prior queued commands and only acknowledges a committed record", async () => {
    vi.stubGlobal("document", { hidden: false }); vi.stubGlobal("indexedDB", new IDBFactory());
    const repo = new IndexedDBCharacterRepository(); let transport!: LoopbackCombatTransport;
    const session = new CombatSession({ workerActivity: [], load: async () => ({ x: 0, z: 0 }), reset() {}, render() {}, clearMovement() {}, readMovement: () => ({ x: 0, z: 0, active: false }), dispose: async () => {} },
        () => transport = new LoopbackCombatTransport(), repo);
    await session.start("save-barrier");
    session.dispatch({ type: "set-auto-recycle", itemType: "orb", maximum: "magic" });
    const saved = await session.save("manual-2");
    expect(saved.checkpoint.player.autoRecycle.orb).toBe("magic");
    expect((await repo.list())[2].save).toEqual(saved);
    expect(session.getSnapshot().saveStatus.busy).toBe(false);
    await session.load(saved.checkpoint); expect(transport.simulation.getSnapshot().player.autoRecycle.orb).toBe("magic");
    await session.dispose(); repo.close();
});
test("unchanged cloned inventory and evaluations keep their references while changed locks invalidate one item", () => {
    const simulation = fixture(), original = simulation.getSnapshot(), shared = shareSnapshot(original, structuredClone(original));
    expect(shared.player.inventory).toBe(original.player.inventory); expect(shared.player.stats).toBe(original.player.stats);
    simulation.setEquipmentLock(2, true); const next = shareSnapshot(original, structuredClone(simulation.getSnapshot()));
    expect(next.player.inventory).not.toBe(original.player.inventory); expect(next.player.inventory[1]).toBe(original.player.inventory[1]);
    simulation.dispose();
});
test("storage rejection is reported without stopping combat or acknowledging a save", async () => {
    vi.stubGlobal("document", { hidden: false });
    const session = new CombatSession({ workerActivity: [], load: async () => ({ x: 0, z: 0 }), reset() {}, render() {}, clearMovement() {}, readMovement: () => ({ x: 0, z: 0, active: false }), dispose: async () => {} },
        () => new LoopbackCombatTransport(), { list: async () => [], resolve: async checkpoint => checkpoint, save: async () => { throw new Error("Storage quota exceeded"); }, close() {} });
    await session.start(); await expect(session.save("auto")).rejects.toThrow("quota");
    expect(session.getSnapshot().status).toBe("ready"); expect(session.getSnapshot().saveStatus).toEqual({ busy: false, error: "Storage quota exceeded" });
    await session.dispose();
});

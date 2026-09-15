import { defeatEnemy } from "./helpers/settleCombat";
import { expect, test, vi } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { EMPTY_SPIRIT_REALM, spiritLevel, validateSpiritRealm } from "../src/core/SpiritRealm";
import { CombatWorkerHost } from "../src/worker/CombatWorkerHost";
import { MemorySpiritRepository } from "./helpers/MemorySpiritRepository";
import type { CombatResponse } from "../src/worker/CombatProtocol";
import type { CombatWorld } from "../src/core/CombatWorld";

test("every normal, elite and boss kill grants exactly one soul; persistent points add to a fresh run", () => {
    const simulation = new CombatSimulation("souls", { x: 0, z: 0 }, { ...EMPTY_SPIRIT_REALM, souls: 999 });
    const fixture = simulation as unknown as { entities: CombatWorld };
    for (let i = 0; i < 3; i++) {
        const slot = fixture.entities.enemies.slots[0];
        fixture.entities.enemy.elite[slot] = i > 0 ? 1 : 0; fixture.entities.enemy.boss[slot] = i === 2 ? 1 : 0;
        defeatEnemy(simulation, slot);
    }
    expect(simulation.spiritProgress.souls).toBe(1002); expect(simulation.getSnapshot().kills).toBe(3);
    const before = simulation.getSnapshot().player;
    simulation.cultivateSpirit("might");
    const after = simulation.getSnapshot().player;
    expect(after.spiritRealm.souls).toBe(2); expect(spiritLevel(after.spiritRealm)).toBe(1);
    expect(after.attributes.might).toBe(before.attributes.might + 1); expect(after.stats.damage).toBeGreaterThan(before.stats.damage);
    simulation.cultivateSpirit("might"); expect(simulation.getSnapshot().player).toEqual(after);
    const restarted = new CombatSimulation("new-seed", { x: 0, z: 0 }, after.spiritRealm);
    expect(restarted.getSnapshot().player.attributes.might).toBe(after.attributes.might);
    expect(restarted.getSnapshot().kills).toBe(0); expect(restarted.spiritProgress).toEqual(after.spiritRealm);
    simulation.dispose(); restarted.dispose();
});

test("invalid permanent profiles fail explicitly", () => {
    for (const souls of [-1, NaN, .5, Number.MAX_SAFE_INTEGER + 1]) expect(() => validateSpiritRealm({ ...EMPTY_SPIRIT_REALM, souls })).toThrow("存档数据无效");
    expect(() => validateSpiritRealm({ ...EMPTY_SPIRIT_REALM, attributes: { ...EMPTY_SPIRIT_REALM.attributes, might: -1 } })).toThrow();
});

test("authority publishes soul changes only after durable save, batches saves and stops after persistence failure", async () => {
    const repository = new MemorySpiritRepository(), responses: CombatResponse[] = [];
    let simulation!: CombatSimulation, release!: () => void;
    const host = new CombatWorkerHost(response => responses.push(response), repository, (seed, start, realm) => simulation = new CombatSimulation(seed, start, realm));
    await host.receive({ type: "init", id: 1, seed: "save-order", start: { x: 0, z: 0 }, ports: [] });
    const fixture = simulation as unknown as { entities: CombatWorld };
    defeatEnemy(simulation, fixture.entities.enemies.slots[0]); defeatEnemy(simulation, fixture.entities.enemies.slots[0]);
    const save = vi.spyOn(repository, "save").mockImplementationOnce(async realm => { await new Promise<void>(resolve => release = resolve); repository.realm = realm; });
    const advance = host.receive({ type: "advance", id: 2, batch: { steps: 0, commands: [], input: { x: 0, z: 0, active: false } } });
    expect(save).toHaveBeenCalledOnce(); expect(responses).toHaveLength(1);
    release(); await advance; expect(repository.realm.souls).toBe(2);
    expect(responses[1]).toMatchObject({ type: "state", update: { snapshot: { player: { spiritRealm: { souls: 2 } } } } });
    defeatEnemy(simulation, fixture.entities.enemies.slots[0]);
    save.mockRejectedValueOnce(new Error("磁盘保存失败"));
    const previous = responses[1]; if (previous.type !== "state") throw new Error("Missing state");
    await host.receive({ type: "advance", id: 3, recycle: previous.update.render.buffer, batch: { steps: 0, commands: [], input: { x: 0, z: 0, active: false } } });
    expect(responses[2]).toEqual({ type: "error", id: 3, message: "磁盘保存失败" });
    expect(repository.realm.souls).toBe(2);
    await host.receive({ type: "advance", id: 4, batch: { steps: 0, commands: [], input: { x: 0, z: 0, active: false } } });
    expect(responses).toHaveLength(3);
});

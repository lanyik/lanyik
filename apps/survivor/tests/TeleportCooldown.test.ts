import { expect, test } from "vitest";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { CombatWorld } from "../src/core/CombatWorld";
import { HomesteadTerrain } from "../src/core/Homestead";
import { LoopbackCombatTransport } from "./helpers/LoopbackCombatTransport";
import { OPEN_TERRAIN } from "../src/core/CombatTerrain";

test("higher-level explored travel shares a five-second simulation cooldown; same-level travel stays unlimited", async () => {
    const transport = new LoopbackCombatTransport(); await transport.start("teleport-clock", { x: 0, z: 0 });
    const idle = { x: 0, z: 0, active: false };
    const send = (x: number) => transport.advance({ steps: 0, input: idle, commands: [{ type: "teleport", x, z: 0 }] });
    await send(48); expect(transport.simulation.getSnapshot().teleportRemaining).toBe(5);
    const discovery = transport.simulation.explorationSnapshot;
    await send(80); expect(transport.simulation.getSnapshot().player.x).toBe(48);
    expect(transport.simulation.explorationSnapshot).toBe(discovery);
    for (let i = 0; i < 5; i++) await transport.advance({ steps: 0, input: idle, commands: [] });
    expect(transport.simulation.getSnapshot().teleportRemaining).toBe(5);
    await send(0); await send(4); await send(0); expect(transport.simulation.getSnapshot().player.x).toBe(0);
    expect(transport.simulation.getSnapshot().teleportRemaining).toBe(5);
    const e = (transport.simulation as unknown as { entities: CombatWorld }).entities;
    while (e.enemies.count) e.remove(e.enemies.slots[0]);
    for (let i = 0; i < 599; i++) transport.simulation.step(idle);
    await send(48); expect(transport.simulation.getSnapshot().player.x).toBe(0);
    transport.simulation.step(idle); await send(48);
    expect(transport.simulation.getSnapshot().player.x).toBe(48); expect(transport.simulation.getSnapshot().teleportRemaining).toBe(5);
    const cp = transport.simulation.checkpoint("homestead"), home = new CombatSimulation(cp.seed, cp.origin, cp.player.spiritRealm, new HomesteadTerrain(), "homestead"); home.restore(cp);
    const back = home.checkpoint("wilds"), returned = new CombatSimulation(cp.seed, cp.origin, cp.player.spiritRealm); returned.restore(back);
    returned.teleport(80, 0); expect(returned.getSnapshot().player.x).toBe(48); expect(returned.getSnapshot().teleportRemaining).toBe(5);
    returned.dispose(); home.dispose(); transport.dispose();
});

test("a blocked landing and unknown destination do not consume travel cooldown", () => {
    let clear = true;
    const simulation = new CombatSimulation("teleport-invalid", undefined, undefined, { ...OPEN_TERRAIN, isClear: () => clear });
    simulation.teleport(500, 0); expect(simulation.getSnapshot().teleportRemaining).toBe(0);
    clear = false;
    simulation.teleport(48, 0); expect(simulation.getSnapshot().teleportRemaining).toBe(0);
    simulation.dispose();
});

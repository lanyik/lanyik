import { CombatSimulation } from "../../src/core/CombatSimulation";
import { CombatWorkerHost } from "../../src/worker/CombatWorkerHost";
import type { CombatRequest } from "../../src/worker/CombatProtocol";
import { IndexedDBSpiritRepository } from "../../src/worker/SpiritRepository";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";

/** Browser fixture entry. Production workers never expose their simulation. */
const host = new CombatWorkerHost((message, transfer) => self.postMessage(message, { transfer }), new IndexedDBSpiritRepository(), (seed, start, realm) => {
    const simulation = new CombatSimulation(seed, start, realm, new ProceduralCombatTerrain(seed));
    (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation = simulation;
    return simulation;
});
self.onmessage = (event: MessageEvent<CombatRequest>) => { void host.receive(event.data); };

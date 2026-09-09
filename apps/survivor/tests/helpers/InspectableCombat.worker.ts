import { CombatSimulation } from "../../src/core/CombatSimulation";
import { CombatWorkerHost } from "../../src/worker/CombatWorkerHost";
import type { CombatRequest } from "../../src/worker/CombatProtocol";

/** Browser fixture entry. Production workers never expose their simulation. */
const host = new CombatWorkerHost((message, transfer) => self.postMessage(message, { transfer }), (seed, start) => {
    const simulation = new CombatSimulation(seed, start);
    (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation = simulation;
    return simulation;
});
self.onmessage = (event: MessageEvent<CombatRequest>) => { void host.receive(event.data); };

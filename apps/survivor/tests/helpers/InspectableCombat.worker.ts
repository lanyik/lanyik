import { CombatSimulation } from "../../src/core/CombatSimulation";
import { CombatWorkerHost } from "../../src/worker/CombatWorkerHost";
import type { CombatRequest } from "../../src/worker/CombatProtocol";
import { IndexedDBSpiritRepository } from "../../src/worker/SpiritRepository";
import { ProceduralCombatTerrain } from "../../src/adapters/ProceduralCombatTerrain";
import { HomesteadTerrain } from "../../src/core/Homestead";
import { ChallengeTerrain, isChallenge } from "../../src/core/BossChallenge";
import { IndexedDBCharacterRepository } from "../../src/app/CharacterRepository";

/** Browser fixture entry. Production workers never expose their simulation. */
const host = new CombatWorkerHost((message, transfer) => self.postMessage(message, { transfer }), new IndexedDBSpiritRepository(), (seed, start, realm, location) => {
    const simulation = new CombatSimulation(seed, start, realm, location === "homestead" ? new HomesteadTerrain() : isChallenge(location) ? new ChallengeTerrain() : new ProceduralCombatTerrain(seed), location, crypto.randomUUID());
    (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation = simulation;
    return simulation;
}, new IndexedDBCharacterRepository());
self.onmessage = (event: MessageEvent<CombatRequest>) => { void host.receive(event.data); };

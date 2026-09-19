import { CombatWorkerHost } from "./CombatWorkerHost";
import { IndexedDBSpiritRepository } from "./SpiritRepository";
import { IndexedDBCharacterRepository } from "../app/CharacterRepository";

const host = new CombatWorkerHost((message, transfers) => self.postMessage(message, { transfer: transfers }), new IndexedDBSpiritRepository(), undefined, new IndexedDBCharacterRepository());
self.onmessage = event => { void host.receive(event.data); };

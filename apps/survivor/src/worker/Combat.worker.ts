import { CombatWorkerHost } from "./CombatWorkerHost";
import { IndexedDBSpiritRepository } from "./SpiritRepository";

const host = new CombatWorkerHost((message, transfers) => self.postMessage(message, { transfer: transfers }), new IndexedDBSpiritRepository());
self.onmessage = event => { void host.receive(event.data); };

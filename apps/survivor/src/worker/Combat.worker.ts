import { CombatWorkerHost } from "./CombatWorkerHost";

const host = new CombatWorkerHost((message, transfers) => self.postMessage(message, { transfer: transfers }));
self.onmessage = event => { void host.receive(event.data); };

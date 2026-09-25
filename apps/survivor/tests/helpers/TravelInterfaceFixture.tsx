import { createRoot } from "react-dom/client";
import { App } from "../../src/presentation/App";
import { CombatSession } from "../../src/app/CombatSession";
import { IndexedDBCharacterRepository, type SaveSlot } from "../../src/app/CharacterRepository";
import type { CharacterCheckpoint } from "../../src/core/CharacterCheckpoint";
import { HOMESTEAD } from "../../src/core/Homestead";
import { RuntimeLog } from "../../src/app/RuntimeLog";
import { LoopbackCombatTransport } from "./LoopbackCombatTransport";

interface TravelInterfaceFixture {
    beginSave(): void;
    finishSave(): Promise<void>;
    dispose(): Promise<void>;
}
declare global { interface Window { travelFixture: TravelInterfaceFixture } }

// Hold persistence at a known point; use the real session and interface without GPU pacing.
let release!: () => void;
const held = new Promise<void>(resolve => { release = resolve; });
class HeldRepository extends IndexedDBCharacterRepository {
    public override async save(slot: SaveSlot, checkpoint: CharacterCheckpoint) {
        await held;
        return super.save(slot, checkpoint);
    }
}
const repository = new HeldRepository();
const session = new CombatSession({ workerActivity: [], load: async () => HOMESTEAD.spawn,
    reset() {}, readMovement: () => ({ x: 0, z: 0, active: false }), render() {}, clearMovement() {}, dispose: async () => {} },
    () => new LoopbackCombatTransport(), repository);
await session.start("travel-save-race", "homestead");
const root = createRoot(document.getElementById("survivor-ui")!);
root.render(<App session={session} log={new RuntimeLog(() => localStorage)} onHome={async () => {}}
    attachRegionMap={() => ({ update() {}, setExpanded() {}, recenter() {}, navigate() {}, dispose() {} })} />);
let saving: Promise<unknown>;
window.travelFixture = {
    beginSave() { saving = session.save("auto"); },
    async finishSave() { release(); await saving; },
    async dispose() { root.unmount(); release(); await saving; await session.dispose(); repository.close(); }
};

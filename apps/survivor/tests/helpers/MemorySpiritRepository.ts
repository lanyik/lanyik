import type { SpiritRepository } from "../../src/worker/SpiritRepository";
import { EMPTY_SPIRIT_REALM, type SpiritRealm } from "../../src/core/SpiritRealm";

export class MemorySpiritRepository implements SpiritRepository {
    public realm: SpiritRealm = EMPTY_SPIRIT_REALM;
    async load() { return this.realm; }
    async save(realm: SpiritRealm) { this.realm = realm; }
    close() {}
}

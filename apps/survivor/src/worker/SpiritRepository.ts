import { EMPTY_SPIRIT_REALM, validateSpiritRealm, type SpiritRealm } from "../core/SpiritRealm";

export interface SpiritRepository {
    load(): Promise<SpiritRealm>;
    save(realm: SpiritRealm): Promise<void>;
    close(): void;
}

/** One durable profile, one writer. Acknowledged kill/upgrade batches have already committed. */
export class IndexedDBSpiritRepository implements SpiritRepository {
    private db: IDBDatabase | undefined;
    private release: (() => void) | undefined;
    private closed = false;
    private writing: Promise<void> = Promise.resolve();

    public async load(): Promise<SpiritRealm> {
        await new Promise<void>((resolve, reject) => {
            void navigator.locks.request("survivor-spirit-profile", { ifAvailable: true }, async lock => {
                if (!lock) throw new Error("另一个荒原页面正在使用灵境存档，请先关闭该页面");
                if (this.closed) throw new Error("灵境存档已关闭");
                await new Promise<void>(release => { this.release = release; resolve(); });
            }).catch(reject);
        });
        if (this.closed) throw new Error("灵境存档已关闭");
        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("survivor-progression", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("spirit");
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("灵境存档被其他页面占用"));
            request.onsuccess = () => { if (this.closed) { request.result.close(); reject(new Error("灵境存档已关闭")); } else resolve(request.result); };
        });
        this.db.onversionchange = () => this.close();
        return new Promise<SpiritRealm>((resolve, reject) => {
            const transaction = this.db!.transaction("spirit", "readonly"), request = transaction.objectStore("spirit").get("realm");
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
                try { resolve(request.result === undefined ? EMPTY_SPIRIT_REALM : validateSpiritRealm(request.result)); }
                catch (error) { reject(error); }
            };
        });
    }

    public save(realm: SpiritRealm): Promise<void> {
        if (this.closed || !this.db) return Promise.reject(new Error("灵境存档尚未打开"));
        const value = validateSpiritRealm(realm);
        this.writing = new Promise<void>((resolve, reject) => {
            const transaction = this.db!.transaction("spirit", "readwrite", { durability: "strict" });
            transaction.objectStore("spirit").put(value, "realm");
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("灵境保存失败"));
        });
        return this.writing;
    }

    public close(): void {
        this.closed = true;
        void this.writing.catch(() => {}).then(() => { this.db?.close(); this.db = undefined; this.release?.(); this.release = undefined; });
    }
}

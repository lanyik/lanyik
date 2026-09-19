import { validateCharacterCheckpoint, type CharacterCheckpoint } from "../core/CharacterCheckpoint";
import { WORLD_GENERATOR_VERSION } from "three-hex-map";

const SAVE_SLOTS = ["auto", "manual-1", "manual-2", "manual-3"] as const;
export type SaveSlot = typeof SAVE_SLOTS[number];
export const SAVE_NAMES: Record<SaveSlot, string> = { auto: "自动存档", "manual-1": "手动存档 1", "manual-2": "手动存档 2", "manual-3": "手动存档 3" };
export interface CharacterSave { readonly slot: SaveSlot; readonly savedAt: number; readonly generator: number; readonly checkpoint: CharacterCheckpoint }
export interface SaveEntry { readonly slot: SaveSlot; readonly save?: CharacterSave; readonly error?: string }
export interface CharacterRepository {
    list(): Promise<readonly SaveEntry[]>;
    resolve(checkpoint: CharacterCheckpoint): Promise<CharacterCheckpoint>;
    save(slot: SaveSlot, checkpoint: CharacterCheckpoint): Promise<CharacterSave>;
    close(): void;
}

/** Small fixed slot set; transaction completion is the only successful save acknowledgement. */
export class IndexedDBCharacterRepository implements CharacterRepository {
    private opening: Promise<IDBDatabase> | undefined;
    private closed = false;
    private open(): Promise<IDBDatabase> {
        if (this.closed) return Promise.reject(new Error("角色存档已关闭"));
        return this.opening ??= new Promise((resolve, reject) => {
            const request = indexedDB.open("survivor-characters", 2);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("characters")) request.result.createObjectStore("characters");
                request.result.createObjectStore("challenge-progress");
            };
            request.onblocked = () => reject(new Error("角色存档被其他页面占用，请关闭旧页面"));
            request.onerror = () => { this.opening = undefined; reject(request.error); };
            request.onsuccess = () => {
                if (this.closed) { request.result.close(); reject(new Error("角色存档已关闭")); return; }
                request.result.onversionchange = () => this.close(); resolve(request.result);
            };
        });
    }
    public async list(): Promise<readonly SaveEntry[]> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction("characters", "readonly"), store = transaction.objectStore("characters");
            const requests = SAVE_SLOTS.map(slot => store.get(slot));
            transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("读取角色存档失败"));
            transaction.oncomplete = () => resolve(SAVE_SLOTS.map((slot, index) => {
                const save = requests[index].result as CharacterSave | undefined;
                if (!save) return { slot };
                try {
                    if (save.slot !== slot || !Number.isSafeInteger(save.savedAt) || save.savedAt < 0) throw new Error("存档记录无效");
                    if (save.generator !== WORLD_GENERATOR_VERSION) throw new Error("存档世界生成器版本与当前游戏不一致");
                    validateCharacterCheckpoint(save.checkpoint); return { slot, save };
                } catch (error) { return { slot, error: error instanceof Error ? error.message : String(error) }; }
            }));
        });
    }
    /** A save slot cannot rewind already committed challenge rewards or consumed entry scrolls. */
    public async resolve(checkpoint: CharacterCheckpoint): Promise<CharacterCheckpoint> {
        validateCharacterCheckpoint(checkpoint);
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("challenge-progress", "readonly"), request = tx.objectStore("challenge-progress").get(checkpoint.characterId);
            tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("读取副本进度失败"));
            tx.oncomplete = () => {
                try {
                    const committed = request.result as CharacterCheckpoint | undefined;
                    if (committed) validateCharacterCheckpoint(committed);
                    resolve(committed && (committed.challengeRevision > checkpoint.challengeRevision
                        || committed.challengeRevision === checkpoint.challengeRevision && committed.tick > checkpoint.tick) ? committed : checkpoint);
                } catch (error) { reject(error); }
            };
        });
    }
    public async save(slot: SaveSlot, checkpoint: CharacterCheckpoint): Promise<CharacterSave> {
        if (!SAVE_SLOTS.includes(slot)) throw new Error("未知角色存档槽");
        validateCharacterCheckpoint(checkpoint);
        const db = await this.open();
        let save: CharacterSave = { slot, savedAt: Date.now(), generator: WORLD_GENERATOR_VERSION, checkpoint };
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(["characters", "challenge-progress"], "readwrite", { durability: "strict" });
            const slots = transaction.objectStore("characters"), progress = transaction.objectStore("challenge-progress");
            const previous = progress.get(checkpoint.characterId);
            previous.onsuccess = () => {
                const committed = previous.result as CharacterCheckpoint | undefined;
                if (committed && (committed.challengeRevision > checkpoint.challengeRevision
                    || committed.challengeRevision === checkpoint.challengeRevision && committed.tick > checkpoint.tick)) {
                    save = { ...save, checkpoint: committed };
                }
                slots.put(save, slot);
                if (save.checkpoint.challengeRevision > 0) progress.put(save.checkpoint, checkpoint.characterId);
                // At most the four saved characters plus this active character own a journal entry.
                const referenced = slots.getAll();
                referenced.onsuccess = () => {
                    const ids = new Set((referenced.result as CharacterSave[]).map(entry => entry.checkpoint.characterId));
                    ids.add(checkpoint.characterId);
                    const cursor = progress.openKeyCursor();
                    cursor.onsuccess = () => { if (cursor.result) { if (!ids.has(String(cursor.result.key))) progress.delete(cursor.result.key); cursor.result.continue(); } };
                };
            };
            transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("保存失败，请检查浏览器存储空间"));
            transaction.oncomplete = () => resolve(save);
        });
    }
    public close(): void { this.closed = true; void this.opening?.then(db => db.close(), () => {}); }
}

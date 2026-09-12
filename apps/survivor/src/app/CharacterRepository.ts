import { validateCharacterCheckpoint, type CharacterCheckpoint } from "../core/CharacterCheckpoint";
import { WORLD_GENERATOR_VERSION } from "three-hex-map";

export const SAVE_SLOTS = ["auto", "manual-1", "manual-2", "manual-3"] as const;
export type SaveSlot = typeof SAVE_SLOTS[number];
export const SAVE_NAMES: Record<SaveSlot, string> = { auto: "自动存档", "manual-1": "手动存档 1", "manual-2": "手动存档 2", "manual-3": "手动存档 3" };
export interface CharacterSave { readonly slot: SaveSlot; readonly savedAt: number; readonly generator: number; readonly checkpoint: CharacterCheckpoint }
export interface SaveEntry { readonly slot: SaveSlot; readonly save?: CharacterSave; readonly error?: string }
export interface CharacterRepository {
    list(): Promise<readonly SaveEntry[]>;
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
            const request = indexedDB.open("survivor-characters", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("characters");
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
    public async save(slot: SaveSlot, checkpoint: CharacterCheckpoint): Promise<CharacterSave> {
        if (!SAVE_SLOTS.includes(slot)) throw new Error("未知角色存档槽");
        validateCharacterCheckpoint(checkpoint);
        const db = await this.open(), save: CharacterSave = { slot, savedAt: Date.now(), generator: WORLD_GENERATOR_VERSION, checkpoint };
        return new Promise((resolve, reject) => {
            const transaction = db.transaction("characters", "readwrite", { durability: "strict" });
            transaction.objectStore("characters").put(save, slot);
            transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("保存失败，请检查浏览器存储空间"));
            transaction.oncomplete = () => resolve(save);
        });
    }
    public close(): void { this.closed = true; void this.opening?.then(db => db.close(), () => {}); }
}

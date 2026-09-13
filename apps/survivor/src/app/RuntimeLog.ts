const STORAGE_KEY = "survivor.runtime-log.v1";
const LIMIT = 64, DETAIL_LIMIT = 2048, STORAGE_LIMIT = 128_000;
interface LogEntry { time: number; page: string; event: string; detail: string }
type LogStorage = Pick<Storage, "getItem" | "setItem">;

/** Low-frequency diagnostics only; never called from a frame or simulation tick. */
export class RuntimeLog {
    private readonly page = crypto.randomUUID();
    public storageError: string | undefined;
    constructor(private readonly storage: () => LogStorage) {}

    private read(storage: LogStorage): LogEntry[] {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        if (raw.length > STORAGE_LIMIT) throw new Error("诊断日志超出长度上限");
        const entries: unknown = JSON.parse(raw);
        if (!Array.isArray(entries) || entries.length > LIMIT || entries.some(entry => !entry || typeof entry !== "object"
            || !Number.isFinite(entry.time) || typeof entry.page !== "string" || entry.page.length > 64
            || typeof entry.event !== "string" || entry.event.length > 48 || typeof entry.detail !== "string" || entry.detail.length > DETAIL_LIMIT)) {
            throw new Error("诊断日志格式损坏");
        }
        return entries;
    }

    public record(event: string, detail = ""): void {
        if (this.storageError) return;
        // Storage access can be denied, full or externally corrupted. Stop logging
        // and expose the failure; diagnostics must not turn it into a game failure.
        try {
            const storage = this.storage(), entries = this.read(storage);
            entries.push({ time: Date.now(), page: this.page, event: event.slice(0, 48), detail: detail.slice(0, DETAIL_LIMIT) });
            const retained = entries.slice(-LIMIT);
            let serialized = JSON.stringify(retained);
            while (serialized.length > STORAGE_LIMIT) { retained.shift(); serialized = JSON.stringify(retained); }
            storage.setItem(STORAGE_KEY, serialized);
        } catch (reason) { this.storageError = reason instanceof Error ? reason.message : String(reason); }
    }

    public error(event: string, reason: unknown): void {
        this.record(event, reason instanceof Error ? reason.stack ?? reason.message : String(reason));
    }

    public export(): string {
        let entries: LogEntry[] = [];
        try { entries = this.read(this.storage()); }
        catch (reason) { this.storageError = reason instanceof Error ? reason.message : String(reason); }
        return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), storageError: this.storageError, entries }, null, 2);
    }
}

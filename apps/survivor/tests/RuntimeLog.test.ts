import { expect, test, vi } from "vitest";
import { RuntimeLog } from "../src/app/RuntimeLog";

function storage() {
    const values = new Map<string, string>();
    return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("diagnostics retain the latest 64 records across reloads and interleaved pages", () => {
    const data = storage(), first = new RuntimeLog(() => data), second = new RuntimeLog(() => data);
    for (let i = 0; i < 70; i++) (i % 2 ? first : second).record("inventory-command", String(i));
    first.error("session-failed", new Error("fixture failure"));
    const result = JSON.parse(new RuntimeLog(() => data).export());
    expect(result.storageError).toBeUndefined();
    expect(result.entries).toHaveLength(64);
    expect(result.entries[0].detail).toBe("7");
    expect(new Set(result.entries.map((entry: { page: string }) => entry.page)).size).toBe(2);
    expect(result.entries.at(-1).detail).toContain("Error: fixture failure");
});

test("long and heavily escaped errors cannot exceed the persisted character budget", () => {
    const data = storage(), log = new RuntimeLog(() => data);
    for (let i = 0; i < 100; i++) log.record("window-error", "\u0000".repeat(10_000));
    expect([...data.values.values()][0].length).toBeLessThanOrEqual(128_000);
    const report = JSON.parse(log.export());
    expect(report.storageError).toBeUndefined();
    expect(report.entries.length).toBeGreaterThan(0);
    expect(report.entries.at(-1).detail).toHaveLength(2048);
});

test("unavailable storage stops writes with an explicit diagnostic instead of failing gameplay", () => {
    const access = vi.fn(() => { throw new DOMException("Storage denied", "SecurityError"); }), log = new RuntimeLog(access);
    expect(() => log.record("page-start")).not.toThrow();
    log.record("inventory-command");
    expect(access).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.export()).storageError).toBe("Storage denied");
    const full = storage();
    full.setItem = () => { throw new DOMException("Quota exhausted", "QuotaExceededError"); };
    const quota = new RuntimeLog(() => full); quota.record("page-start");
    expect(quota.storageError).toBe("Quota exhausted");
});

test("a malformed existing journal remains untouched and its failure is exportable", () => {
    const data = storage(); data.setItem("survivor.runtime-log.v1", '[{"event": "broken"}]');
    const before = [...data.values.values()][0], log = new RuntimeLog(() => data);
    log.record("page-start");
    expect(JSON.parse(log.export()).storageError).toContain("格式损坏");
    expect([...data.values.values()][0]).toBe(before);
});

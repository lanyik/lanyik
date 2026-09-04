import { describe, expect, test, vi } from "vitest";

import {
    CHECKPOINT_JOURNAL_FORMAT_VERSION,
    CheckpointCoordinator,
    CheckpointJournal,
    CheckpointParticipant,
    MemoryCheckpointJournalStore
} from "../../src/persistence/CheckpointCoordinator";

describe("CheckpointCoordinator", () => {
    test("dispose releases in-memory journals", async () => {
        const store = new MemoryCheckpointJournalStore();
        const journal = {
            formatVersion: 1 as const,
            worldId: "disposed-world",
            generation: 1,
            baseGeneration: 0,
            revision: 1,
            sessionId: "session-1",
            phase: "preparing" as const,
            createdAt: 1,
            updatedAt: 1,
            participants: []
        };
        await store.compareAndSet(journal.worldId, 0, journal);
        expect((store as unknown as { journals: Map<string, unknown> }).journals.size).toBe(1);

        store.dispose();

        expect((store as unknown as { journals: Map<string, unknown> }).journals.size).toBe(0);
        await expect(store.load(journal.worldId)).rejects.toThrow("disposed");
    });

    test("captures every participant before committing in deterministic order", async () => {
        const events: string[] = [];
        const participant = (id: string): CheckpointParticipant<string> => ({
            id,
            version: 1,
            prepare: context => {
                events.push(`prepare:${id}`);
                return `${id}:${context.generation}`;
            },
            commit: (_context, token) => { events.push(`commit:${token}`); }
        });
        const coordinator = new CheckpointCoordinator({
            worldId: "world-a",
            sessionId: "session-a",
            journal: new MemoryCheckpointJournalStore(),
            participants: [participant("simulation"), participant("terrain")]
        });

        const result = await coordinator.checkpoint();
        expect(result.phase).toBe("committed");
        expect(result.generation).toBe(1);
        expect(events).toEqual([
            "prepare:simulation", "prepare:terrain",
            "commit:simulation:1", "commit:terrain:1"
        ]);
        expect(coordinator.stats.latestCommittedGeneration).toBe(1);
    });

    test("rolls back durable staging when a prepared token cannot be journaled", async () => {
        class FailingPreparedJournalStore extends MemoryCheckpointJournalStore {
            private writes = 0;

            public override compareAndSet(
                worldId: string,
                expectedRevision: number,
                journal: CheckpointJournal
            ): Promise<void> {
                this.writes += 1;
                if (this.writes === 2) return Promise.reject(new Error("journal write failed"));
                return super.compareAndSet(worldId, expectedRevision, journal);
            }
        }
        const store = new FailingPreparedJournalStore();
        const staged = new Set<string>();
        let sequence = 0;
        const rollback = vi.fn((_context: unknown, token: unknown) => { staged.delete(String(token)); });
        const coordinator = new CheckpointCoordinator({
            worldId: "world-prepare-journal-failure",
            sessionId: "writer",
            journal: store,
            participants: [{
                id: "state",
                version: 1,
                prepare: () => {
                    const token = `stage-${++sequence}`;
                    staged.add(token);
                    return token;
                },
                commit: (_context, token: string) => { staged.delete(token); },
                rollback
            }]
        });

        await expect(coordinator.checkpoint()).rejects.toThrow("journal write failed");
        expect(rollback).toHaveBeenCalledWith(
            expect.objectContaining({ generation: 1 }),
            "stage-1",
            1
        );
        expect(staged).toEqual(new Set());
        expect((await store.load("world-prepare-journal-failure"))?.participants[0].state).toBe("pending");

        await expect(coordinator.checkpoint()).resolves.toMatchObject({ phase: "committed", generation: 2 });
        expect(staged).toEqual(new Set());
    });

    test("keeps staging when the prepared journal write committed before reporting failure", async () => {
        class AmbiguousPreparedJournalStore extends MemoryCheckpointJournalStore {
            private writes = 0;

            public override async compareAndSet(
                worldId: string,
                expectedRevision: number,
                journal: CheckpointJournal
            ): Promise<void> {
                this.writes += 1;
                await super.compareAndSet(worldId, expectedRevision, journal);
                if (this.writes === 2) throw new Error("connection lost after journal commit");
            }
        }
        const store = new AmbiguousPreparedJournalStore();
        const staged = new Set<string>();
        const rollback = vi.fn((_context: unknown, token: unknown) => { staged.delete(String(token)); });
        const commit = vi.fn((_context: unknown, token: unknown) => { staged.delete(String(token)); });
        const coordinator = new CheckpointCoordinator({
            worldId: "world-ambiguous-prepare-write",
            sessionId: "writer",
            journal: store,
            participants: [{
                id: "state", version: 1,
                prepare: () => { staged.add("stage-1"); return "stage-1"; },
                commit,
                rollback
            }]
        });

        await expect(coordinator.checkpoint()).rejects.toThrow("connection lost after journal commit");
        expect((await store.load("world-ambiguous-prepare-write"))?.participants[0].state).toBe("prepared");
        expect(rollback).not.toHaveBeenCalled();
        expect(staged).toEqual(new Set(["stage-1"]));

        await expect(coordinator.recover()).resolves.toMatchObject({ phase: "committed", generation: 1 });
        expect(commit).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), "stage-1");
        expect(staged).toEqual(new Set());
    });

    test("uses journal CAS to reject concurrent writers for the same world generation", async () => {
        const store = new MemoryCheckpointJournalStore();
        const participant = {
            id: "state",
            version: 1,
            prepare: () => "snapshot",
            commit: vi.fn()
        };
        const first = new CheckpointCoordinator({
            worldId: "world-cas", sessionId: "writer-one", journal: store, participants: [participant]
        });
        const second = new CheckpointCoordinator({
            worldId: "world-cas", sessionId: "writer-two", journal: store, participants: [participant]
        });

        const outcomes = await Promise.allSettled([first.checkpoint(), second.checkpoint()]);
        expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
        const rejected = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({ name: "CheckpointConflictError" });
        expect((await store.load("world-cas"))?.phase).toBe("committed");
    });

    test("a new session resumes idempotent commits after a mid-commit failure", async () => {
        const store = new MemoryCheckpointJournalStore();
        const committed = new Set<string>();
        let failTerrain = true;
        const participants: CheckpointParticipant<string>[] = [
            {
                id: "simulation", version: 1,
                prepare: () => "simulation-snapshot",
                commit: (_context, token) => { committed.add(token); }
            },
            {
                id: "terrain", version: 1,
                prepare: () => "terrain-snapshot",
                commit: (_context, token) => {
                    if (failTerrain) throw new Error("injected storage failure");
                    committed.add(token);
                }
            }
        ];
        const first = new CheckpointCoordinator({
            worldId: "world-b", sessionId: "before-crash", journal: store, participants
        });
        await expect(first.checkpoint()).rejects.toThrow("injected storage failure");
        expect(committed).toEqual(new Set(["simulation-snapshot"]));

        failTerrain = false;
        const recoveredCommit = vi.fn((_context, token: unknown) => { committed.add(String(token)); });
        const second = new CheckpointCoordinator({
            worldId: "world-b",
            sessionId: "after-crash",
            journal: store,
            participants: [participants[0], { ...participants[1], commit: recoveredCommit }]
        });
        const recovered = await second.recover();
        expect(recovered?.phase).toBe("committed");
        expect(recoveredCommit).toHaveBeenCalledOnce();
        expect(committed).toEqual(new Set(["simulation-snapshot", "terrain-snapshot"]));
        expect(second.stats.recoveredCheckpoints).toBe(1);
    });

    test("abandons an incomplete prepare from a dead session without publishing it", async () => {
        const store = new MemoryCheckpointJournalStore();
        const rollback = vi.fn();
        let rejectPrepare!: (reason: Error) => void;
        const blocked = new Promise<never>((_resolve, reject) => { rejectPrepare = reject; });
        const first = new CheckpointCoordinator({
            worldId: "world-c",
            sessionId: "dead-session",
            journal: store,
            participants: [
                { id: "one", version: 1, prepare: () => "one", commit: vi.fn() },
                { id: "two", version: 1, prepare: () => blocked, commit: vi.fn() }
            ]
        });
        const failed = first.checkpoint();
        await vi.waitFor(async () => expect((await store.load("world-c"))?.participants[0].state).toBe("prepared"));
        rejectPrepare(new Error("process died"));
        await expect(failed).rejects.toThrow("process died");

        const commits = vi.fn();
        const second = new CheckpointCoordinator({
            worldId: "world-c",
            sessionId: "new-session",
            journal: store,
            participants: [
                { id: "one", version: 1, prepare: () => "new", commit: commits, rollback },
                { id: "two", version: 1, prepare: () => "new", commit: commits }
            ]
        });
        const abandoned = await second.recover();
        expect(abandoned?.phase).toBe("aborted");
        expect(abandoned?.participants.every(record => record.state === "skipped")).toBe(true);
        expect(rollback).toHaveBeenCalledWith(
            expect.objectContaining({ generation: 1 }),
            "one",
            1
        );
        expect(commits).not.toHaveBeenCalled();
        expect((await second.checkpoint()).generation).toBe(2);
    });

    test("never mixes prepared tokens with a later retry in the same session", async () => {
        const store = new MemoryCheckpointJournalStore();
        const committed: string[] = [];
        const rollback = vi.fn();
        let snapshotRevision = 1;
        let failSecondPrepare = true;
        const coordinator = new CheckpointCoordinator({
            worldId: "world-same-session-retry",
            sessionId: "one-process",
            journal: store,
            participants: [{
                id: "simulation",
                version: 1,
                prepare: () => `simulation:${snapshotRevision}`,
                commit: (_context, token: string) => { committed.push(token); },
                rollback
            }, {
                id: "terrain",
                version: 1,
                prepare: () => {
                    if (failSecondPrepare) throw new Error("temporary prepare failure");
                    return `terrain:${snapshotRevision}`;
                },
                commit: (_context, token: string) => { committed.push(token); }
            }]
        });

        await expect(coordinator.checkpoint()).rejects.toThrow("temporary prepare failure");
        expect((await store.load("world-same-session-retry"))?.phase).toBe("aborted");

        snapshotRevision = 2;
        failSecondPrepare = false;
        const result = await coordinator.checkpoint();

        expect(result).toMatchObject({ phase: "committed", generation: 2 });
        expect(rollback).toHaveBeenCalledWith(
            expect.objectContaining({ generation: 1 }),
            "simulation:1",
            1
        );
        expect(committed).toEqual(["simulation:2", "terrain:2"]);
    });

    test("recovers when only an optional participant missed prepare before restart", async () => {
        const store = new MemoryCheckpointJournalStore();
        await store.compareAndSet("world-optional-prepare", 0, {
            formatVersion: CHECKPOINT_JOURNAL_FORMAT_VERSION,
            worldId: "world-optional-prepare",
            generation: 1,
            baseGeneration: 0,
            revision: 1,
            sessionId: "dead-session",
            phase: "preparing",
            createdAt: 1,
            updatedAt: 1,
            participants: [{
                id: "state", version: 1, required: true, state: "prepared", token: "state-token"
            }, {
                id: "cache", version: 1, required: false, state: "pending"
            }]
        });
        const commit = vi.fn();
        const coordinator = new CheckpointCoordinator({
            worldId: "world-optional-prepare",
            sessionId: "new-session",
            journal: store,
            participants: [{ id: "state", version: 1, prepare: () => "unused", commit }]
        });

        const recovered = await coordinator.recover();
        expect(recovered?.phase).toBe("committed");
        expect(recovered?.participants.find(record => record.id === "cache"))
            .toMatchObject({ required: false, state: "skipped" });
        expect(commit).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), "state-token");
    });

    test("migrates prepared tokens before recovery commit and tolerates optional cache failure", async () => {
        const store = new MemoryCheckpointJournalStore();
        let fail = true;
        const first = new CheckpointCoordinator({
            worldId: "world-d", sessionId: "old", journal: store,
            participants: [{
                id: "state", version: 1, prepare: () => ({ value: 4 }),
                commit: () => { if (fail) throw new Error("crash"); }
            }, {
                id: "cache", version: 1, required: false,
                prepare: () => { throw new Error("quota"); }, commit: vi.fn()
            }]
        });
        await expect(first.checkpoint()).rejects.toThrow("crash");
        fail = false;
        const commit = vi.fn();
        const second = new CheckpointCoordinator({
            worldId: "world-d", sessionId: "new", journal: store,
            participants: [{
                id: "state", version: 2,
                prepare: () => ({ value: 0 }),
                migrate: token => ({ value: (token as { value: number }).value + 1 }),
                commit
            }, {
                id: "cache", version: 1, required: false,
                prepare: () => undefined, commit: vi.fn()
            }]
        });
        const recovered = await second.recover();
        expect(recovered?.participants.find(record => record.id === "cache")?.state).toBe("skipped");
        expect(commit).toHaveBeenCalledWith(expect.objectContaining({ generation: 1 }), { value: 5 });
    });

    test("times out a stuck store participant and propagates cancellation", async () => {
        const store = new MemoryCheckpointJournalStore();
        let observedAbort = false;
        const coordinator = new CheckpointCoordinator({
            worldId: "world-timeout",
            sessionId: "timeout-session",
            journal: store,
            operationTimeoutMs: 5,
            participants: [{
                id: "stuck",
                version: 1,
                prepare: context => new Promise<never>(() => {
                    context.signal.addEventListener("abort", () => { observedAbort = true; }, { once: true });
                }),
                commit: () => undefined
            }]
        });
        await expect(coordinator.checkpoint()).rejects.toMatchObject({ name: "TimeoutError" });
        expect(observedAbort).toBe(true);
        expect((await store.load("world-timeout"))?.phase).toBe("aborted");
    });

    test("does not invoke a participant after cancellation was already observed", async () => {
        const prepare = vi.fn(() => "snapshot");
        const controller = new AbortController();
        controller.abort(new DOMException("cancelled", "AbortError"));
        const coordinator = new CheckpointCoordinator({
            worldId: "world-pre-aborted",
            sessionId: "cancelled-session",
            journal: new MemoryCheckpointJournalStore(),
            participants: [{ id: "state", version: 1, prepare, commit: vi.fn() }]
        });

        await expect(coordinator.checkpoint(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(prepare).not.toHaveBeenCalled();
    });

    test("skips a removed optional participant while recovering a committed intent", async () => {
        const store = new MemoryCheckpointJournalStore();
        let failRequired = true;
        const first = new CheckpointCoordinator({
            worldId: "world-optional-removal",
            sessionId: "old-session",
            journal: store,
            participants: [{
                id: "state",
                version: 1,
                prepare: () => "state-token",
                commit: () => {
                    if (failRequired) throw new Error("injected crash");
                }
            }, {
                id: "rebuildable-cache",
                version: 1,
                required: false,
                prepare: () => "cache-token",
                commit: vi.fn()
            }]
        });
        await expect(first.checkpoint()).rejects.toThrow("injected crash");

        failRequired = false;
        const second = new CheckpointCoordinator({
            worldId: "world-optional-removal",
            sessionId: "new-session",
            journal: store,
            participants: [{
                id: "state",
                version: 1,
                prepare: () => "unused",
                commit: vi.fn()
            }]
        });
        const recovered = await second.recover();
        expect(recovered?.phase).toBe("committed");
        expect(recovered?.participants.find(record => record.id === "rebuildable-cache"))
            .toMatchObject({ state: "skipped", required: false });
    });
});

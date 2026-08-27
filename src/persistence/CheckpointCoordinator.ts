export const CHECKPOINT_JOURNAL_FORMAT_VERSION = 1;

export type CheckpointPhase = "preparing" | "committing" | "committed" | "aborted";
export type CheckpointParticipantState = "pending" | "prepared" | "committed" | "skipped";

export interface CheckpointContext {
    readonly worldId: string;
    readonly generation: number;
    readonly signal: AbortSignal;
    readonly startedAt: number;
}

export interface CheckpointParticipant<Token = unknown> {
    readonly id: string;
    readonly version: number;
    readonly required?: boolean;
    // prepare must not make new state visible. It either returns a
    // structured-cloneable snapshot or a token for participant-owned durable
    // staging. commit must be idempotent because recovery may replay it.
    prepare(context: CheckpointContext): Promise<Token> | Token;
    commit(context: CheckpointContext, token: Token): Promise<void> | void;
    migrate?(token: unknown, fromVersion: number, context: CheckpointContext): Promise<Token> | Token;
    // Optional durable-staging cleanup. It must be idempotent and accept the
    // recorded token version so abandoned prepare phases can be reclaimed even
    // after the participant's current schema has advanced.
    rollback?(context: CheckpointContext, token: unknown, tokenVersion: number): Promise<void> | void;
}

export interface CheckpointParticipantRecord {
    id: string;
    version: number;
    required: boolean;
    state: CheckpointParticipantState;
    token?: unknown;
    error?: string;
}

export interface CheckpointJournal {
    formatVersion: typeof CHECKPOINT_JOURNAL_FORMAT_VERSION;
    worldId: string;
    generation: number;
    baseGeneration: number;
    revision: number;
    sessionId: string;
    phase: CheckpointPhase;
    createdAt: number;
    updatedAt: number;
    participants: CheckpointParticipantRecord[];
}

export interface CheckpointJournalStore {
    load(worldId: string): Promise<CheckpointJournal | undefined>;
    compareAndSet(worldId: string, expectedRevision: number, journal: CheckpointJournal): Promise<void>;
    dispose(): void;
}

export interface CheckpointCoordinatorOptions {
    worldId: string;
    participants: readonly CheckpointParticipant[];
    journal: CheckpointJournalStore;
    operationTimeoutMs?: number;
    sessionId?: string;
    now?: () => number;
}

export interface CheckpointCoordinatorStats {
    readonly worldId: string;
    readonly sessionId: string;
    readonly running: boolean;
    readonly completedCheckpoints: number;
    readonly recoveredCheckpoints: number;
    readonly abortedCheckpoints: number;
    readonly failedOperations: number;
    readonly latestGeneration: number;
    readonly latestCommittedGeneration: number;
}

export class CheckpointConflictError extends Error {
    public readonly name = "CheckpointConflictError";
    constructor(public readonly expectedRevision: number, public readonly actualRevision: number) {
        super(`checkpoint journal conflict: expected revision ${expectedRevision}, received ${actualRevision}`);
    }
}

export class CheckpointRecoveryError extends Error {
    public readonly name = "CheckpointRecoveryError";
}

function abortError(message: string): Error {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function cloneToken<T>(value: T): T {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

function cloneJournal(journal: CheckpointJournal): CheckpointJournal {
    return {
        ...journal,
        participants: journal.participants.map(record => ({
            ...record,
            ...(record.token === undefined ? {} : { token: cloneToken(record.token) })
        }))
    };
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}

function assertSafeVersion(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
}

export function assertCheckpointJournal(value: unknown, worldId?: string): asserts value is CheckpointJournal {
    if (!value || typeof value !== "object") throw new TypeError("checkpoint journal must be an object");
    const journal = value as Partial<CheckpointJournal>;
    if (journal.formatVersion !== CHECKPOINT_JOURNAL_FORMAT_VERSION) {
        throw new TypeError(`unsupported checkpoint journal format ${String(journal.formatVersion)}`);
    }
    if (typeof journal.worldId !== "string" || journal.worldId.trim().length === 0
        || (worldId !== undefined && journal.worldId !== worldId)) {
        throw new TypeError("checkpoint journal worldId is invalid");
    }
    assertSafeVersion("checkpoint generation", journal.generation as number);
    assertSafeVersion("checkpoint baseGeneration", journal.baseGeneration as number);
    assertSafeVersion("checkpoint revision", journal.revision as number);
    if ((journal.baseGeneration as number) > (journal.generation as number)) {
        throw new TypeError("checkpoint baseGeneration cannot exceed generation");
    }
    if (typeof journal.sessionId !== "string" || journal.sessionId.trim().length === 0
        || !["preparing", "committing", "committed", "aborted"].includes(journal.phase as string)
        || !Number.isFinite(journal.createdAt) || !Number.isFinite(journal.updatedAt)
        || !Array.isArray(journal.participants)) {
        throw new TypeError("checkpoint journal metadata is invalid");
    }
    const ids = new Set<string>();
    for (const participant of journal.participants) {
        if (!participant || typeof participant.id !== "string" || participant.id.trim().length === 0
            || ids.has(participant.id) || typeof participant.required !== "boolean"
            || !["pending", "prepared", "committed", "skipped"].includes(participant.state)) {
            throw new TypeError("checkpoint participant record is invalid");
        }
        assertSafeVersion("checkpoint participant version", participant.version);
        if (journal.phase !== "aborted" && participant.required && participant.state === "skipped") {
            throw new TypeError("a required checkpoint participant cannot be skipped");
        }
        ids.add(participant.id);
    }
    if ((journal.phase === "preparing" || journal.phase === "aborted")
        && journal.participants.some(participant => participant.state === "committed")) {
        throw new TypeError(`${journal.phase} checkpoint cannot contain committed participants`);
    }
    if (journal.phase === "committing"
        && journal.participants.some(participant => participant.state === "pending")) {
        throw new TypeError("a committing checkpoint cannot contain pending participants");
    }
    if (journal.phase === "committed"
        && journal.participants.some(participant =>
            participant.state !== "committed" && participant.state !== "skipped")) {
        throw new TypeError("a committed checkpoint must have terminal participant states");
    }
}

export class MemoryCheckpointJournalStore implements CheckpointJournalStore {
    private readonly journals = new Map<string, CheckpointJournal>();
    private disposed = false;

    public load(worldId: string): Promise<CheckpointJournal | undefined> {
        if (this.disposed) return Promise.reject(new Error("CheckpointJournalStore has been disposed"));
        const journal = this.journals.get(worldId);
        return Promise.resolve(journal ? cloneJournal(journal) : undefined);
    }

    public compareAndSet(worldId: string, expectedRevision: number, journal: CheckpointJournal): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("CheckpointJournalStore has been disposed"));
        assertCheckpointJournal(journal, worldId);
        const actualRevision = this.journals.get(worldId)?.revision ?? 0;
        if (actualRevision !== expectedRevision) {
            return Promise.reject(new CheckpointConflictError(expectedRevision, actualRevision));
        }
        if (journal.revision !== expectedRevision + 1) {
            return Promise.reject(new RangeError("checkpoint journal revision must advance exactly once"));
        }
        this.journals.set(worldId, cloneJournal(journal));
        return Promise.resolve();
    }

    public dispose(): void { this.disposed = true; }
}

export interface IndexedDbCheckpointJournalStoreOptions {
    databaseName?: string;
    openTimeoutMs?: number;
}

const JOURNAL_DATABASE_VERSION = 1;
const JOURNAL_OBJECT_STORE = "checkpoints";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
        transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
    });
}

export class IndexedDbCheckpointJournalStore implements CheckpointJournalStore {
    private readonly databaseName: string;
    private readonly openTimeoutMs: number;
    private databasePromise: Promise<IDBDatabase> | undefined;
    private disposed = false;

    constructor(options: IndexedDbCheckpointJournalStoreOptions = {}) {
        this.databaseName = options.databaseName ?? "three-hex-map-checkpoints-v1";
        this.openTimeoutMs = options.openTimeoutMs ?? 2_000;
        if (!this.databaseName.trim()) throw new TypeError("checkpoint databaseName must be a non-empty string");
        if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
            throw new RangeError("checkpoint openTimeoutMs must be positive and finite");
        }
    }

    public async load(worldId: string): Promise<CheckpointJournal | undefined> {
        if (this.disposed) throw new Error("CheckpointJournalStore has been disposed");
        const database = await this.open();
        const transaction = database.transaction(JOURNAL_OBJECT_STORE, "readonly");
        const journal = await requestResult(transaction.objectStore(JOURNAL_OBJECT_STORE).get(worldId)) as CheckpointJournal | undefined;
        await transactionComplete(transaction);
        if (!journal) return undefined;
        assertCheckpointJournal(journal, worldId);
        return cloneJournal(journal);
    }

    public async compareAndSet(worldId: string, expectedRevision: number, journal: CheckpointJournal): Promise<void> {
        if (this.disposed) throw new Error("CheckpointJournalStore has been disposed");
        assertCheckpointJournal(journal, worldId);
        if (journal.revision !== expectedRevision + 1) {
            throw new RangeError("checkpoint journal revision must advance exactly once");
        }
        const database = await this.open();
        const transaction = database.transaction(JOURNAL_OBJECT_STORE, "readwrite");
        const completion = transactionComplete(transaction);
        try {
            const store = transaction.objectStore(JOURNAL_OBJECT_STORE);
            const current = await requestResult(store.get(worldId)) as CheckpointJournal | undefined;
            const actualRevision = current?.revision ?? 0;
            if (actualRevision !== expectedRevision) {
                throw new CheckpointConflictError(expectedRevision, actualRevision);
            }
            store.put(cloneJournal(journal));
            await completion;
        } catch (reason) {
            try { transaction.abort(); } catch { /* already complete */ }
            await completion.catch(() => undefined);
            throw reason;
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        void this.databasePromise?.then(database => database.close(), () => undefined);
    }

    private open(): Promise<IDBDatabase> {
        if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
        this.databasePromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, JOURNAL_DATABASE_VERSION);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("Opening the checkpoint journal timed out"));
            }, this.openTimeoutMs);
            const finish = <T>(callback: (value: T) => void, value: T): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            request.addEventListener("upgradeneeded", () => {
                if (!request.result.objectStoreNames.contains(JOURNAL_OBJECT_STORE)) {
                    request.result.createObjectStore(JOURNAL_OBJECT_STORE, { keyPath: "worldId" });
                }
            });
            request.addEventListener("success", () => {
                if (settled) {
                    request.result.close();
                    return;
                }
                request.result.addEventListener("versionchange", () => request.result.close());
                finish(resolve, request.result);
            }, { once: true });
            request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening checkpoint IndexedDB failed")), { once: true });
            request.addEventListener("blocked", () => finish(reject, new Error("Opening checkpoint IndexedDB was blocked")), { once: true });
        });
        return this.databasePromise;
    }
}

function randomSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class CheckpointCoordinator {
    private readonly worldId: string;
    private readonly participants: readonly CheckpointParticipant[];
    private readonly participantById = new Map<string, CheckpointParticipant>();
    private readonly journal: CheckpointJournalStore;
    private readonly timeoutMs: number;
    private readonly now: () => number;
    private readonly sessionId: string;
    private operation: Promise<void> = Promise.resolve();
    private activeController: AbortController | undefined;
    private disposed = false;
    private running = false;
    private completedCheckpoints = 0;
    private recoveredCheckpoints = 0;
    private abortedCheckpoints = 0;
    private failedOperations = 0;
    private latestGeneration = 0;
    private latestCommittedGeneration = 0;

    constructor(options: CheckpointCoordinatorOptions) {
        if (!options?.worldId?.trim()) throw new TypeError("checkpoint worldId must be a non-empty string");
        if (!Array.isArray(options.participants) || options.participants.length === 0) {
            throw new TypeError("checkpoint participants must be a non-empty array");
        }
        this.worldId = options.worldId;
        this.participants = [...options.participants];
        this.journal = options.journal;
        this.timeoutMs = options.operationTimeoutMs ?? 10_000;
        this.now = options.now ?? Date.now;
        this.sessionId = options.sessionId ?? randomSessionId();
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
            throw new RangeError("checkpoint operationTimeoutMs must be positive and finite");
        }
        for (const participant of this.participants) {
            if (!participant?.id?.trim() || this.participantById.has(participant.id)) {
                throw new TypeError("checkpoint participant ids must be unique non-empty strings");
            }
            assertSafeVersion("checkpoint participant version", participant.version);
            this.participantById.set(participant.id, participant);
        }
    }

    public checkpoint(signal?: AbortSignal): Promise<Readonly<CheckpointJournal>> {
        return this.enqueue(() => this.createCheckpoint(signal));
    }

    public recover(signal?: AbortSignal): Promise<Readonly<CheckpointJournal> | undefined> {
        return this.enqueue(() => this.recoverLatest(signal));
    }

    public get settled(): Promise<void> { return this.operation; }

    public get stats(): Readonly<CheckpointCoordinatorStats> {
        return {
            worldId: this.worldId,
            sessionId: this.sessionId,
            running: this.running,
            completedCheckpoints: this.completedCheckpoints,
            recoveredCheckpoints: this.recoveredCheckpoints,
            abortedCheckpoints: this.abortedCheckpoints,
            failedOperations: this.failedOperations,
            latestGeneration: this.latestGeneration,
            latestCommittedGeneration: this.latestCommittedGeneration
        };
    }

    public dispose(disposeJournal = true): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activeController?.abort(abortError("CheckpointCoordinator was disposed"));
        if (disposeJournal) void this.operation.finally(() => this.journal.dispose());
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        if (this.disposed) return Promise.reject(new Error("CheckpointCoordinator has been disposed"));
        const result = this.operation.then(task, task);
        this.operation = result.then(() => undefined, () => undefined);
        return result;
    }

    private async createCheckpoint(signal?: AbortSignal): Promise<CheckpointJournal> {
        // A previous prepare attempt may have captured only part of a logical
        // snapshot before it failed. Never resume its missing required
        // participants, even in the same coordinator session: doing so could
        // combine tokens from different application states. Committing intent
        // remains resumable because every required token is already durable.
        const existing = await this.recoverLatest(signal);
        const baseGeneration = existing?.phase === "committed"
            ? existing.generation
            : existing?.baseGeneration ?? 0;
        const previousRevision = existing?.revision ?? 0;
        const timestamp = this.now();
        let journal: CheckpointJournal = {
            formatVersion: CHECKPOINT_JOURNAL_FORMAT_VERSION,
            worldId: this.worldId,
            generation: (existing?.generation ?? 0) + 1,
            baseGeneration,
            revision: previousRevision + 1,
            sessionId: this.sessionId,
            phase: "preparing",
            createdAt: timestamp,
            updatedAt: timestamp,
            participants: this.participants.map(participant => ({
                id: participant.id,
                version: participant.version,
                required: participant.required ?? true,
                state: "pending"
            }))
        };
        await this.journal.compareAndSet(this.worldId, previousRevision, journal);
        this.latestGeneration = journal.generation;
        journal = await this.resume(journal, signal, true);
        if (journal.phase === "committed") this.completedCheckpoints += 1;
        return journal;
    }

    private async recoverLatest(signal: AbortSignal | undefined): Promise<CheckpointJournal | undefined> {
        let journal = await this.journal.load(this.worldId);
        if (!journal) return undefined;
        assertCheckpointJournal(journal, this.worldId);
        this.latestGeneration = Math.max(this.latestGeneration, journal.generation);
        this.latestCommittedGeneration = Math.max(
            this.latestCommittedGeneration,
            journal.phase === "committed" ? journal.generation : journal.baseGeneration
        );
        if (journal.phase === "committed") return journal;
        if (journal.phase === "aborted") return this.cleanupAborted(journal, signal);

        if (journal.phase === "preparing") {
            const requiredPending = journal.participants.some(record =>
                record.state === "pending" && record.required);
            if (requiredPending) {
                journal = await this.persist({ ...journal, phase: "aborted" });
                this.abortedCheckpoints += 1;
                return this.cleanupAborted(journal, signal);
            }
            // A rebuildable optional participant that had not prepared before
            // the crash cannot hold up an otherwise complete commit intent.
            let changed = false;
            for (const record of journal.participants) {
                if (record.state !== "pending") continue;
                record.state = "skipped";
                record.error = "CheckpointRecoveryError: optional participant did not finish preparing";
                changed = true;
            }
            if (changed) journal = await this.persist(journal);
        }
        const recoveredGeneration = journal.generation;
        journal = await this.resume(journal, signal, false);
        if (journal.phase === "committed") {
            this.recoveredCheckpoints += 1;
            this.latestCommittedGeneration = Math.max(this.latestCommittedGeneration, recoveredGeneration);
        }
        return journal;
    }

    private async resume(
        initial: CheckpointJournal,
        externalSignal: AbortSignal | undefined,
        mayPrepare: boolean
    ): Promise<CheckpointJournal> {
        this.running = true;
        const controller = new AbortController();
        this.activeController = controller;
        const abort = () => controller.abort(externalSignal?.reason ?? abortError("Checkpoint was aborted"));
        if (externalSignal?.aborted) abort();
        else externalSignal?.addEventListener("abort", abort, { once: true });
        const contextBase: Omit<CheckpointContext, "signal"> = {
            worldId: this.worldId,
            generation: initial.generation,
            startedAt: this.now()
        };
        let journal = initial;
        try {
            if (journal.phase === "preparing") {
                if (!mayPrepare && journal.participants.some(record => record.state === "pending")) {
                    throw new CheckpointRecoveryError("an incomplete prepare phase cannot be reconstructed after restart");
                }
                for (let index = 0; index < journal.participants.length; index += 1) {
                    const record = journal.participants[index];
                    if (record.state !== "pending") continue;
                    const participant = this.requireParticipant(record.id);
                    try {
                        const token = await this.runParticipant(
                            controller,
                            contextBase,
                            context => participant.prepare(context)
                        );
                        record.token = cloneToken(token);
                        record.version = participant.version;
                        record.state = "prepared";
                        delete record.error;
                    } catch (reason) {
                        if (record.required) {
                            // Persist the decision before returning the
                            // participant failure. A later checkpoint must
                            // roll back prepared staging and start a fresh
                            // generation instead of filling this snapshot with
                            // tokens captured at a later point in time.
                            try {
                                journal = await this.persist({ ...journal, phase: "aborted" });
                                this.abortedCheckpoints += 1;
                            } catch {
                                // Preserve the participant error. Recovery
                                // independently treats any incomplete prepare
                                // as abandoned, so a journal-store failure here
                                // cannot make the generation publishable.
                            }
                            throw reason;
                        }
                        record.state = "skipped";
                        record.error = errorMessage(reason);
                    }
                    try {
                        journal = await this.persist(journal);
                    } catch (persistReason) {
                        // prepare() may have created participant-owned durable
                        // staging. If its token cannot be journaled, recovery
                        // has no way to discover that staging, so reclaim it
                        // while the token is still available in this process.
                        let preparedTokenIsDurable: boolean | undefined;
                        try {
                            const durable = await this.journal.load(this.worldId);
                            const durableRecord = durable?.participants.find(candidate => candidate.id === record.id);
                            preparedTokenIsDurable = Boolean(
                                durable
                                && durable.sessionId === journal.sessionId
                                && durable.generation === journal.generation
                                && durable.revision > journal.revision
                                && durableRecord
                                && (durableRecord.state === "prepared" || durableRecord.state === "committed")
                            );
                        } catch {
                            // A failed read leaves the CAS outcome ambiguous.
                            // Keep staging rather than risk invalidating a
                            // manifest that may already reference its token.
                            preparedTokenIsDurable = undefined;
                        }
                        if (record.state === "prepared" && participant.rollback
                            && preparedTokenIsDurable === false) {
                            try {
                                await this.runParticipant(
                                    controller,
                                    contextBase,
                                    context => participant.rollback!(
                                        context,
                                        cloneToken(record.token),
                                        record.version
                                    )
                                );
                            } catch (rollbackReason) {
                                throw new CheckpointRecoveryError(
                                    `failed to persist prepared participant "${record.id}" (${errorMessage(persistReason)}); `
                                    + `rollback also failed (${errorMessage(rollbackReason)})`
                                );
                            }
                        }
                        throw persistReason;
                    }
                }
                journal = await this.persist({ ...journal, phase: "committing" });
            }

            if (journal.phase === "committing") {
                for (let index = 0; index < journal.participants.length; index += 1) {
                    let record = journal.participants[index];
                    if (record.state === "committed" || record.state === "skipped") continue;
                    const participant = this.participantById.get(record.id);
                    if (!participant) {
                        if (record.required) {
                            throw new CheckpointRecoveryError(`checkpoint participant "${record.id}" is unavailable`);
                        }
                        record.state = "skipped";
                        record.error = `CheckpointRecoveryError: optional participant "${record.id}" is unavailable`;
                        journal = await this.persist(journal);
                        continue;
                    }
                    if (record.version !== participant.version) {
                        if (record.version > participant.version || !participant.migrate) {
                            throw new CheckpointRecoveryError(
                                `participant "${record.id}" checkpoint version ${record.version} cannot migrate to ${participant.version}`
                            );
                        }
                        record.token = cloneToken(await this.runParticipant(
                            controller,
                            contextBase,
                            context => participant.migrate!(record.token, record.version, context)
                        ));
                        record.version = participant.version;
                        journal = await this.persist(journal);
                        // persist() returns a defensive clone; continue with
                        // that journal's record rather than mutating the stale
                        // pre-migration object reference.
                        record = journal.participants[index];
                    }
                    await this.runParticipant(
                        controller,
                        contextBase,
                        context => participant.commit(context, cloneToken(record.token))
                    );
                    record.state = "committed";
                    journal = await this.persist(journal);
                }
                journal = await this.persist({ ...journal, phase: "committed" });
                this.latestCommittedGeneration = Math.max(this.latestCommittedGeneration, journal.generation);
            }
            return journal;
        } catch (reason) {
            this.failedOperations += 1;
            throw reason;
        } finally {
            externalSignal?.removeEventListener("abort", abort);
            if (this.activeController === controller) this.activeController = undefined;
            this.running = false;
        }
    }

    private async cleanupAborted(
        initial: CheckpointJournal,
        externalSignal: AbortSignal | undefined
    ): Promise<CheckpointJournal> {
        this.running = true;
        const controller = new AbortController();
        this.activeController = controller;
        const abort = () => controller.abort(externalSignal?.reason ?? abortError("Checkpoint cleanup was aborted"));
        if (externalSignal?.aborted) abort();
        else externalSignal?.addEventListener("abort", abort, { once: true });
        const contextBase: Omit<CheckpointContext, "signal"> = {
            worldId: this.worldId,
            generation: initial.generation,
            startedAt: this.now()
        };
        let journal = initial;
        try {
            for (let index = 0; index < journal.participants.length; index += 1) {
                const record = journal.participants[index];
                if (record.state === "skipped") continue;
                if (record.state === "pending") {
                    record.state = "skipped";
                    record.error = "CheckpointRecoveryError: participant prepare did not complete";
                    journal = await this.persist(journal);
                    continue;
                }
                if (record.state !== "prepared") continue;
                const participant = this.participantById.get(record.id);
                if (participant?.rollback) {
                    await this.runParticipant(
                        controller,
                        contextBase,
                        context => participant.rollback!(context, cloneToken(record.token), record.version)
                    );
                }
                record.state = "skipped";
                if (!participant) {
                    record.error = `CheckpointRecoveryError: participant "${record.id}" is unavailable for rollback`;
                } else {
                    delete record.error;
                }
                delete record.token;
                journal = await this.persist(journal);
            }
            return journal;
        } catch (reason) {
            this.failedOperations += 1;
            throw reason;
        } finally {
            externalSignal?.removeEventListener("abort", abort);
            if (this.activeController === controller) this.activeController = undefined;
            this.running = false;
        }
    }

    private requireParticipant(id: string): CheckpointParticipant {
        const participant = this.participantById.get(id);
        if (!participant) throw new CheckpointRecoveryError(`checkpoint participant "${id}" is unavailable`);
        return participant;
    }

    private async persist(journal: CheckpointJournal): Promise<CheckpointJournal> {
        const next: CheckpointJournal = {
            ...cloneJournal(journal),
            revision: journal.revision + 1,
            updatedAt: this.now()
        };
        await this.journal.compareAndSet(this.worldId, journal.revision, next);
        return next;
    }

    private runParticipant<T>(
        parent: AbortController,
        contextBase: Omit<CheckpointContext, "signal">,
        operation: (context: CheckpointContext) => Promise<T> | T
    ): Promise<T> {
        const controller = new AbortController();
        const abort = () => controller.abort(parent.signal.reason ?? abortError("Checkpoint was aborted"));
        if (parent.signal.aborted) abort();
        else parent.signal.addEventListener("abort", abort, { once: true });
        const context: CheckpointContext = { ...contextBase, signal: controller.signal };
        if (controller.signal.aborted) {
            parent.signal.removeEventListener("abort", abort);
            return Promise.reject(controller.signal.reason ?? abortError("Checkpoint was aborted"));
        }
        let task: Promise<T>;
        try { task = Promise.resolve(operation(context)); }
        catch (reason) { task = Promise.reject(reason); }
        return this.withTimeout(task, controller).finally(() => {
            parent.signal.removeEventListener("abort", abort);
        });
    }

    private withTimeout<T>(task: Promise<T>, controller: AbortController): Promise<T> {
        if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout>;
            const finish = (callback: (value: T | unknown) => void, value: T | unknown): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                controller.signal.removeEventListener("abort", aborted);
                callback(value);
            };
            const aborted = () => finish(reject, controller.signal.reason ?? abortError("Checkpoint was aborted"));
            timer = setTimeout(() => {
                const error = new Error(`checkpoint participant operation timed out after ${this.timeoutMs}ms`);
                error.name = "TimeoutError";
                controller.abort(error);
                finish(reject, error);
            }, this.timeoutMs);
            controller.signal.addEventListener("abort", aborted, { once: true });
            void task.then(value => finish(resolve as (value: T | unknown) => void, value), reason => finish(reject, reason));
        });
    }
}

export interface FlushCheckpointParticipantOptions {
    version?: number;
    required?: boolean;
}

// Compatibility adapter for stores that already serialize writes and expose a
// durable flush barrier. It is forward-recoverable and idempotent, but stores
// that need a strict point-in-time snapshot should implement prepare/commit
// directly and return an immutable snapshot or staging token from prepare.
export function createFlushCheckpointParticipant(
    id: string,
    flush: (context: CheckpointContext) => Promise<void> | void,
    options: FlushCheckpointParticipantOptions = {}
): CheckpointParticipant<{ generation: number }> {
    return {
        id,
        version: options.version ?? 1,
        required: options.required,
        prepare: context => ({ generation: context.generation }),
        commit: context => flush(context)
    };
}

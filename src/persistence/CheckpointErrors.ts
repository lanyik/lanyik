export class CheckpointConflictError extends Error {
    public readonly name = "CheckpointConflictError";
    constructor(public readonly expectedRevision: number, public readonly actualRevision: number) {
        super(`checkpoint manifest conflict: expected revision ${expectedRevision}, received ${actualRevision}`);
    }
}

export class CheckpointRecoveryError extends Error {
    public readonly name = "CheckpointRecoveryError";
}

import { CompiledSurfaceChunk } from "./SurfaceCompiler";

export interface SurfaceWorkerCompilation {
    readonly chunk: CompiledSurfaceChunk;
    readonly reclaimedWindowBuffers: readonly ArrayBuffer[];
}

export class SurfaceWorkerCompilationError extends Error {
    constructor(
        message: string,
        public readonly reclaimedWindowBuffers: readonly ArrayBuffer[]
    ) {
        super(message);
        this.name = "SurfaceWorkerCompilationError";
    }
}

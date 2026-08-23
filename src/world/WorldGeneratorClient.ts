import { MapInfo } from "../interfaces";
import { WorldGenerationOptions } from "./generateWorld";

interface WorkerSuccessMessage {
    id: number;
    world: MapInfo;
}

interface WorkerFailureMessage {
    id: number;
    error: { name: string; message: string; stack?: string };
}

type WorkerResponse = WorkerSuccessMessage | WorkerFailureMessage;

interface PendingRequest {
    resolve(world: MapInfo): void;
    reject(error: Error): void;
}

//Small lifecycle-safe client for the dedicated world generator worker. The
//URL is explicit so libraries/bundlers retain control over asset placement.
export class WorldGeneratorClient {
    private readonly worker: Worker;
    private readonly pending = new Map<number, PendingRequest>();
    private nextRequestId = 1;
    private disposed = false;

    constructor(workerUrl: string | URL, workerOptions: WorkerOptions = { type: "module" }) {
        this.worker = new Worker(workerUrl, workerOptions);
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", this.handleWorkerError);
    }

    public generate(options: WorldGenerationOptions): Promise<MapInfo> {
        if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
        const id = this.nextRequestId++;
        return new Promise<MapInfo>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, options });
        });
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.worker.terminate();
        const error = new Error("World generation worker was disposed");
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    }

    private handleMessage = (event: MessageEvent<WorkerResponse>): void => {
        const request = this.pending.get(event.data.id);
        if (!request) return;
        this.pending.delete(event.data.id);
        if ("world" in event.data) {
            request.resolve(event.data.world);
            return;
        }
        const remote = event.data.error;
        const error = new Error(remote.message);
        error.name = remote.name;
        if (remote.stack) error.stack = remote.stack;
        request.reject(error);
    };

    private handleWorkerError = (event: ErrorEvent): void => {
        const error = event.error instanceof Error ? event.error : new Error(event.message);
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
    };
}

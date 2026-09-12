import { Texture } from "three";

/** One application-owned load attempt; cancellation also owns decoded image memory. */
export class AssetLoader {
    private readonly controller = new AbortController();
    private readonly cancel = () => this.controller.abort(this.parent.reason);
    public readonly signal = this.controller.signal;

    constructor(private readonly parent: AbortSignal) {
        if (parent.aborted) this.cancel();
        else parent.addEventListener("abort", this.cancel, { once: true });
    }

    public async bytes(url: string): Promise<ArrayBuffer> {
        try {
            const response = await fetch(url, { signal: this.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.arrayBuffer();
        } catch (error) {
            this.signal.throwIfAborted();
            throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }

    public async texture(url: string, flipY = false): Promise<Texture> {
        try {
            const response = await fetch(url, { signal: this.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bitmap = await this.decode(createImageBitmap(await response.blob(), {
                imageOrientation: flipY ? "flipY" : "none", premultiplyAlpha: "none", colorSpaceConversion: "none"
            }), image => image.close());
            if (this.signal.aborted) { bitmap.close(); this.signal.throwIfAborted(); }
            const texture = new Texture(bitmap);
            texture.flipY = false;
            texture.needsUpdate = true;
            texture.addEventListener("dispose", () => bitmap.close());
            return texture;
        } catch (error) {
            this.signal.throwIfAborted();
            throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }

    /** Decoders cannot be interrupted; abandon their wait and release any late decoded result. */
    public decode<T>(operation: Promise<T>, discard: (value: T) => void): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let waiting = true;
            const abort = () => {
                this.signal.removeEventListener("abort", abort);
                if (waiting) { waiting = false; reject(this.signal.reason); }
            };
            this.signal.addEventListener("abort", abort, { once: true });
            void operation.then(value => {
                this.signal.removeEventListener("abort", abort);
                if (!waiting) { discard(value); return; }
                waiting = false; resolve(value);
            }, error => {
                this.signal.removeEventListener("abort", abort);
                if (waiting) { waiting = false; reject(error); }
            });
            if (this.signal.aborted) abort();
        });
    }

    public async parallel<T>(items: readonly T[], concurrency: number, load: (item: T, index: number) => Promise<void>): Promise<void> {
        let cursor = 0;
        const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            try {
                while (cursor < items.length) {
                    this.signal.throwIfAborted();
                    const index = cursor++;
                    await load(items[index], index);
                }
            } catch (error) { this.controller.abort(error); throw error; }
        }));
        const failure = results.find(result => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        this.signal.throwIfAborted();
    }

    public dispose(): void {
        this.parent.removeEventListener("abort", this.cancel);
        this.controller.abort();
    }
}

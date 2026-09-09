import { build } from "esbuild";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

/** Run the browser entry unchanged on a real Node worker thread for numerical/protocol tests. */
export async function startNodeWorker(entry: URL): Promise<Worker> {
    const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL("./", entry)), contents: `
        import { parentPort } from 'node:worker_threads';
        globalThis.self = globalThis;
        globalThis.postMessage = (message, options) => parentPort.postMessage(message, options.transfer);
        await import(${JSON.stringify(fileURLToPath(entry).replaceAll("\\", "/"))});
        parentPort.on('message', data => globalThis.onmessage({ data }));
    ` }, bundle: true, write: false, format: "esm", platform: "node" });
    return new Worker(new URL(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`));
}

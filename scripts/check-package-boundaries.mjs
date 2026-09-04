import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootOutputs = ["dist/hex-map.mjs", "dist/hex-map.cjs", "dist/hex-map.global.js"];
const forbiddenRootMarkers = [
    "indexedDB",
    "IndexedDbWorldChunkCache",
    "IndexedDbWorldDeltaStore",
    "three-hex-map-world-cache",
    "three-hex-map-world-deltas"
];

const sizes = new Map();
for (const relativePath of rootOutputs) {
    const contents = await readFile(resolve(relativePath), "utf8");
    sizes.set(relativePath, Buffer.byteLength(contents));
    for (const marker of forbiddenRootMarkers) {
        if (contents.includes(marker)) {
            throw new Error(`${relativePath} crosses the persistence boundary: found ${marker}`);
        }
    }
}

const persistence = await readFile(resolve("dist/persistence.mjs"), "utf8");
for (const marker of ["IndexedDbWorldChunkCache", "IndexedDbWorldDeltaStore", "indexedDB"]) {
    if (!persistence.includes(marker)) {
        throw new Error(`dist/persistence.mjs is missing expected persistence implementation ${marker}`);
    }
}

for (const [relativePath, bytes] of sizes) {
    console.log(`${relativePath}: ${(bytes / 1024).toFixed(2)} KiB`);
}
console.log("package boundaries verified");

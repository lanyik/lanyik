import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const application = await realpath(resolve(root, "apps/expedition"));
const output = resolve(application, ".assets");
// Only this generated application directory is replaced. Source assets and
// the demo's scripts/bundles never enter the application's public directory.
if (application !== resolve(root, "apps/expedition") || dirname(output) !== application) {
    throw new Error("Application asset directory must stay inside this checkout");
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "public/textures"), resolve(output, "textures"), { recursive: true });
for (const tree of ["oak", "palm", "pinia"]) {
    await cp(resolve(root, "public/Assets/models", tree), resolve(output, "Assets/models", tree), { recursive: true });
}
console.log("Prepared expedition terrain and forest assets");

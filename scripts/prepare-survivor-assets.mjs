import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSurvivorActors } from "./lib/survivor-actors.mjs";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const expectedApplication = resolve(root, "apps/survivor");
const application = await realpath(expectedApplication);
const output = resolve(application, ".assets");

// Only the generated application asset directory may be replaced. Keeping the
// assertion beside rm makes future path edits fail closed.
if (application !== expectedApplication || dirname(output) !== application) {
    throw new Error("Survivor asset directory must stay inside this checkout");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "public/textures"), resolve(output, "textures"), { recursive: true });
for (const tree of ["oak", "palm", "pinia"]) {
    await cp(resolve(root, "public/Assets/models", tree), resolve(output, "Assets/models", tree), { recursive: true });
}
await prepareSurvivorActors(resolve(application, "assets/actors"), resolve(output, "actors"));
for (const file of ["adventurers-LICENSE.txt", "skeletons-LICENSE.txt", "sources.json"]) {
    await cp(resolve(application, "assets/actors", file), resolve(output, "actors", file));
}
console.log("Prepared survivor terrain, forest and actor assets");

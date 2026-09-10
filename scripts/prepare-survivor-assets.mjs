import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSurvivorActors } from "./lib/survivor-actors.mjs";
import { sourceReader } from "./lib/actor-source.mjs";
import { prepareSurvivorEffects } from "./lib/survivor-effects.mjs";
import sharp from "sharp";

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
// App-specific moss palette. Atlas coordinates and the library's original art stay intact.
const atlasPath = resolve(root, "public/textures/terrain.png");
const atlas = JSON.parse(await readFile(resolve(root, "public/textures/land-atlas.json"), "utf8"));
const patches = [];
for (const name of ["land", "_plains"]) {
    const { cellX, cellY } = atlas.textures[name];
    const left = cellX * atlas.cellSize, top = cellY * atlas.cellSize;
    const input = await sharp(atlasPath).extract({ left, top, width: atlas.cellSize, height: atlas.cellSize })
        .modulate({ saturation: .42, brightness: .8 }).png().toBuffer();
    patches.push({ input, left, top });
}
await sharp(atlasPath).composite(patches).png().toFile(resolve(output, "textures/terrain.png"));
for (const tree of ["oak", "palm", "pinia"]) {
    await cp(resolve(root, "public/Assets/models", tree), resolve(output, "Assets/models", tree), { recursive: true });
}
await prepareSurvivorActors(resolve(application, "assets/actors"), resolve(output, "actors"));
const readActor = await sourceReader(resolve(application, "assets/actors"));
for (const file of ["outfits-LICENSE.txt", "base-characters-LICENSE.txt", "animations-LICENSE.txt", "bestiary-LICENSE.txt"]) {
    await writeFile(resolve(output, "actors", file), await readActor(file));
}
await cp(resolve(application, "assets/actors/sources.json"), resolve(output, "actors/sources.json"));
await prepareSurvivorEffects(resolve(application, "assets/effects"), resolve(output, "effects"));
console.log("Prepared survivor terrain, forest, actor and skill effect assets");

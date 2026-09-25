import { cp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSurvivorActors } from "./lib/survivor-actors.mjs";
import { sourceReader } from "./lib/actor-source.mjs";
import { prepareSurvivorEffects } from "./lib/survivor-effects.mjs";
import { prepareSurvivorLoot } from "./lib/survivor-loot.mjs";
import { prepareSurvivorEnvironment } from "./lib/survivor-environment.mjs";
import { prepareSurvivorCreatures } from "./lib/survivor-creatures.mjs";
import { prepareSurvivorHomestead } from "./lib/survivor-homestead.mjs";

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
await prepareSurvivorEnvironment(resolve(application, "assets/environment"), output, root);
await prepareSurvivorActors(resolve(application, "assets/actors"), resolve(output, "actors"), resolve(application, "src/core/ActorSockets.generated.ts"));
await prepareSurvivorCreatures(resolve(application, "assets/environment"), resolve(output, "actors"));
const readActor = await sourceReader(resolve(application, "assets/actors"));
for (const file of ["outfits-LICENSE.txt", "base-characters-LICENSE.txt", "animations-LICENSE.txt", "bestiary-LICENSE.txt"]) {
    await writeFile(resolve(output, "actors", file), await readActor(file));
}
await cp(resolve(application, "assets/actors/sources.json"), resolve(output, "actors/sources.json"));
await prepareSurvivorEffects(resolve(application, "assets/effects"), resolve(output, "effects"));
await prepareSurvivorLoot(resolve(application, "assets/loot"), resolve(output, "loot"));
await prepareSurvivorHomestead(resolve(application, "assets/homestead"), resolve(output, "homestead"), resolve(application, "src/core/HomesteadModels.generated.ts"));
console.log("Prepared survivor terrain, forest, actor, loot, homestead and skill effect assets");

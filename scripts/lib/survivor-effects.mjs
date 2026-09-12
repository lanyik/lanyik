import { mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { sourceReader } from "./actor-source.mjs";

/** The two sampled CC0 masks share one atlas. Analytic rings need no image cells. */
export async function prepareSurvivorEffects(input, output) {
    const read = await sourceReader(input);
    const names = ["magic_03.png", "star_05.png"];
    const patches = [];
    for (let i = 0; i < names.length; i++) patches.push({
        input: await sharp(await read(names[i])).resize(248, 248).extend({ top: 4, bottom: 4, left: 4, right: 4, background: "transparent" }).png().toBuffer(),
        left: i * 256, top: 0
    });
    await read("kenney-LICENSE.txt");
    await mkdir(output, { recursive: true });
    await sharp({ create: { width: 512, height: 256, channels: 4, background: "transparent" } }).composite(patches).png().toFile(resolve(output, "skills.png"));
    await cp(resolve(input, "kenney-LICENSE.txt"), resolve(output, "kenney-LICENSE.txt"));
    await cp(resolve(input, "sources.json"), resolve(output, "sources.json"));
}

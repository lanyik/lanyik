import { mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { sourceReader } from "./actor-source.mjs";

/** Four verified CC0 source textures become one shared atlas. Build stays offline. */
export async function prepareSurvivorEffects(input, output) {
    const read = await sourceReader(input);
    const names = ["circle_05.png", "magic_03.png", "spark_06.png", "star_05.png"];
    const patches = [];
    for (let i = 0; i < names.length; i++) patches.push({
        input: await sharp(await read(names[i])).resize(248, 248).extend({ top: 4, bottom: 4, left: 4, right: 4, background: "transparent" }).png().toBuffer(),
        left: i % 2 * 256, top: Math.floor(i / 2) * 256
    });
    await read("kenney-LICENSE.txt");
    await mkdir(output, { recursive: true });
    await sharp({ create: { width: 512, height: 512, channels: 4, background: "transparent" } }).composite(patches).png().toFile(resolve(output, "skills.png"));
    await cp(resolve(input, "kenney-LICENSE.txt"), resolve(output, "kenney-LICENSE.txt"));
    await cp(resolve(input, "sources.json"), resolve(output, "sources.json"));
}

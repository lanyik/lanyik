import { mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { sourceReader } from "./actor-source.mjs";

/** Six CC0 masks share a 3x2 atlas; analytic geometry uses no extra textures. */
export async function prepareSurvivorEffects(input, output) {
    const read = await sourceReader(input);
    const names = ["magic_03.png", "star_05.png", "flame_01.png", "smoke_04.png", "slash_02.png", "twirl_01.png"];
    const patches = [];
    for (let i = 0; i < names.length; i++) patches.push({
        input: await sharp(await read(names[i])).resize(248, 248).extend({ top: 4, bottom: 4, left: 4, right: 4, background: "transparent" }).png().toBuffer(),
        left: i % 3 * 256, top: Math.floor(i / 3) * 256
    });
    await read("kenney-LICENSE.txt");
    await mkdir(output, { recursive: true });
    await sharp({ create: { width: 768, height: 512, channels: 4, background: "transparent" } }).composite(patches).png().toFile(resolve(output, "skills.png"));
    await cp(resolve(input, "kenney-LICENSE.txt"), resolve(output, "kenney-LICENSE.txt"));
    await cp(resolve(input, "sources.json"), resolve(output, "sources.json"));
}

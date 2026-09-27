import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { BufferGeometryLoader } from "three";
import sharp from "sharp";
import { sourceReader } from "../../scripts/lib/actor-source.mjs";
import { prepareSurvivorScenery } from "../../scripts/lib/survivor-scenery.mjs";

test("scanned props rebuild identically and fit their authoritative unit cylinders", async () => {
    const root = resolve(tmpdir()), output = await mkdtemp(resolve(root, "survivor-scenery-"));
    try {
        const read = await sourceReader(resolve("apps/survivor/assets/environment"));
        await prepareSurvivorScenery(read, output);
        const path = resolve(output, "environment/scenery/models.json"), first = await readFile(path);
        const models = JSON.parse(first.toString());
        const surfaces = new Map();
        for (const name of ["soil", "grass"]) for (const channel of ["color", "normal", "orm"]) {
            const file = `${name}-${channel}.png`, bytes = await readFile(resolve(output, "environment/scenery", file));
            const metadata = await sharp(bytes).metadata(); expect([metadata.width, metadata.height]).toEqual([512, 512]);
            surfaces.set(file, bytes);
        }
        expect(Object.keys(models)).toEqual(["rock0", "rock1", "rock2", "rock3", "rock4", "rock5", "firepit"]);
        for (const data of Object.values(models)) {
            const geometry = new BufferGeometryLoader().parse(data), p = geometry.getAttribute("position");
            expect(geometry.index.count / 3).toBeLessThanOrEqual(3000);
            let radial = 0, low = Infinity, high = -Infinity;
            for (let index = 0; index < p.count; index++) {
                radial = Math.max(radial, Math.hypot(p.getX(index), p.getZ(index)));
                low = Math.min(low, p.getY(index)); high = Math.max(high, p.getY(index));
            }
            expect(radial).toBeLessThanOrEqual(1.000001);
            expect(low).toBeGreaterThanOrEqual(-.000001); expect(high).toBeLessThanOrEqual(1.000001);
            geometry.dispose();
        }
        await prepareSurvivorScenery(read, output);
        expect(await readFile(path)).toEqual(first);
        for (const [file, bytes] of surfaces) expect(await readFile(resolve(output, "environment/scenery", file))).toEqual(bytes);
        expect(await readFile(resolve(output, "environment/scenery/CC0.txt"))).toEqual(await read("polyhaven-CC0.txt"));
    } finally {
        if (dirname(output) !== root) throw new Error("Temporary scenery output escaped its owned directory");
        await rm(output, { recursive: true, force: true });
    }
}, 30_000);

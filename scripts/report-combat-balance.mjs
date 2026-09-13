import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({ stdin: { resolveDir: root, contents: `
    export { balanceEncounter } from './apps/survivor/tests/helpers/balanceReference';
    export { ENEMY_DEFINITIONS } from './apps/survivor/src/core/EnemyDefinitions';
` }, bundle: true, write: false, platform: "node", format: "esm" });
const { balanceEncounter, ENEMY_DEFINITIONS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const rows = [];
for (const level of [1, 5, 10, 25, 50, 100]) for (let kind = 0; kind <= 6; kind++) {
    const boss = kind === 6, samples = Array.from({ length: 64 }, (_, i) => balanceEncounter(level, i, boss ? 3 : kind, boss, boss, boss ? 1.6 : 1));
    const row = { level, enemy: boss ? "裂爪领主" : ENEMY_DEFINITIONS[kind].name };
    for (const key of Object.keys(samples[0])) {
        const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
        row[key] = { p10: +values[6].toFixed(2), median: +values[32].toFixed(2), p90: +values[57].toFixed(2) };
    }
    rows.push(row);
}
const report = { reference: "64 deterministic same-level complete blue equipment sets, first matching item per slot; attributes 40% might / 40% vitality / 10% agility / 10% spirit; no souls or targeted affixes",
    metrics: "hitPercent excludes crit/block/shields; basicTtk is stationary autoattack expectation without skills, lethal procs, guard stance or healing; netBasicDps includes enemy crit, player evasion/block, passive shield and regeneration, excludes lifesteal and active skills; not a full encounter simulation",
    rows };
await writeFile(new URL("../docs/game/measurements/combat-balance.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.table(rows.filter(row => [1, 25, 100].includes(row.level)).map(row => ({ level: row.level, enemy: row.enemy,
    hp: row.health.median, damage: row.damage.median, hitPercent: row.hitPercent.median, basicTtk: row.basicTtk.median, netBasicDps: row.netBasicDps.median })));

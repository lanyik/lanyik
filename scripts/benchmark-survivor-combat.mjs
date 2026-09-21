import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../apps/survivor/tests/helpers/InspectableCombat.worker.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "browser" });
const nodesBundle = await build({ stdin: { contents: "export { SKILL_NODES, initialSkillRanks, investedPoints, validateSkillRanks } from './apps/survivor/src/core/SkillBuild';", resolveDir: fileURLToPath(new URL("../", import.meta.url)) }, bundle: true, write: false, format: "esm", platform: "node" });
const { SKILL_NODES, initialSkillRanks, investedPoints, validateSkillRanks } = await import(`data:text/javascript;base64,${Buffer.from(nodesBundle.outputFiles[0].text).toString("base64")}`);
const ranks = initialSkillRanks();
SKILL_NODES.forEach((node, i) => { if (node.school !== "legacy" && !node.exclusive) ranks[i] = node.maximum; });
assert.equal(validateSkillRanks(ranks, 1000), null);
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11"] });
try {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" || /WebGL.*(?:error|warning)|GL_INVALID|THREE.*warning/i.test(message.text())) errors.push(message.text()); });
    await page.route(/\/Combat\.worker-[^/]+\.js$/, route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.goto(url); await page.waitForFunction(() => document.querySelector(".survivor")?.getAttribute("data-state") === "menu");
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await page.locator('.survivor[data-state="ready"]').waitFor({ timeout: 45000 });
    await page.evaluate(() => window.survivorApplication.session.start("mixed-combat-pipeline"));
    await page.locator('.survivor[data-state="ready"][data-location="wilds"]').waitFor({ timeout: 45000 });
    await page.waitForFunction(() => !window.survivorApplication.session.getSnapshot().travelling);
    await page.evaluate(async () => { const session = window.survivorApplication.session; session.dispatch({ type: "toggle-pause" }); await session.settled; });
    const worker = page.workers().find(worker => /\/Combat\.worker-/.test(worker.url()));
    assert.ok(worker);
    await worker.evaluate(({ ranks, spent }) => {
        const sim = self.fixtureSimulation, cp = sim.checkpoint();
        sim.restore({ ...cp, player: { ...cp.player, level: 1000 }, skills: { ...cp.skills, ranks, points: 999 - spent, recoveryUntil: 0,
            readyAt: cp.skills.readyAt.map(() => 0), dashUntil: 0, loadout: ["blizzard", "icestorm", "firewall", "meteor", "thunderfield", "tempest"] } });
        sim.autoCast = true;
        const e = sim.entities, p = e.position;
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        for (let i = 0; i < 128; i++) {
            const angle = i * Math.PI * 2 / 128, x = p.x[e.player] + Math.cos(angle) * (2 + i % 6), z = p.z[e.player] + Math.sin(angle) * (2 + i % 6);
            const slot = e.spawnEnemy({ x, z, kind: i % 6, boss: false, elite: false, level: 1, region: sim.world.regionAt(x, z) }, { resident: true });
            e.vitals.health[slot] = e.vitals.maxHealth[slot] = 1e9;
        }
        const step = sim.step.bind(sim);
        // Replenish vitals, retaining actual AI, terrain, hits, control, casting, cooldown and recovery.
        sim.step = (input, executor) => { sim.health = sim.stats.maxHealth; sim.mana = sim.stats.maxMana; return step(input, executor); };
    }, { ranks, spent: investedPoints(ranks) });
    await page.evaluate(async () => {
        const session = window.survivorApplication.session;
        const started = performance.now();
        session.view.readMovement = () => {
            const phase = (performance.now() - started) / 1000;
            return phase % 3 < .7 ? { x: Math.floor(phase / 3) % 2 ? -1 : 1, z: 0, active: true } : { x: 0, z: 0, active: false };
        };
        session.dispatch({ type: "toggle-pause" }); await session.settled;
    });
    const sample = duration => page.evaluate(duration => new Promise(resolve => {
        const session = window.survivorApplication.session, started = performance.now(), start = session.getSnapshot().combat;
        const intervals = [], windows = [], effects = new Set(), schools = { frost: false, fire: false, lightning: false }, positions = [];
        let last = started, diagnostics, maxEnemies = 0;
        const frame = now => {
            intervals.push(now - last); last = now;
            const snapshot = session.getSnapshot(), state = session.renderState;
            if (snapshot.performance !== diagnostics) { diagnostics = snapshot.performance; if (diagnostics) windows.push(diagnostics); }
            if (state) {
                const s = state.entities.status;
                maxEnemies = Math.max(maxEnemies, state.entities.enemies.count);
                schools.frost ||= s.slowUntil.some(value => value > snapshot.combat.tick) || s.frozenUntil.some(value => value > snapshot.combat.tick);
                schools.fire ||= s.burnStacks.some(Boolean); schools.lightning ||= s.conductiveUntil.some(value => value > snapshot.combat.tick);
                for (const kind of state.effects.kind.subarray(0, state.effects.count)) effects.add(kind);
                if (!positions.length || Math.abs(positions.at(-1).x - state.player.x) + Math.abs(positions.at(-1).z - state.player.z) > .5) positions.push({ x: state.player.x, z: state.player.z });
            }
            if (now - started < duration) requestAnimationFrame(frame);
            else {
                intervals.sort((a, b) => a - b);
                resolve({ wallMs: now - started, ticks: snapshot.combat.tick - start.tick, gameOver: snapshot.combat.gameOver, frames: intervals.length,
                    p50Ms: intervals[Math.floor(intervals.length * .5)], p95Ms: intervals[Math.floor(intervals.length * .95)], p99Ms: intervals[Math.floor(intervals.length * .99)], maxMs: intervals.at(-1),
                    maxEnemies, schools, effectKinds: [...effects].sort((a, b) => a - b), movementSamples: positions.length, windows });
            }
        }; requestAnimationFrame(frame);
    }), duration);
    await sample(8000); const result = await sample(15000);
    assert.equal(result.gameOver, false); assert.ok(result.ticks > 0); assert.ok(result.movementSamples > 2);
    assert.ok(Object.values(result.schools).every(Boolean), "All three schools must actually affect targets during capture");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ capturedAt: new Date().toISOString(), url, browser: browser.version(), viewport: { width: 2560, height: 1440 }, seed: "mixed-combat-pipeline",
        scope: "Chromium ANGLE D3D11; 128 durable mixed enemies plus normal regional residency; valid level-1000 three-school build; 8s warmup, 15s capture; alternating movement/rest; vitals replenished before each tick; production cast/AI/hit/Worker/render path. Diagnostic GPU values are asynchronous timer samples when supported, not inferred from FPS.", result }, null, 2));
} finally { await browser.close(); }

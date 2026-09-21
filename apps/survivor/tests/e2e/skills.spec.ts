import { isBrowserConsoleFailure } from "../helpers/browserConsole";
import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { CombatSimulation } from "../../src/core/CombatSimulation";
import type { CombatWorld } from "../../src/core/CombatWorld";
import type { RegionalWorld } from "../../src/core/RegionalWorld";
import type { CombatRenderState } from "../../src/core/CombatState";
import type { EnemyKind } from "../../src/core/EnemyDefinitions";
import type { SkillSystem } from "../../src/core/SkillSystem";
import { EffectKind } from "../../src/core/CombatEffects";
import { StatusKind } from "../../src/core/StatusSystem";
import { enterWilds, advanceCombat, combatWorker, inspectCombatWorker, pauseCombat } from "../helpers/browserCombat";

test("tree hover, bounded panning, held point allocation and one-click respec", async ({ page }, info) => {
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await expect(page.locator(".survivor[data-state=ready]")).toHaveAttribute("data-location", "homestead", { timeout: 45_000 });
    await pauseCombat(page);
    await combatWorker(page).evaluate(() => {
        const sim = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        (sim as unknown as { gainExperience(value: number): void }).gainExperience(1000);
    });
    await advanceCombat(page); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true }), points = panel.locator(".skill-points");
    const initial = Number(await points.getAttribute("data-points")); expect(initial).toBeGreaterThan(3);
    for (const id of ["icebolt", "icebolt.power", "frost.study", "frost.winter"]) {
        const node = panel.locator(`[data-node="${id}"]`); await node.hover();
        await expect(page.getByRole("tooltip")).toContainText(await node.locator(".node-name").innerText());
        await expect(panel.locator(".constellation-details h3")).toHaveText("冰霜弹");
    }
    // Sample rendered SVG segments against every icon/name/rank, including offscreen nodes.
    const crossings = await panel.evaluate(root => {
        const map = root.querySelector(".constellation-map")!.getBoundingClientRect();
        const boxes = Array.from(root.querySelectorAll(".constellation-node, .node-name, .node-rank"), el => ({ name: el.textContent, box: el.getBoundingClientRect() }));
        const bad: string[] = [];
        for (const path of root.querySelectorAll<SVGPathElement>("[data-link]")) {
            for (let distance = 0; distance <= path.getTotalLength(); distance += 4) {
                const point = path.getPointAtLength(distance), x = point.x + map.left, y = point.y + map.top;
                if (boxes.some(({ box }) => x > box.left + 1 && x < box.right - 1 && y > box.top + 1 && y < box.bottom - 1)) { bad.push(path.dataset.link!); break; }
            }
        }
        return bad;
    });
    expect(crossings).toEqual([]);
    const scroll = panel.locator(".constellation-scroll");
    await scroll.evaluate(el => { el.scrollTop = 300; el.scrollLeft = 200; });
    const box = (await scroll.boundingBox())!, before = await scroll.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    await page.mouse.move(box.x + 25, box.y + 25); await page.mouse.down();
    await page.mouse.move(box.x + 125, box.y + 125, { steps: 5 }); await page.mouse.up();
    const after = await scroll.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    expect(after.x).toBeLessThan(before.x); expect(after.y).toBeLessThan(before.y);
    await panel.locator('[data-node="icebolt"]').click();
    const plus = panel.getByRole("button", { name: "提升冰霜弹", exact: true });
    await plus.scrollIntoViewIfNeeded(); await plus.hover(); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
    const held = Number(await panel.locator(".node-point-controls > span").innerText()); expect(held).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(250); await expect(panel.locator(".node-point-controls > span")).toHaveText(String(held));
    await panel.getByRole("button", { name: "应用构筑", exact: true }).click();
    await expect(points).toHaveAttribute("data-points", String(initial - held));
    await panel.locator('[data-node="icebolt"]').focus(); await page.keyboard.press("Space"); await page.keyboard.press("Digit6");
    await expect(panel.locator('[data-skill-slot="5"]')).toContainText("冰霜弹");
    await expect(panel.locator('[data-node="icebolt"] .node-equipped')).toHaveText("已装备 6");
    await panel.locator('[data-node="icebolt"]').hover(); await expect(page.getByRole("tooltip")).toContainText("已装备 · 槽位 6");
    await panel.getByRole("button", { name: "免费洗点", exact: true }).click();
    await expect(points).toHaveAttribute("data-points", String(initial));
    await expect(panel.locator('[data-skill-slot="5"]')).toContainText("空槽位");
    await expect(panel.locator('[data-node="icebolt"] .node-equipped')).toHaveCount(0);
    await expect(panel.locator(".node-point-controls > span")).toHaveText("0");
    await scroll.evaluate(el => { el.scrollTop = 235; el.scrollLeft = 155; });
    await page.screenshot({ path: info.outputPath("skill-tree-panning.png") });
    await page.keyboard.press("KeyK"); await page.keyboard.press("KeyC");
    const character = page.getByRole("dialog", { name: "角色", exact: true }), attribute = character.getByRole("button", { name: "提升力量", exact: true });
    const allocated = async () => Number(await attribute.locator("..").locator("strong").innerText());
    const base = await allocated(); await attribute.hover(); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
    await expect.poll(allocated).toBeGreaterThanOrEqual(base + 3);
    const stopped = await allocated(); await page.waitForTimeout(250); expect(await allocated()).toBe(stopped);
    await attribute.focus(); await page.keyboard.down("Enter"); await page.waitForTimeout(450); await page.keyboard.up("Enter");
    await expect.poll(allocated).toBeGreaterThan(stopped);
    // Closing a window while a repeat is held must cancel further authority commands.
    await attribute.hover(); await page.mouse.down(); await page.waitForTimeout(420); await page.keyboard.press("KeyC"); await page.mouse.up();
    const value = () => combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.getSnapshot().player.attributes.might);
    const closed = await value(); await page.waitForTimeout(250); expect(await value()).toBe(closed);
});

test("constellation drafts, six slots, drag inputs and casting recovery work through the real Worker", async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [], atlas: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (isBrowserConsoleFailure(message.type(), message.text())) errors.push(message.text()); });
    page.on("response", response => { if (response.url().endsWith("/effects/skills.png") && response.ok()) atlas.push(response.url()); });
    await inspectCombatWorker(page); await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "开始新游戏", exact: true }).click();
    await enterWilds(page);
    await expect(page.locator(".survivor")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await pauseCombat(page); expect(atlas).toHaveLength(1);
    await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; world: RegionalWorld; autoCast: boolean; attackCooldown: number;
            skills: SkillSystem; gainExperience(value: number): void };
        const e = fixture.entities, p = e.position, x = p.x[e.player], z = p.z[e.player];
        while (e.enemies.count) e.remove(e.enemies.slots[0]);
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        fixture.autoCast = false; fixture.attackCooldown = 1000; fixture.gainExperience(39);
        simulation.equipSkill("dash", 1);
        const cp = fixture.skills.checkpoint(simulation.tick);
        fixture.skills.restore({ ...cp, readyAt: cp.readyAt.map(() => 0), recoveryUntil: 0 }, simulation.tick);
        e.vitals.mana[e.player] = simulation.getSnapshot().player.stats.maxMana;
        for (let kind = 0; kind < 6; kind++) {
            const angle = kind * Math.PI / 3, radius = kind < 3 ? 3 : 4.5;
            const slot = e.spawnEnemy({ x: x + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius, kind: kind as EnemyKind,
                boss: false, elite: false, level: 1, region: fixture.world.regionAt(x, z) }, fixture.world.chunks.get("0,0")!);
            e.enemy.active[slot] = 1; e.vitals.maxHealth[slot] = 10000; e.vitals.health[slot] = 4000;
        }
    });
    await advanceCombat(page, 1); await page.keyboard.press("KeyK");
    const panel = page.getByRole("dialog", { name: "技能", exact: true });
    await expect(panel.locator(".constellation-node")).toHaveCount(34);
    await expect(panel.locator(".loadout-slot")).toHaveCount(6);
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "1");
    await panel.getByRole("button", { name: "提升冰霜弹", exact: true }).click();
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "1"); // Draft does not spend.
    await expect(panel.locator('[data-node="icebolt"]')).toHaveClass(/draft/);
    await panel.getByRole("button", { name: "应用构筑", exact: true }).click();
    await expect(panel.locator(".skill-points")).toHaveAttribute("data-points", "0");
    await expect(panel.locator('[data-node="icebolt"]')).not.toHaveClass(/draft/);
    await panel.locator('[data-node="icebolt"]').focus(); await page.keyboard.press("Space"); await page.keyboard.press("Digit6");
    await expect(panel.locator('[data-skill-slot="5"]')).toContainText("冰霜弹");
    await page.screenshot({ path: info.outputPath("skill-tree-desktop.png") });
    await panel.locator('[data-node="frost.winter"]').click();
    await expect(panel.locator(".constellation-details")).toContainText("角色 30 级解锁");
    await page.screenshot({ path: info.outputPath("skill-tree-advanced.png") });

    await panel.getByRole("button", { name: "星辰", exact: false }).click();
    const ward = panel.locator('[data-node="ward"]');
    await ward.click(); await panel.locator(".node-detail-icon").hover();
    await expect(page.getByRole("tooltip")).toContainText("守护结界");
    await page.keyboard.press("Alt"); await panel.locator(".window-heading").hover();
    await expect(page.getByRole("tooltip")).toHaveAttribute("data-pinned", "true");
    await page.keyboard.press("Alt"); await panel.locator(".window-heading").hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await ward.dragTo(panel.locator('[data-skill-slot="0"]'));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await panel.locator('[data-skill-slot="0"] .skill-icon-trigger').dragTo(page.locator('.skill-slots [data-skill-slot="1"]'));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("疾风步");
    await expect(panel.locator('[data-skill-slot="1"]')).toContainText("守护结界");
    await panel.locator('[data-skill-slot="1"] .skill-icon-trigger').focus(); await page.keyboard.press("Space"); await page.keyboard.press("Digit1");
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await ward.dragTo(panel.locator(".window-heading"));
    await expect(panel.locator('[data-skill-slot="0"]')).toContainText("守护结界");
    await ward.focus(); await page.keyboard.press("Space"); await page.keyboard.press("Escape");
    await expect(panel).toBeVisible(); await expect(page.locator(".skill-drag-ghost")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await ward.scrollIntoViewIfNeeded();
    const touch = await page.context().newCDPSession(page);
    const source = (await ward.boundingBox())!, target = (await panel.locator('[data-skill-slot="3"]').boundingBox())!;
    const sx = source.x + source.width / 2, sy = source.y + source.height / 2, tx = target.x + target.width / 2, ty = target.y + target.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 5; i++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (tx - sx) * i / 5, y: sy + (ty - sy) * i / 5 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await touch.detach();
    await expect(panel.locator('[data-skill-slot="3"]')).toContainText("守护结界");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "关闭技能", exact: true })).toBeInViewport();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await panel.locator(".school-tabs").getByRole("button", { name: "冰霜", exact: false }).click();
    await page.screenshot({ path: info.outputPath("skill-tree-narrow.png") });
    await page.keyboard.press("Escape"); await page.setViewportSize({ width: 1280, height: 720 });

    const rejected = await combatWorker(page).evaluate(() => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        simulation.castSkill("ward"); simulation.castSkill("icebolt");
        return simulation.getSnapshot().player.skills;
    });
    expect(rejected.action?.phase).toBe("windup"); expect(rejected.remaining.icebolt).toBe(0);
    await advanceCombat(page, 50);
    await combatWorker(page).evaluate(() => (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation.castSkill("icebolt"));
    await advanceCombat(page, 20);
    const rendered = await page.evaluate(() => {
        const runtime = window.survivorApplication!.session as unknown as { renderState: CombatRenderState; view: { layer: {
            actors: { enemies: InstancedMesh[][] }; effects: { mesh: InstancedMesh; ward: { visible: boolean } } } } };
        const layer = runtime.view.layer;
        return { pools: layer.actors.enemies.map(pool => pool[0].count), effects: layer.effects.mesh.count, ward: layer.effects.ward.visible,
            kinds: Array.from(runtime.renderState.effects.kind.slice(0, runtime.renderState.effects.count)) };
    });
    expect(rendered.pools).toEqual([1, 1, 2, 1, 1]);
    expect(rendered.effects).toBeGreaterThan(0); expect(rendered.ward).toBe(true); expect(rendered.kinds).toContain(EffectKind.IceBolt);
    await page.screenshot({ path: info.outputPath("ice-cast-and-monsters.png") });
    await combatWorker(page).evaluate(({ slow, frozen }) => {
        const simulation = (self as unknown as { fixtureSimulation: CombatSimulation }).fixtureSimulation;
        const fixture = simulation as unknown as { entities: CombatWorld; skills: SkillSystem; attackCooldown: number };
        const e = fixture.entities, tick = simulation.tick;
        fixture.skills.restore(fixture.skills.checkpoint(tick), tick); fixture.attackCooldown = 0;
        while (e.projectiles.count) e.remove(e.projectiles.slots[0]);
        for (let i = 0; i < e.enemies.count; i++) e.status.clear(e.enemies.slots[i]);
        const first = e.enemies.slots[0], second = e.enemies.slots[1], source = e.world.ids[e.player];
        e.status.apply(slow, source, e.world.ids[first], .5, tick + 240, tick);
        e.status.apply(frozen, source, e.world.ids[second], 1, tick + 120, tick);
        e.status.apply(frozen, source, source, 1, tick + 120, tick);
    }, { slow: StatusKind.Slow, frozen: StatusKind.Frozen });
    await advanceCombat(page, 1);
    const counts = () => page.evaluate(() => {
        const session = window.survivorApplication!.session as unknown as { view: { layer: { statusEffects: { ground: InstancedMesh; crystals: InstancedMesh; ice: InstancedMesh } } } };
        const effects = session.view.layer.statusEffects;
        return [effects.ground.count, effects.crystals.count, effects.ice.count];
    });
    await expect.poll(counts).toEqual([3, 9, 2]);
    // Save through the real authority/persistence barrier while controls suppress ordinary attacks.
    const saved = await page.evaluate(async () => (await window.survivorApplication!.session.save("manual-1")).checkpoint.attackCooldown);
    expect(saved).toBe(0);
    await page.screenshot({ path: info.outputPath("slow-and-frozen-actors.png") });
    await advanceCombat(page, 120); await expect.poll(counts).toEqual([1, 3, 0]);
    expect(errors).toEqual([]);
});

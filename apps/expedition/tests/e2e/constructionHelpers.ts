import { expect, type Page } from "@playwright/test";

export async function landAtRecommendation(page: Page): Promise<void> {
    await expect(page.locator(".expedition")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("game-time")).toHaveAttribute("data-tick", "0");
    await page.keyboard.press("b");
    await expect(page.getByTestId("build-toolbar")).toBeVisible();
    await page.mouse.move(640, 360);
    await expect(page.getByTestId("placement-status")).toHaveAttribute("data-valid", "true");
    await page.mouse.click(640, 360);
    await expect(page.locator(".expedition")).toHaveAttribute("data-landed", "true");
    await expect(page.getByTestId("inventory-iron")).toHaveAttribute("data-amount", "120");
    await expect(page.getByTestId("explorer")).toBeVisible();
}

export async function findPlacement(page: Page, options: {
    preferred?: { x: number; y: number }; rotate?: boolean
} = {}): Promise<{ x: number; y: number }> {
    // Drive the actual pointer/keyboard handlers and inspect the visible placement result.
    // Bounded browser-side searching avoids repeated driver round trips on software WebGL.
    return page.evaluate(async ({ preferred, rotate }) => {
        const canvas = document.querySelector<HTMLCanvasElement>("#expedition-world")!;
        const points = [preferred, { x: 580, y: 360 }, { x: 700, y: 400 }, { x: 500, y: 360 },
            { x: 560, y: 320 }, { x: 630, y: 310 }, { x: 700, y: 340 }, { x: 580, y: 400 },
            { x: 860, y: 320 }, { x: 800, y: 400 }, { x: 460, y: 400 }, { x: 500, y: 300 },
            { x: 720, y: 300 }, { x: 560, y: 300 }, { x: 860, y: 380 }, { x: 640, y: 360 },
            { x: 670, y: 395 }, { x: 680, y: 420 }, { x: 600, y: 320 }, { x: 600, y: 390 }].filter(point => point !== undefined);
        const visited = new Set<string>();
        let reason = "";
        for (const point of points) {
            if (document.elementFromPoint(point.x, point.y) !== canvas) continue;
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: point.x, clientY: point.y, bubbles: true, pointerType: "mouse" }));
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const status = document.querySelector<HTMLElement>('[data-testid="placement-status"]')!;
            const key = `${status.dataset.x},${status.dataset.y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            for (let rotation = 0; rotation < (rotate ? 6 : 1); rotation++) {
                reason = status.textContent ?? "";
                if (status.dataset.valid === "true") return point;
                if (reason.includes("资源端需要") || reason.includes("已有建筑")) break;
                if (!rotate) break;
                window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", key: "r", bubbles: true }));
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
        }
        throw new Error(`No matching visible placement: ${reason}; checked ${[...visited].join(";")}`);
    }, options);
}

export async function walkToMineral(page: Page, name: string): Promise<void> {
    await page.getByRole("button", { name: `定位${name}`, exact: true }).click();
    await expect(page.getByTestId("explorer")).toHaveAttribute("data-status", "arrived", { timeout: 40_000 });
}

export async function setPlanet(page: Page, seed: string): Promise<void> {
    if (!(await page.getByLabel("星球种子").isVisible())) await page.locator(".planet-settings > summary").click();
    await page.getByLabel("星球种子").fill(seed);
    await page.getByRole("button", { name: "重新勘察" }).click();
}

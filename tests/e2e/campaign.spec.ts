import { expect, test } from "@playwright/test";

interface CampaignDiagnostics {
    ready: boolean;
    offscreen?: boolean;
    army?: {
        x: number;
        y: number;
        state: {
            status: "idle" | "marching" | "arrived";
            completedMarches: number;
        };
    };
}

test("an army marches off-camera and restores with its persistent outpost", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/?infinite&campaign&autostart&quality=fast", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const diagnostics = (window as unknown as {
            getCampaignDiagnostics(): CampaignDiagnostics;
        }).getCampaignDiagnostics?.();
        return diagnostics?.ready && diagnostics.army?.state.status === "marching";
    });

    // Move the render window away from both the army and its route. The
    // simulation activity anchor remains at the campaign origin, so completing
    // the order now proves that neither camera nor render residency drives it.
    await page.evaluate(() => {
        const world = window as unknown as {
            getCampaignDiagnostics(): CampaignDiagnostics;
            hexWorld: { setCameraTargetTile(x: number, y: number): void };
        };
        const army = world.getCampaignDiagnostics().army!;
        world.hexWorld.setCameraTargetTile(army.x - 240, army.y - 120);
    });
    await page.waitForFunction(() => {
        const world = window as unknown as {
            getWorldDiagnostics(): { worldStreaming?: { centerChunkX: number; centerChunkY: number } };
            getCampaignDiagnostics(): CampaignDiagnostics;
        };
        const streaming = world.getWorldDiagnostics().worldStreaming;
        const army = world.getCampaignDiagnostics().army;
        return Boolean(streaming && army
            && Math.max(
                Math.abs(Math.floor(army.x / 24) - streaming.centerChunkX),
                Math.abs(Math.floor(army.y / 24) - streaming.centerChunkY)
            ) > 3);
    });

    await page.evaluate(() => (window as unknown as {
        runCampaignUntilSettled(seconds: number): Promise<unknown>;
    }).runCampaignUntilSettled(120));
    const arrived = await page.evaluate(() => (window as unknown as {
        getCampaignDiagnostics(): CampaignDiagnostics;
    }).getCampaignDiagnostics());
    expect(arrived.army?.state).toMatchObject({ status: "arrived", completedMarches: 1 });
    expect(arrived.offscreen).toBe(true);
    const destination = { x: arrived.army!.x, y: arrived.army!.y };

    await page.evaluate(() => (window as unknown as { saveCampaign(): Promise<void> }).saveCampaign());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(expected => {
        const diagnostics = (window as unknown as {
            getCampaignDiagnostics(): CampaignDiagnostics;
        }).getCampaignDiagnostics?.();
        return diagnostics?.ready
            && diagnostics.army?.x === expected.x
            && diagnostics.army?.y === expected.y
            && diagnostics.army.state.status === "arrived";
    }, destination);

    await page.evaluate(point => {
        const world = window as unknown as {
            hexWorld: { setCameraTargetTile(x: number, y: number): void };
        };
        world.hexWorld.setCameraTargetTile(point.x, point.y);
    }, destination);
    await page.waitForFunction(point => {
        const world = window as unknown as {
            hexWorld: { getTile(x: number, y: number): { city?: { name?: string } } | undefined };
        };
        return world.hexWorld.getTile(point.x, point.y)?.city?.name === "First Army Outpost";
    }, destination);

    expect(errors).toEqual([]);
});

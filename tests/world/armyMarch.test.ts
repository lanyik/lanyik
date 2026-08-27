import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import {
    ArmyMarchState,
    ArmyMarchRouteNotFoundError,
    createArmyMarchState,
    createArmyMarchSystem,
    orderArmyMarch
} from "../../src/simulation/ArmyMarch";
import { WorldSimulationRuntime } from "../../src/simulation/WorldSimulationRuntime";
import {
    buildWorldNavigationSummary,
    HierarchicalPathfinder,
    MemoryWorldNavigationIndex
} from "../../src/world/HierarchicalPathfinder";
import { StaticWorldSource } from "../../src/world/WorldSource";

function landWorld(width: number, height: number): MapInfo {
    const data: MapInfo["data"] = {};
    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) data[x][y] = { type: Land.land };
    }
    return { data, w: width, h: height };
}

function pathfinder(map: MapInfo, chunkSize: number): HierarchicalPathfinder {
    const source = new StaticWorldSource(map, { chunkSize });
    const index = new MemoryWorldNavigationIndex(chunkSize, {
        width: map.w, height: map.h, wrapX: false, wrapY: false
    }, "army");
    for (let chunkX = 0; chunkX < Math.ceil(map.w / chunkSize); chunkX += 1) {
        for (let chunkY = 0; chunkY < Math.ceil(map.h / chunkSize); chunkY += 1) {
            index.setSummary(buildWorldNavigationSummary(
                map, chunkX, chunkY, chunkSize, tile => tile.type === Land.land,
                { movementType: "army" }
            ));
        }
    }
    return new HierarchicalPathfinder(source, index, tile => tile.type === Land.land, {
        movementType: "army"
    });
}

describe("ArmyMarch", () => {
    test("turns a hierarchical route into camera-independent cross-chunk movement", async () => {
        const runtime = new WorldSimulationRuntime<ArmyMarchState>({
            chunkSize: 12,
            activeTickIntervalSeconds: 0.1,
            backgroundTickIntervalSeconds: 1
        });
        runtime.registerSystem(createArmyMarchSystem());
        runtime.addEntity({
            id: "first-army", x: 1, y: 5,
            state: createArmyMarchState({ label: "First Army", speedTilesPerSecond: 6 })
        });
        // The camera/activity anchor is deliberately far away: this army must
        // continue using the background cadence.
        runtime.setActivityAnchor({ id: "camera", x: 500, y: 500, radiusChunks: 0 });

        const order = await orderArmyMarch(
            runtime,
            pathfinder(landWorld(48, 12), 12),
            "first-army",
            { x: 38, y: 5 }
        );
        expect(order.pathLength).toBeGreaterThan(24);
        expect(order.sourceChunks).toBeGreaterThan(2);

        for (let second = 0; second < 10; second += 1) await runtime.advance(1);
        const arrived = runtime.getEntity("first-army")!;
        expect(arrived).toMatchObject({ x: 38, y: 5 });
        expect(arrived.state).toMatchObject({
            status: "arrived",
            destination: { x: 38, y: 5 },
            completedMarches: 1
        });
        expect(arrived.state.tilesTravelled).toBe(order.pathLength - 1);
    });

    test("reports an explicit error when no route reaches the destination", async () => {
        const map = landWorld(36, 12);
        for (let y = 0; y < map.h; y += 1) map.data[12][y] = { type: Land.sea };
        const runtime = new WorldSimulationRuntime<ArmyMarchState>({ chunkSize: 12 });
        runtime.registerSystem(createArmyMarchSystem());
        runtime.addEntity({ id: "blocked", x: 1, y: 5, state: createArmyMarchState() });

        await expect(orderArmyMarch(runtime, pathfinder(map, 12), "blocked", { x: 30, y: 5 }))
            .rejects.toBeInstanceOf(ArmyMarchRouteNotFoundError);
        expect(runtime.getEntity("blocked")?.state.status).toBe("idle");
    });

    test("completes an order to the current tile exactly once", async () => {
        const map = landWorld(12, 12);
        const runtime = new WorldSimulationRuntime<ArmyMarchState>({ chunkSize: 12 });
        runtime.registerSystem(createArmyMarchSystem());
        runtime.addEntity({ id: "stationary", x: 4, y: 5, state: createArmyMarchState() });

        const order = await orderArmyMarch(runtime, pathfinder(map, 12), "stationary", { x: 4, y: 5 });

        expect(order.pathLength).toBe(1);
        expect(runtime.getEntity("stationary")).toMatchObject({
            x: 4,
            y: 5,
            state: {
                status: "arrived",
                completedMarches: 1,
                tilesTravelled: 0
            }
        });
    });
});

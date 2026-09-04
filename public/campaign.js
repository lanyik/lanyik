import {
    HierarchicalPathfinder,
    ProceduralWorldNavigationIndex
} from "./js/pathfinding.mjs";
import {
    IndexedDbSimulationChunkStore,
    WorldSimulationRuntime,
    createArmyMarchState,
    createArmyMarchSystem,
    orderArmyMarch
} from "./js/simulation.mjs";
import {
    GenerationCheckpointCoordinator,
    IndexedDbGenerationCheckpointStore,
    createSimulationGenerationParticipant,
    createWorldDeltaGenerationParticipant
} from "./js/persistence.mjs";

const ARMY_ID = "first-army";
const MOVEMENT_TYPE = "ground-army";

const isPassable = tile => tile.type !== "sea" && tile.type !== "coastal" && tile.type !== "mountain";
const movementCost = tile => {
    if (tile.modifiers?.includes("hill")) return 2;
    if (tile.type === "sand" || tile.type === "tundra" || tile.type === "snow") return 1.5;
    return 1;
};

function findLoadedStart(map, initialTile) {
    for (let radius = 0; radius <= 24; radius += 1) {
        for (let x = initialTile.x - radius; x <= initialTile.x + radius; x += 1) {
            for (let y = initialTile.y - radius; y <= initialTile.y + radius; y += 1) {
                const tile = map.getTile(x, y);
                if (tile && isPassable(tile)) return { x, y };
            }
        }
    }
    throw new Error("No passable campaign start tile is resident near the camera");
}

function candidateInChunk(engine, seed, waterStyle, chunkSize, chunkX, chunkY) {
    const packed = engine.generateWorldChunk({
        seed,
        waterStyle,
        chunkSize,
        chunkX,
        chunkY
    });
    const center = {
        x: chunkX * chunkSize + Math.floor(chunkSize / 2),
        y: chunkY * chunkSize + Math.floor(chunkSize / 2)
    };
    return engine.getWorldChunkCorePoints(packed)
        .filter(point => isPassable(engine.decodeWorldChunkTile(
            packed,
            point.x - chunkX * chunkSize,
            point.y - chunkY * chunkSize
        )))
        .sort((first, second) =>
            Math.hypot(first.x - center.x, first.y - center.y)
            - Math.hypot(second.x - center.x, second.y - center.y))[0];
}

function createMarker(map, tileSize, engine) {
    const geometry = new THREE.CylinderGeometry(tileSize * 0.2, tileSize * 0.34, tileSize * 0.5, 6);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffc857,
        emissive: 0x4a2600,
        roughness: 0.55,
        metalness: 0.2
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.name = "campaign-first-army";
    marker.castShadow = true;
    map.add(marker);
    return {
        object: marker,
        move(point) {
            const center = engine.getHexCenter(point.x, point.y, tileSize);
            marker.position.set(center.x, tileSize * 0.35, center.y);
        },
        dispose() {
            map.remove(marker);
            geometry.dispose();
            material.dispose();
        }
    };
}

export async function createCampaignDemo({
    map,
    source,
    seed,
    initialTile,
    tileSize,
    engine = window.HexMap,
    onUpdate = () => {}
}) {
    if (!source.descriptor) throw new Error("Campaign persistence requires a versioned world descriptor");
    const worldId = source.worldId;
    const navigation = new ProceduralWorldNavigationIndex({
        seed,
        chunkSize: source.chunkSize,
        waterStyle: source.descriptor.waterStyle,
        movementType: MOVEMENT_TYPE,
        passable: isPassable,
        movementCost,
        deltaRevision: 0
    });
    const pathfinder = new HierarchicalPathfinder(source, navigation, isPassable, {
        residency: map.worldChunkResidency,
        owner: "campaign-army-route",
        movementType: MOVEMENT_TYPE,
        movementCost,
        // This slice writes only a city/outpost delta, which cannot change
        // passability. Terrain-editing applications must supply rebuilt
        // summaries instead of deliberately ignoring their delta revision.
        expectedRevision: (chunkX, chunkY) => {
            const revision = source.getChunkRevision?.(chunkX, chunkY);
            return revision ? { terrainRevision: revision.terrainRevision, deltaRevision: 0 } : undefined;
        }
    });
    const store = new IndexedDbSimulationChunkStore({
        worldId,
        databaseName: "three-hex-map-campaign-demo-v1",
        // The first software-WebGL mount can monopolize a slow CI main thread
        // for several seconds even though IndexedDB itself is healthy.
        openTimeoutMs: 15_000
    });
    const simulation = new WorldSimulationRuntime({
        chunkSize: source.chunkSize,
        activeTickIntervalSeconds: 0.2,
        backgroundTickIntervalSeconds: 1,
        maxTicksPerAdvance: 120,
        checkpointIntervalSeconds: 5,
        workCoordinator: map.workCoordinator,
        store
    });
    simulation.registerSystem(createArmyMarchSystem());
    const checkpoints = new GenerationCheckpointCoordinator({
        worldId,
        descriptor: source.descriptor,
        store: new IndexedDbGenerationCheckpointStore({
            databaseName: "three-hex-map-campaign-generations-v1",
            openTimeoutMs: 15_000
        }),
        operationTimeoutMs: 15_000,
        participants: [
            createSimulationGenerationParticipant(simulation),
            createWorldDeltaGenerationParticipant(source, {
                afterRestore: snapshot => map.refreshWorldTiles(
                    snapshot.deltas.flatMap(delta => delta.entries.map(entry => ({ x: entry.x, y: entry.y })))
                )
            })
        ]
    });
    try {
        const recovered = await checkpoints.recover();
        if (!recovered) await simulation.restoreStoredChunks();
        let createdInitialArmy = false;
        if (!simulation.getEntity(ARMY_ID)) {
            const start = findLoadedStart(map, initialTile);
            simulation.addEntity({
                id: ARMY_ID,
                ...start,
                state: createArmyMarchState({ label: "First Army", speedTilesPerSecond: 6 })
            });
            createdInitialArmy = true;
        }
        // A manifest-less legacy campaign is imported once into the strict
        // generation store. Subsequent recovery ignores newer uncommitted
        // writes in the compatibility stores and restores the manifest state.
        if (!recovered || createdInitialArmy) {
            await checkpoints.checkpoint();
        }
    } catch (reason) {
        checkpoints.dispose();
        simulation.dispose();
        navigation.dispose();
        throw reason;
    }
    // Keep the initial player area hot. Once the army leaves it, its route
    // continues at the background cadence without camera/render residency.
    simulation.setActivityAnchor({ id: "initial-player-area", ...initialTile, radiusChunks: 0 });

    const marker = createMarker(map, tileSize, engine);
    let disposed = false;
    let disposing = false;
    let disposePromise;
    let frameSeconds = 0;
    let frameScheduled = false;
    const restoredArmy = simulation.getEntity(ARMY_ID);
    // The terrain delta and simulation snapshot live in separate stores. Treat
    // the latest restored arrival as unacknowledged so an interrupted save can
    // idempotently recreate its outpost before normal frame processing starts.
    let handledArrivalMarches = restoredArmy?.state.status === "arrived"
        ? restoredArmy.state.completedMarches - 1
        : restoredArmy?.state.completedMarches ?? 0;
    let latestOrder;
    let operation = Promise.resolve();

    const diagnostics = () => {
        const army = simulation.getEntity(ARMY_ID);
        const streaming = map.worldStreamingStats;
        const armyChunk = army && {
            x: Math.floor(army.x / source.chunkSize),
            y: Math.floor(army.y / source.chunkSize)
        };
        return {
            ready: !disposed,
            persistent: true,
            army,
            armyChunk,
            offscreen: Boolean(armyChunk && streaming
                && Math.max(
                    Math.abs(armyChunk.x - streaming.centerChunkX),
                    Math.abs(armyChunk.y - streaming.centerChunkY)
                ) > 1),
            simulation: simulation.stats,
            checkpoint: checkpoints.stats,
            order: latestOrder
        };
    };

    const publish = () => {
        const army = simulation.getEntity(ARMY_ID);
        if (army) marker.move(army);
        onUpdate(diagnostics());
    };

    const handleArrival = async () => {
        const army = simulation.getEntity(ARMY_ID);
        if (!army || army.state.status !== "arrived"
            || army.state.completedMarches <= handledArrivalMarches) return;
        await map.setTileOverride(army.x, army.y, {
            city: {
                name: `${army.state.label} Outpost`,
                model: "Assets/models/monument"
            }
        });
        await checkpoints.checkpoint();
        handledArrivalMarches = army.state.completedMarches;
    };

    await handleArrival();

    const enqueue = task => {
        const result = operation.then(async () => {
            if (disposed) throw new Error("Campaign demo has been disposed");
            return task();
        });
        operation = result.then(() => undefined, error => {
            console.error(error);
            return undefined;
        });
        return result;
    };

    const advanceNow = async seconds => {
        await simulation.advance(seconds);
        await handleArrival();
        publish();
    };

    const scheduleFrame = () => {
        if (frameScheduled || disposing || disposed || frameSeconds <= 0) return;
        frameScheduled = true;
        void enqueue(async () => {
            const seconds = Math.min(frameSeconds, 0.25);
            frameSeconds -= seconds;
            await advanceNow(seconds);
        }).finally(() => {
            frameScheduled = false;
            scheduleFrame();
        }).catch(() => undefined);
    };

    const frameListener = ({ dtS }) => {
        if (!Number.isFinite(dtS) || dtS <= 0 || disposed) return;
        frameSeconds = Math.min(1, frameSeconds + dtS);
        scheduleFrame();
    };
    map.on("frame", frameListener);

    const controller = {
        get diagnostics() { return diagnostics(); },
        async orderTo(destination) {
            return enqueue(async () => {
                latestOrder = await orderArmyMarch(simulation, pathfinder, ARMY_ID, destination, {
                    maxVisitedPortals: 20_000
                });
                await handleArrival();
                publish();
                return latestOrder;
            });
        },
        async startLongMarch() {
            return enqueue(async () => {
                const army = simulation.getEntity(ARMY_ID);
                if (!army) throw new Error("Campaign army is unavailable");
                const originChunk = {
                    x: Math.floor(army.x / source.chunkSize),
                    y: Math.floor(army.y / source.chunkSize)
                };
                const offsets = [
                    [2, 0], [0, 2], [-2, 0], [0, -2],
                    [2, 1], [2, -1], [-2, 1], [-2, -1],
                    [3, 0], [0, 3]
                ];
                let lastError;
                for (const [dx, dy] of offsets) {
                    const destination = candidateInChunk(
                        engine,
                        seed,
                        source.descriptor.waterStyle,
                        source.chunkSize,
                        originChunk.x + dx,
                        originChunk.y + dy
                    );
                    if (!destination) continue;
                    try {
                        latestOrder = await orderArmyMarch(
                            simulation, pathfinder, ARMY_ID, destination, { maxVisitedPortals: 20_000 }
                        );
                        publish();
                        return latestOrder;
                    } catch (error) {
                        lastError = error;
                    }
                }
                throw lastError ?? new Error("No reachable long-march destination was found");
            });
        },
        async advance(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("campaign advance seconds must be non-negative");
            return enqueue(() => advanceNow(seconds));
        },
        async runUntilSettled(maxSeconds = 120) {
            if (!Number.isInteger(maxSeconds) || maxSeconds <= 0) throw new RangeError("maxSeconds must be positive");
            return enqueue(async () => {
                for (let elapsed = 0; elapsed < maxSeconds; elapsed += 1) {
                    const army = simulation.getEntity(ARMY_ID);
                    if (!army || army.state.status !== "marching") break;
                    await advanceNow(1);
                }
                const army = simulation.getEntity(ARMY_ID);
                if (army?.state.status === "marching") throw new Error("campaign march did not settle within its budget");
                return diagnostics();
            });
        },
        async flush() {
            return enqueue(async () => {
                await checkpoints.checkpoint();
                publish();
            });
        },
        followArmy() {
            const army = simulation.getEntity(ARMY_ID);
            if (army) map.setCameraTargetTile(army.x, army.y);
        },
        async dispose() {
            if (disposePromise) return disposePromise;
            disposing = true;
            map.off("frame", frameListener);
            disposePromise = (async () => {
                try {
                    await operation;
                    await checkpoints.checkpoint();
                } finally {
                    disposed = true;
                    checkpoints.dispose();
                    simulation.dispose();
                    navigation.dispose();
                    marker.dispose();
                }
            })();
            return disposePromise;
        }
    };

    publish();
    return controller;
}

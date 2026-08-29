import {
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MAX_Y,
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_BOUNDARY_MIN_Y,
    HYDROLOGY_POINT_QUANTIZATION,
    HYDROLOGY_REGION_REVISION,
    HydrologyBodyRef,
    HydrologyPort,
    HydrologyRegion,
    HydrologyRegionKey,
    LAKE_HYDROLOGY_PROFILE,
    LakeFeature,
    OCEAN_HYDROLOGY_PROFILE,
    RIVER_HYDROLOGY_PROFILE,
    RiverFeatureSegment,
    RiverMouthFeature,
    createHydrologyRegion
} from "./HydrologyRegion";
import {
    MACRO_DRAINAGE_NODE_STEP_TILES,
    MacroDrainageGraph,
    OCEAN_BODY_ID,
    assertMacroDrainageGraph,
    macroDrainageNodeId,
    macroDrainageNodeTile,
    macroDrainageTerminalBodyId
} from "./MacroDrainageGraph";
import { MACRO_DRAINAGE_TERMINAL, macroDrainageIndex } from "./MacroDrainageTree";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const MIN_RIVER_DISCHARGE = 8;
export const MIN_LAKE_RADIUS_TILES = 4;
export const MAX_LAKE_RADIUS_TILES = 16;

const CLIP_EPSILON = 1e-9;
const MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;

interface ClippedLine {
    readonly startX: number;
    readonly startY: number;
    readonly endX: number;
    readonly endY: number;
    readonly startT: number;
    readonly endT: number;
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function compareIdentity(first: string, second: string): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

function clipAxis(
    start: number,
    delta: number,
    minimum: number,
    maximum: number,
    interval: { minimum: number; maximum: number }
): boolean {
    if (delta === 0) return start >= minimum && start <= maximum;
    let first = (minimum - start) / delta;
    let second = (maximum - start) / delta;
    if (first > second) [first, second] = [second, first];
    interval.minimum = Math.max(interval.minimum, first);
    interval.maximum = Math.min(interval.maximum, second);
    return interval.maximum - interval.minimum > CLIP_EPSILON;
}

function clipLineToRegion(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    minimumX: number,
    minimumY: number,
    maximumX: number,
    maximumY: number
): ClippedLine | undefined {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const interval = { minimum: 0, maximum: 1 };
    if (!clipAxis(startX, deltaX, minimumX, maximumX, interval)
        || !clipAxis(startY, deltaY, minimumY, maximumY, interval)) return undefined;
    const startT = Math.max(0, interval.minimum);
    const endT = Math.min(1, interval.maximum);
    if (endT - startT <= CLIP_EPSILON) return undefined;
    return {
        startX: startX + deltaX * startT,
        startY: startY + deltaY * startT,
        endX: startX + deltaX * endT,
        endY: startY + deltaY * endT,
        startT,
        endT
    };
}

function wrappedNodeStep(from: number, to: number, count: number): number {
    let step = to - from;
    if (step > 1) step -= count;
    else if (step < -1) step += count;
    if (step < -1 || step > 1) throw new Error("toroidal drainage edge is not a neighboring node step");
    return step;
}

function quantizeLocal(value: number, origin: number): number {
    const quantized = Math.round((value - origin) * HYDROLOGY_POINT_QUANTIZATION);
    if (quantized < -0x8000 || quantized > 0x7fff) {
        throw new RangeError("hydrology local coordinate exceeds its int16 format");
    }
    return quantized;
}

function interpolateUint16(first: number, second: number, amount: number): number {
    return Math.max(0, Math.min(0xffff, Math.round(first + (second - first) * amount)));
}

function boundaryMask(localX: number, localY: number, maximumX: number, maximumY: number): number {
    let mask = 0;
    if (localX === 0) mask |= HYDROLOGY_BOUNDARY_MIN_X;
    if (localX === maximumX) mask |= HYDROLOGY_BOUNDARY_MAX_X;
    if (localY === 0) mask |= HYDROLOGY_BOUNDARY_MIN_Y;
    if (localY === maximumY) mask |= HYDROLOGY_BOUNDARY_MAX_Y;
    if (mask === 0) throw new Error("clipped hydrology endpoint is not on a region boundary");
    return mask;
}

function canonicalPortCoordinate(value: number, span: number, toroidal: boolean): number {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) > CLIP_EPSILON || !Number.isSafeInteger(rounded)) {
        throw new Error("macro drainage boundary crossing is not an integer logical tile");
    }
    return toroidal ? positiveModulo(rounded, span) : rounded;
}

function nodeAxisRange(
    minimum: number,
    maximum: number,
    count: number,
    toroidal: boolean
): readonly [minimumNode: number, maximumNode: number] {
    const minimumNode = Math.ceil(
        (minimum - MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET)
        / MACRO_DRAINAGE_NODE_STEP_TILES
    );
    const maximumNode = Math.floor(
        (maximum + MACRO_DRAINAGE_NODE_STEP_TILES - MACRO_NODE_CENTER_OFFSET)
        / MACRO_DRAINAGE_NODE_STEP_TILES
    );
    return toroidal
        ? [minimumNode, maximumNode]
        : [Math.max(0, minimumNode), Math.min(count - 1, maximumNode)];
}

function terminalRiverId(graph: Readonly<MacroDrainageGraph>, sourceIndex: number): string {
    return `river:${macroDrainageNodeId(graph, graph.terminalNode[sourceIndex])}`;
}

function edgeId(graph: Readonly<MacroDrainageGraph>, source: number, parent: number): string {
    return `edge:${macroDrainageNodeId(graph, source)}>${macroDrainageNodeId(graph, parent)}`;
}

function widthClass(dischargeClass: number): number {
    return Math.min(0xff, dischargeClass + 1);
}

function addBody(bodies: Map<string, HydrologyBodyRef>, body: HydrologyBodyRef): void {
    const existing = bodies.get(body.bodyId);
    if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
        throw new Error("hydrology body identity resolved to conflicting kinds or profiles");
    }
    if (!existing) bodies.set(body.bodyId, Object.freeze(body));
}

export class MacroDrainageHydrologySource {
    public readonly graph: MacroDrainageGraph;
    public readonly regionCountX: number;
    public readonly regionCountY: number;
    private readonly terminalWaterLevel: Uint16Array;
    private readonly terminalWaterLevelResolved: Uint8Array;

    constructor(graph: MacroDrainageGraph) {
        assertMacroDrainageGraph(graph);
        this.graph = graph;
        this.regionCountX = Math.ceil(graph.worldWidth / HYDROLOGY_REGION_SIZE);
        this.regionCountY = Math.ceil(graph.worldHeight / HYDROLOGY_REGION_SIZE);
        this.terminalWaterLevel = new Uint16Array(graph.downstream.length);
        this.terminalWaterLevelResolved = new Uint8Array(graph.downstream.length);
        this.initializeTerminalWaterLevels();
    }

    public resolveRegion(regionX: number, regionY: number): HydrologyRegionKey | undefined {
        if (!Number.isSafeInteger(regionX) || !Number.isSafeInteger(regionY)) return undefined;
        if (this.graph.topology === "finite") {
            return regionX >= 0 && regionX < this.regionCountX && regionY >= 0 && regionY < this.regionCountY
                ? Object.freeze({ regionX, regionY }) : undefined;
        }
        return Object.freeze({
            regionX: positiveModulo(regionX, this.regionCountX),
            regionY: positiveModulo(regionY, this.regionCountY)
        });
    }

    public buildRegion(regionX: number, regionY: number): HydrologyRegion {
        const key = this.resolveRegion(regionX, regionY);
        if (!key || key.regionX !== regionX || key.regionY !== regionY) {
            throw new RangeError("hydrology region build requires a canonical in-domain key");
        }
        const origin = chunkOrigin(regionX, regionY, HYDROLOGY_REGION_SIZE);
        const validWidth = Math.min(HYDROLOGY_REGION_SIZE, this.graph.worldWidth - origin.x);
        const validHeight = Math.min(HYDROLOGY_REGION_SIZE, this.graph.worldHeight - origin.y);
        const endX = origin.x + validWidth;
        const endY = origin.y + validHeight;
        const rivers: RiverFeatureSegment[] = [];
        const ports: HydrologyPort[] = [];
        const lakes: LakeFeature[] = [];
        const mouths: RiverMouthFeature[] = [];
        const bodies = new Map<string, HydrologyBodyRef>();
        const segmentIds = new Set<string>();
        const toroidal = this.graph.topology === "toroidal";
        const [minimumNodeX, maximumNodeX] = nodeAxisRange(origin.x, endX, this.graph.width, toroidal);
        const [minimumNodeY, maximumNodeY] = nodeAxisRange(origin.y, endY, this.graph.height, toroidal);

        for (let unwrappedNodeX = minimumNodeX; unwrappedNodeX <= maximumNodeX; unwrappedNodeX += 1) {
            const nodeX = toroidal ? positiveModulo(unwrappedNodeX, this.graph.width) : unwrappedNodeX;
            for (let unwrappedNodeY = minimumNodeY; unwrappedNodeY <= maximumNodeY; unwrappedNodeY += 1) {
                const nodeY = toroidal ? positiveModulo(unwrappedNodeY, this.graph.height) : unwrappedNodeY;
                const sourceIndex = macroDrainageIndex(nodeX, nodeY, this.graph.height);
                const sourceTile = macroDrainageNodeTile(this.graph, sourceIndex);
                const physicalSourceX = toroidal
                    ? unwrappedNodeX * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET
                    : sourceTile.x;
                const physicalSourceY = toroidal
                    ? unwrappedNodeY * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET
                    : sourceTile.y;
                if (physicalSourceX >= origin.x && physicalSourceX < endX
                    && physicalSourceY >= origin.y && physicalSourceY < endY
                    && this.graph.ocean[sourceIndex] !== 0) {
                    addBody(bodies, {
                        bodyId: OCEAN_BODY_ID,
                        kind: "ocean",
                        profileIndex: OCEAN_HYDROLOGY_PROFILE
                    });
                }
                const parentIndex = this.graph.downstream[sourceIndex];
                if (parentIndex === MACRO_DRAINAGE_TERMINAL || this.graph.ocean[sourceIndex] !== 0
                    || this.graph.discharge[sourceIndex] < MIN_RIVER_DISCHARGE) continue;
                const parentX = Math.floor(parentIndex / this.graph.height);
                const parentY = parentIndex - parentX * this.graph.height;
                const parentTile = macroDrainageNodeTile(this.graph, parentIndex);
                const physicalParentX = toroidal
                    ? (unwrappedNodeX + wrappedNodeStep(nodeX, parentX, this.graph.width))
                        * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET
                    : parentTile.x;
                const physicalParentY = toroidal
                    ? (unwrappedNodeY + wrappedNodeStep(nodeY, parentY, this.graph.height))
                        * MACRO_DRAINAGE_NODE_STEP_TILES + MACRO_NODE_CENTER_OFFSET
                    : parentTile.y;
                const clipped = clipLineToRegion(
                    physicalSourceX,
                    physicalSourceY,
                    physicalParentX,
                    physicalParentY,
                    origin.x,
                    origin.y,
                    endX,
                    endY
                );
                if (!clipped) continue;
                const localStartX = quantizeLocal(clipped.startX, origin.x);
                const localStartY = quantizeLocal(clipped.startY, origin.y);
                const localEndX = quantizeLocal(clipped.endX, origin.x);
                const localEndY = quantizeLocal(clipped.endY, origin.y);
                const canonicalEdgeId = edgeId(this.graph, sourceIndex, parentIndex);
                const segmentId = `segment:${canonicalEdgeId}@${regionX}:${regionY}`
                    + `:${localStartX},${localStartY}>${localEndX},${localEndY}`;
                if (segmentIds.has(segmentId)) throw new Error("hydrology region produced a duplicate segment identity");
                segmentIds.add(segmentId);
                const riverId = terminalRiverId(this.graph, sourceIndex);
                const edgeDischargeClass = this.graph.dischargeClass[sourceIndex];
                const edgeWidthClass = widthClass(edgeDischargeClass);
                const startLevel = interpolateUint16(
                    this.graph.spillLevel[sourceIndex],
                    this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL
                        ? this.terminalWaterLevel[parentIndex]
                        : this.graph.spillLevel[parentIndex],
                    clipped.startT
                );
                const endLevel = interpolateUint16(
                    this.graph.spillLevel[sourceIndex],
                    this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL
                        ? this.terminalWaterLevel[parentIndex]
                        : this.graph.spillLevel[parentIndex],
                    clipped.endT
                );
                const directionX = Math.sign(physicalParentX - physicalSourceX);
                const directionY = Math.sign(physicalParentY - physicalSourceY);
                let entry: RiverFeatureSegment["entry"] = {
                    kind: "node",
                    nodeId: macroDrainageNodeId(this.graph, sourceIndex)
                };
                let exit: RiverFeatureSegment["exit"] = this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL
                    ? { kind: "body", bodyId: macroDrainageTerminalBodyId(this.graph, sourceIndex) }
                    : { kind: "node", nodeId: macroDrainageNodeId(this.graph, parentIndex) };
                if (clipped.startT > CLIP_EPSILON) {
                    const canonicalTileX = canonicalPortCoordinate(clipped.startX, this.graph.worldWidth, toroidal);
                    const canonicalTileY = canonicalPortCoordinate(clipped.startY, this.graph.worldHeight, toroidal);
                    const connectionId = `connection:${canonicalEdgeId}@${canonicalTileX}:${canonicalTileY}`;
                    entry = { kind: "port", connectionId };
                    ports.push({
                        connectionId,
                        riverId,
                        segmentId,
                        endpoint: "entry",
                        boundaryMask: boundaryMask(
                            localStartX,
                            localStartY,
                            validWidth * HYDROLOGY_POINT_QUANTIZATION,
                            validHeight * HYDROLOGY_POINT_QUANTIZATION
                        ),
                        point: new Int16Array([localStartX, localStartY]),
                        canonicalTileX,
                        canonicalTileY,
                        flowDirection: new Int8Array([directionX, directionY]),
                        widthClass: edgeWidthClass,
                        level: startLevel,
                        dischargeClass: edgeDischargeClass
                    });
                }
                if (clipped.endT < 1 - CLIP_EPSILON) {
                    const canonicalTileX = canonicalPortCoordinate(clipped.endX, this.graph.worldWidth, toroidal);
                    const canonicalTileY = canonicalPortCoordinate(clipped.endY, this.graph.worldHeight, toroidal);
                    const connectionId = `connection:${canonicalEdgeId}@${canonicalTileX}:${canonicalTileY}`;
                    exit = { kind: "port", connectionId };
                    ports.push({
                        connectionId,
                        riverId,
                        segmentId,
                        endpoint: "exit",
                        boundaryMask: boundaryMask(
                            localEndX,
                            localEndY,
                            validWidth * HYDROLOGY_POINT_QUANTIZATION,
                            validHeight * HYDROLOGY_POINT_QUANTIZATION
                        ),
                        point: new Int16Array([localEndX, localEndY]),
                        canonicalTileX,
                        canonicalTileY,
                        flowDirection: new Int8Array([directionX, directionY]),
                        widthClass: edgeWidthClass,
                        level: endLevel,
                        dischargeClass: edgeDischargeClass
                    });
                }
                const segment: RiverFeatureSegment = {
                    riverId,
                    segmentId,
                    controlPoints: new Int16Array([localStartX, localStartY, localEndX, localEndY]),
                    widthProfile: new Uint8Array([edgeWidthClass, edgeWidthClass]),
                    levelProfile: new Uint16Array([startLevel, endLevel]),
                    dischargeClass: edgeDischargeClass,
                    entry,
                    exit
                };
                rivers.push(segment);
                addBody(bodies, { bodyId: riverId, kind: "river", profileIndex: RIVER_HYDROLOGY_PROFILE });
                if (exit.kind === "body") {
                    const targetKind = this.graph.ocean[parentIndex] !== 0 ? "ocean" : "lake";
                    addBody(bodies, {
                        bodyId: exit.bodyId,
                        kind: targetKind,
                        profileIndex: targetKind === "ocean" ? OCEAN_HYDROLOGY_PROFILE : LAKE_HYDROLOGY_PROFILE
                    });
                    mouths.push({
                        mouthId: `mouth:${canonicalEdgeId}`,
                        riverId,
                        segmentId,
                        targetBodyId: exit.bodyId,
                        point: new Int16Array([localEndX, localEndY]),
                        widthClass: edgeWidthClass,
                        dischargeClass: edgeDischargeClass
                    });
                }
            }
        }
        this.addLakeSlices(key, origin.x, origin.y, validWidth, validHeight, lakes, bodies);
        return createHydrologyRegion({
            worldIdentity: this.graph.worldIdentity,
            topology: this.graph.topology,
            key,
            revision: HYDROLOGY_REGION_REVISION,
            validBounds: { minX: 0, minY: 0, maxXExclusive: validWidth, maxYExclusive: validHeight },
            boundaryPorts: ports,
            rivers,
            lakes,
            mouths,
            bodies: [...bodies.values()].sort((first, second) => compareIdentity(first.bodyId, second.bodyId))
        });
    }

    private addLakeSlices(
        key: Readonly<HydrologyRegionKey>,
        originX: number,
        originY: number,
        validWidth: number,
        validHeight: number,
        lakes: LakeFeature[],
        bodies: Map<string, HydrologyBodyRef>
    ): void {
        if (this.graph.terminalKind !== "lake") return;
        const toroidal = this.graph.topology === "toroidal";
        for (const terminal of this.graph.terminalIndices) {
            const bodyId = macroDrainageTerminalBodyId(this.graph, terminal);
            const center = macroDrainageNodeTile(this.graph, terminal);
            const radiusTiles = Math.min(
                MAX_LAKE_RADIUS_TILES,
                MIN_LAKE_RADIUS_TILES + this.graph.dischargeClass[terminal]
            );
            const radius = radiusTiles * HYDROLOGY_POINT_QUANTIZATION;
            const shiftsX = toroidal ? [-this.graph.worldWidth, 0, this.graph.worldWidth] : [0];
            const shiftsY = toroidal ? [-this.graph.worldHeight, 0, this.graph.worldHeight] : [0];
            for (const shiftX of shiftsX) {
                for (const shiftY of shiftsY) {
                    const physicalCenterX = center.x + shiftX;
                    const physicalCenterY = center.y + shiftY;
                    if (physicalCenterX + radiusTiles < originX
                        || physicalCenterX - radiusTiles > originX + validWidth
                        || physicalCenterY + radiusTiles < originY
                        || physicalCenterY - radiusTiles > originY + validHeight) continue;
                    const localCenterX = quantizeLocal(physicalCenterX, originX);
                    const localCenterY = quantizeLocal(physicalCenterY, originY);
                    lakes.push({
                        featureId: `lake-slice:${bodyId}@${key.regionX}:${key.regionY}:${localCenterX},${localCenterY}`,
                        bodyId,
                        center: new Int16Array([localCenterX, localCenterY]),
                        radius,
                        level: this.terminalWaterLevel[terminal],
                        profileIndex: LAKE_HYDROLOGY_PROFILE
                    });
                    addBody(bodies, { bodyId, kind: "lake", profileIndex: LAKE_HYDROLOGY_PROFILE });
                }
            }
        }
    }

    private initializeTerminalWaterLevels(): void {
        this.terminalWaterLevel.fill(0xffff);
        for (const terminal of this.graph.terminalIndices) {
            if (this.graph.ocean[terminal] !== 0) {
                this.terminalWaterLevel[terminal] = this.graph.seaLevel;
                this.terminalWaterLevelResolved[terminal] = 1;
            }
        }
        for (let index = 0; index < this.graph.downstream.length; index += 1) {
            const parent = this.graph.downstream[index];
            if (parent < 0 || this.graph.ocean[parent] !== 0
                || this.graph.downstream[parent] !== MACRO_DRAINAGE_TERMINAL) continue;
            this.terminalWaterLevel[parent] = Math.min(
                this.terminalWaterLevel[parent],
                this.graph.spillLevel[index]
            );
            this.terminalWaterLevelResolved[parent] = 1;
        }
        for (const terminal of this.graph.terminalIndices) {
            if (this.terminalWaterLevelResolved[terminal] === 0) {
                this.terminalWaterLevel[terminal] = this.graph.groundHeight[terminal];
            }
            if (this.terminalWaterLevel[terminal] < this.graph.groundHeight[terminal]) {
                throw new Error("hydrology terminal water level falls below its ground");
            }
        }
    }
}

import {
    assertHydrologyRegion,
    HydrologyBodyRef,
    HydrologyPort,
    HydrologyRegion,
    LakeFeature,
    RiverEndpoint,
    RiverFeatureSegment,
    RiverMouthFeature
} from "./HydrologyRegion";
import {
    buildMacroDrainageGraph,
    createProceduralMacroHeightSource,
    createStableHydrologyId,
    HydrologyBodyId,
    HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS,
    InfiniteDrainageBasinKey,
    MacroDrainageEdge,
    MacroDrainageGraph,
    MacroDrainageNode,
    MacroHeightSource,
    OCEAN_BODY_ID
} from "./MacroDrainageGraph";
import {
    FULL_HYDROLOGY_REGION_BOUNDS,
    HYDROLOGY_COORDINATE_SCALE,
    HYDROLOGY_INFINITE_BASIN_SIZE,
    HYDROLOGY_REGION_REVISION,
    HYDROLOGY_REGION_SIZE,
    HydrologyRegionKey,
    HydrologyRegionLocalBounds,
    hydrologyRegionOrigin
} from "./WorldSemanticFormat";
import {
    assertWorldDescriptorV2,
    canonicalizeHydrologyRegionKey,
    ProceduralWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export interface HydrologyRegionGenerationOptions {
    readonly descriptor: ProceduralWorldDescriptorV2;
    readonly key: HydrologyRegionKey;
}

export interface HydrologyRegionGeneratorOptions {
    readonly macroHeightSource?: MacroHeightSource;
}

interface Vec2 {
    x: number;
    y: number;
}

interface ClippedLine {
    start: Vec2;
    end: Vec2;
    startT: number;
    endT: number;
}

interface RegionRect {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

const EPSILON = 1e-9;
const RIVER_DROP_WEIGHT_PER_MACRO_EDGE = 96;

function riverNodeLevel(
    node: MacroDrainageNode,
    terminalLevel: number,
    maximumDrainageRank: number
): number {
    const available = 65535 - terminalLevel;
    if (available <= 0) return terminalLevel;
    const scale = available / (available + maximumDrainageRank * RIVER_DROP_WEIGHT_PER_MACRO_EDGE);
    return Math.min(65535, Math.max(terminalLevel, Math.round(
        terminalLevel + (
            node.drainageLevel - terminalLevel
            + node.drainageRank * RIVER_DROP_WEIGHT_PER_MACRO_EDGE
        ) * scale
    )));
}

function validBoundsFor(
    descriptor: WorldDescriptorV2,
    key: HydrologyRegionKey
): Readonly<HydrologyRegionLocalBounds> {
    const origin = hydrologyRegionOrigin(key);
    if (descriptor.topology === "infinite") {
        const minX = Math.max(0, Number.MIN_SAFE_INTEGER - origin.x);
        const minY = Math.max(0, Number.MIN_SAFE_INTEGER - origin.y);
        const maxXExclusive = Math.min(HYDROLOGY_REGION_SIZE, Number.MAX_SAFE_INTEGER - origin.x + 1);
        const maxYExclusive = Math.min(HYDROLOGY_REGION_SIZE, Number.MAX_SAFE_INTEGER - origin.y + 1);
        return Object.freeze({ minX, minY, maxXExclusive, maxYExclusive });
    }
    if (origin.x >= descriptor.width || origin.y >= descriptor.height || origin.x < 0 || origin.y < 0) {
        throw new RangeError("hydrology region does not intersect the finite world bounds");
    }
    const maxXExclusive = Math.min(HYDROLOGY_REGION_SIZE, descriptor.width - origin.x);
    const maxYExclusive = Math.min(HYDROLOGY_REGION_SIZE, descriptor.height - origin.y);
    if (maxXExclusive === HYDROLOGY_REGION_SIZE && maxYExclusive === HYDROLOGY_REGION_SIZE) {
        return FULL_HYDROLOGY_REGION_BOUNDS;
    }
    return Object.freeze({ minX: 0, minY: 0, maxXExclusive, maxYExclusive });
}

function basinForRegion(key: HydrologyRegionKey): InfiniteDrainageBasinKey {
    const origin = hydrologyRegionOrigin(key);
    return {
        basinX: Math.floor(origin.x / HYDROLOGY_INFINITE_BASIN_SIZE),
        basinY: Math.floor(origin.y / HYDROLOGY_INFINITE_BASIN_SIZE)
    };
}

function clipLine(start: Vec2, end: Vec2, rect: RegionRect): ClippedLine | undefined {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let startT = 0;
    let endT = 1;
    const tests = [
        [-dx, start.x - rect.minX],
        [dx, rect.maxX - start.x],
        [-dy, start.y - rect.minY],
        [dy, rect.maxY - start.y]
    ] as const;
    for (const [p, q] of tests) {
        if (Math.abs(p) <= EPSILON) {
            if (q < 0) return undefined;
            continue;
        }
        const ratio = q / p;
        if (p < 0) startT = Math.max(startT, ratio);
        else endT = Math.min(endT, ratio);
        if (startT > endT) return undefined;
    }
    if (endT - startT <= EPSILON) return undefined;
    return {
        start: { x: start.x + dx * startT, y: start.y + dy * startT },
        end: { x: start.x + dx * endT, y: start.y + dy * endT },
        startT,
        endT
    };
}

function shortestDelta(delta: number, period: number, wraps: boolean): number {
    if (!wraps) return delta;
    if (delta > period / 2) return delta - period;
    if (delta < -period / 2) return delta + period;
    return delta;
}

function quantizeLocal(value: number, origin: number): number {
    const quantized = Math.round((value - origin) * HYDROLOGY_COORDINATE_SCALE);
    if (quantized < 0 || quantized > HYDROLOGY_REGION_SIZE * HYDROLOGY_COORDINATE_SCALE) {
        throw new RangeError("clipped hydrology coordinate lies outside its region");
    }
    return quantized;
}

function interpolateUint16(upstream: number, downstream: number, amount: number): number {
    return Math.max(0, Math.min(65535, Math.floor(upstream + (downstream - upstream) * amount + 0.5)));
}

function riverWidth(dischargeClass: number): number {
    return Math.min(255, 12 + dischargeClass * 8);
}

function normalizedFlow(start: Vec2, end: Vec2): readonly [number, number] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) throw new TypeError("hydrology edge has zero length");
    return [Math.round(dx / length * 127), Math.round(dy / length * 127)];
}

function pointSide(point: Vec2, rect: RegionRect, flow: readonly [number, number]): HydrologyPort["side"] {
    const west = Math.abs(point.x - rect.minX) <= EPSILON;
    const east = Math.abs(point.x - rect.maxX) <= EPSILON;
    const north = Math.abs(point.y - rect.minY) <= EPSILON;
    const south = Math.abs(point.y - rect.maxY) <= EPSILON;
    if ((west || east) && (north || south)) {
        if (Math.abs(flow[0]) >= Math.abs(flow[1])) return west ? "west" : "east";
        return north ? "north" : "south";
    }
    if (west) return "west";
    if (east) return "east";
    if (north) return "north";
    if (south) return "south";
    throw new TypeError("clipped river endpoint is not on a region boundary");
}

function canonicalCrossingCoordinate(value: number, period: number, wraps: boolean): string {
    const canonical = wraps ? value - Math.floor(value / period) * period : value;
    return canonical.toFixed(8);
}

function endpointAtNode(
    node: MacroDrainageNode,
    incomingRiverEdges: ReadonlyMap<string, number>,
    terminalNodes: ReadonlySet<string>,
    edge: MacroDrainageEdge,
    isExit: boolean
): RiverEndpoint {
    let kind: RiverEndpoint["kind"];
    if (isExit) kind = terminalNodes.has(node.nodeId) ? "mouth" : "confluence";
    else kind = (incomingRiverEdges.get(node.nodeId) ?? 0) === 0 ? "source" : "confluence";
    return Object.freeze({
        kind,
        connectionId: createStableHydrologyId(
            kind === "mouth" ? "river-mouth-node" : "river-node",
            kind === "mouth" ? [edge.riverId, node.nodeId, edge.edgeId] : [edge.riverId, node.nodeId]
        )
    });
}

function freezeBody(bodyId: HydrologyBodyId, kind: HydrologyBodyRef["kind"], profileIndex: number): HydrologyBodyRef {
    return Object.freeze({ bodyId, kind, profileIndex });
}

function clipPolygonToRect(points: readonly Vec2[], rect: RegionRect): Vec2[] {
    type Boundary = "west" | "east" | "north" | "south";
    const boundaries: readonly Boundary[] = ["west", "east", "north", "south"];
    let output = [...points];
    for (const boundary of boundaries) {
        const input = output;
        output = [];
        const inside = (point: Vec2): boolean => {
            if (boundary === "west") return point.x >= rect.minX - EPSILON;
            if (boundary === "east") return point.x <= rect.maxX + EPSILON;
            if (boundary === "north") return point.y >= rect.minY - EPSILON;
            return point.y <= rect.maxY + EPSILON;
        };
        const intersection = (start: Vec2, end: Vec2): Vec2 => {
            if (boundary === "west" || boundary === "east") {
                const x = boundary === "west" ? rect.minX : rect.maxX;
                const amount = (x - start.x) / (end.x - start.x);
                return { x, y: start.y + (end.y - start.y) * amount };
            }
            const y = boundary === "north" ? rect.minY : rect.maxY;
            const amount = (y - start.y) / (end.y - start.y);
            return { x: start.x + (end.x - start.x) * amount, y };
        };
        for (let index = 0; index < input.length; index += 1) {
            const start = input[(index + input.length - 1) % input.length];
            const end = input[index];
            const startInside = inside(start);
            const endInside = inside(end);
            if (endInside) {
                if (!startInside) output.push(intersection(start, end));
                output.push(end);
            } else if (startInside) {
                output.push(intersection(start, end));
            }
        }
        if (output.length === 0) break;
    }
    return output;
}

function lakeBoundary(
    node: MacroDrainageNode,
    localOrigin: Vec2,
    rect: RegionRect
): Int16Array | undefined {
    const radius = Math.min(12, 6 + node.dischargeClass);
    const circle: Vec2[] = [];
    for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        circle.push({ x: node.x + Math.cos(angle) * radius, y: node.y + Math.sin(angle) * radius });
    }
    const clipped = clipPolygonToRect(circle, rect);
    if (clipped.length < 3) return undefined;
    const points = new Int16Array(clipped.length * 2);
    for (let index = 0; index < clipped.length; index += 1) {
        points[index * 2] = quantizeLocal(clipped[index].x, localOrigin.x);
        points[index * 2 + 1] = quantizeLocal(clipped[index].y, localOrigin.y);
    }
    return points;
}

function shiftedCopies(graph: MacroDrainageGraph): readonly Vec2[] {
    const shiftsX = graph.wrapX ? [-graph.width, 0, graph.width] : [0];
    const shiftsY = graph.wrapY ? [-graph.height, 0, graph.height] : [0];
    const shifts: Vec2[] = [];
    for (const x of shiftsX) for (const y of shiftsY) shifts.push({ x, y });
    return shifts;
}

function compileRegionFromGraph(
    graph: MacroDrainageGraph,
    key: HydrologyRegionKey,
    bounds: Readonly<HydrologyRegionLocalBounds>
): HydrologyRegion {
    const origin = hydrologyRegionOrigin(key);
    const rect: RegionRect = {
        minX: origin.x + bounds.minX,
        minY: origin.y + bounds.minY,
        maxX: origin.x + bounds.maxXExclusive,
        maxY: origin.y + bounds.maxYExclusive
    };
    const nodeById = new Map(graph.nodes.map(node => [node.nodeId, node]));
    const terminalByNode = new Map(graph.terminals.map(terminal => [terminal.nodeId, terminal]));
    const terminalLevelByBody = new Map(graph.terminals.map(terminal => [terminal.bodyId, terminal.level]));
    const maximumDrainageRank = graph.nodes.reduce(
        (maximum, node) => Math.max(maximum, node.drainageRank),
        0
    );
    const terminalNodes = new Set(terminalByNode.keys());
    const riverEdges = graph.edges.filter(edge => edge.dischargeClass >= HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS);
    const incomingRiverEdges = new Map<string, number>();
    for (const edge of riverEdges) {
        incomingRiverEdges.set(edge.downstreamNodeId, (incomingRiverEdges.get(edge.downstreamNodeId) ?? 0) + 1);
    }
    const boundaryPorts: HydrologyPort[] = [];
    const rivers: RiverFeatureSegment[] = [];
    const lakes: LakeFeature[] = [];
    const mouths: RiverMouthFeature[] = [];
    const bodies = new Map<HydrologyBodyId, HydrologyBodyRef>();
    bodies.set(OCEAN_BODY_ID, freezeBody(OCEAN_BODY_ID, "ocean", 0));
    const shifts = shiftedCopies(graph);

    for (const edge of riverEdges) {
        const upstream = nodeById.get(edge.upstreamNodeId);
        const downstream = nodeById.get(edge.downstreamNodeId);
        if (!upstream || !downstream) throw new Error("drainage edge references a missing node");
        const dx = shortestDelta(downstream.x - upstream.x, graph.width, graph.wrapX);
        const dy = shortestDelta(downstream.y - upstream.y, graph.height, graph.wrapY);
        const unshiftedEnd = { x: upstream.x + dx, y: upstream.y + dy };
        const flow = normalizedFlow(upstream, unshiftedEnd);
        let piece = 0;
        for (const shift of shifts) {
            const start = { x: upstream.x + shift.x, y: upstream.y + shift.y };
            const end = { x: unshiftedEnd.x + shift.x, y: unshiftedEnd.y + shift.y };
            const clipped = clipLine(start, end, rect);
            if (!clipped) continue;
            bodies.set(edge.riverId, freezeBody(edge.riverId, "river", Math.min(255, edge.dischargeClass)));
            const controlPoints = new Int16Array([
                quantizeLocal(clipped.start.x, origin.x),
                quantizeLocal(clipped.start.y, origin.y),
                quantizeLocal(clipped.end.x, origin.x),
                quantizeLocal(clipped.end.y, origin.y)
            ]);
            const width = riverWidth(edge.dischargeClass);
            const widthProfile = new Uint8Array([width, width]);
            const terminalLevel = terminalLevelByBody.get(edge.terminalBodyId);
            if (terminalLevel === undefined) throw new Error("drainage edge references a missing terminal body");
            const upstreamLevel = riverNodeLevel(upstream, terminalLevel, maximumDrainageRank);
            const downstreamLevel = riverNodeLevel(downstream, terminalLevel, maximumDrainageRank);
            const levelProfile = new Uint16Array([
                interpolateUint16(upstreamLevel, downstreamLevel, clipped.startT),
                interpolateUint16(upstreamLevel, downstreamLevel, clipped.endT)
            ]);
            const makeBoundaryEndpoint = (
                point: Vec2,
                direction: "in" | "out",
                level: number
            ): RiverEndpoint => {
                const side = pointSide(point, rect, flow);
                const connectionId = createStableHydrologyId("river-crossing", [
                    edge.edgeId,
                    canonicalCrossingCoordinate(point.x, graph.width, graph.wrapX),
                    canonicalCrossingCoordinate(point.y, graph.height, graph.wrapY)
                ]);
                const port = Object.freeze({
                    portId: createStableHydrologyId("river-port", [
                        connectionId, key.regionX, key.regionY, side, direction, piece
                    ]),
                    connectionId,
                    edgeId: edge.edgeId,
                    riverId: edge.riverId,
                    bodyId: edge.riverId,
                    side,
                    x: quantizeLocal(point.x, origin.x),
                    y: quantizeLocal(point.y, origin.y),
                    flow: direction,
                    flowX: flow[0],
                    flowY: flow[1],
                    width,
                    level,
                    dischargeClass: edge.dischargeClass
                } as const);
                boundaryPorts.push(port);
                return Object.freeze({ kind: "boundary", connectionId });
            };
            const entry = clipped.startT > EPSILON
                ? makeBoundaryEndpoint(clipped.start, "in", levelProfile[0])
                : endpointAtNode(upstream, incomingRiverEdges, terminalNodes, edge, false);
            const exit = clipped.endT < 1 - EPSILON
                ? makeBoundaryEndpoint(clipped.end, "out", levelProfile[1])
                : endpointAtNode(downstream, incomingRiverEdges, terminalNodes, edge, true);
            const segment = Object.freeze({
                riverId: edge.riverId,
                segmentId: createStableHydrologyId("river-segment", [
                    edge.edgeId, key.regionX, key.regionY, piece,
                    controlPoints[0], controlPoints[1], controlPoints[2], controlPoints[3]
                ]),
                edgeId: edge.edgeId,
                controlPoints,
                widthProfile,
                levelProfile,
                dischargeClass: edge.dischargeClass,
                entry,
                exit
            });
            rivers.push(segment);
            if (exit.kind === "mouth") {
                const terminal = terminalByNode.get(downstream.nodeId);
                if (!terminal) throw new Error("river mouth resolved an unknown terminal");
                bodies.set(terminal.bodyId, freezeBody(
                    terminal.bodyId,
                    terminal.kind,
                    terminal.kind === "ocean" ? 0 : 1
                ));
                mouths.push(Object.freeze({
                    mouthId: exit.connectionId,
                    riverId: edge.riverId,
                    targetBodyId: terminal.bodyId,
                    x: controlPoints[controlPoints.length - 2],
                    y: controlPoints[controlPoints.length - 1],
                    width,
                    level: levelProfile[levelProfile.length - 1]
                }));
            }
            piece += 1;
        }
    }

    for (const terminal of graph.terminals) {
        if (terminal.kind !== "lake") continue;
        const node = nodeById.get(terminal.nodeId);
        if (!node) throw new Error("lake terminal references a missing node");
        for (const shift of shifts) {
            const point = { x: node.x + shift.x, y: node.y + shift.y };
            const shiftedNode = { ...node, x: point.x, y: point.y };
            const boundaryPoints = lakeBoundary(shiftedNode, origin, rect);
            if (!boundaryPoints) continue;
            const lakeId = createStableHydrologyId("lake-feature", [
                terminal.bodyId, key.regionX, key.regionY, shift.x, shift.y
            ]);
            bodies.set(terminal.bodyId, freezeBody(terminal.bodyId, "lake", 1));
            lakes.push(Object.freeze({
                lakeId,
                bodyId: terminal.bodyId,
                boundaryPoints,
                level: terminal.level,
                profileIndex: 1
            }));
        }
    }

    const region: HydrologyRegion = Object.freeze({
        key: Object.freeze({ ...key }),
        revision: HYDROLOGY_REGION_REVISION,
        validBounds: bounds,
        boundaryPorts: Object.freeze(boundaryPorts.sort((first, second) => first.portId.localeCompare(second.portId))),
        rivers: Object.freeze(rivers.sort((first, second) => first.segmentId.localeCompare(second.segmentId))),
        lakes: Object.freeze(lakes.sort((first, second) => first.lakeId.localeCompare(second.lakeId))),
        mouths: Object.freeze(mouths.sort((first, second) => first.mouthId.localeCompare(second.mouthId))),
        bodies: Object.freeze([...bodies.values()].sort((first, second) => first.bodyId.localeCompare(second.bodyId)))
    });
    assertHydrologyRegion(region);
    return region;
}

export class HydrologyRegionGenerator {
    private readonly macroHeightSource: MacroHeightSource;
    private graph?: MacroDrainageGraph;
    private graphKey?: string;

    constructor(
        public readonly descriptor: WorldDescriptorV2,
        options: HydrologyRegionGeneratorOptions = {}
    ) {
        assertWorldDescriptorV2(descriptor);
        this.macroHeightSource = options.macroHeightSource
            ?? (descriptor.sourceKind === "static"
                ? (() => { throw new TypeError("static hydrology requires an immutable macro height source"); })()
                : createProceduralMacroHeightSource(descriptor));
    }

    public generate(key: HydrologyRegionKey): HydrologyRegion {
        const canonicalKey = canonicalizeHydrologyRegionKey(this.descriptor, key);
        const bounds = validBoundsFor(this.descriptor, canonicalKey);
        const basin = this.descriptor.topology === "infinite" ? basinForRegion(canonicalKey) : undefined;
        const graphKey = basin ? `${basin.basinX},${basin.basinY}` : "finite";
        if (!this.graph || this.graphKey !== graphKey) {
            this.graph = buildMacroDrainageGraph({
                descriptor: this.descriptor,
                basin,
                macroHeightSource: this.macroHeightSource
            });
            this.graphKey = graphKey;
        }
        return compileRegionFromGraph(this.graph, canonicalKey, bounds);
    }
}

export function generateHydrologyRegion(options: HydrologyRegionGenerationOptions): HydrologyRegion {
    if (!options || typeof options !== "object") {
        throw new TypeError("hydrology region generation options are required");
    }
    return new HydrologyRegionGenerator(options.descriptor).generate(options.key);
}

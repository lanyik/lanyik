import { LANDFORM_SEA_LEVEL } from "../LandformSampler";
import {
    createSemanticChunkSurfaceResolver,
    quantizeMacroHeight
} from "./generateBaseSemanticChunk";
import {
    HYDROLOGY_INFINITE_BASIN_SIZE,
    HYDROLOGY_MACRO_CELL_SIZE,
    positiveIntegerModulo
} from "./WorldSemanticFormat";
import {
    assertWorldDescriptorV2,
    ProceduralWorldDescriptorV2,
    serializeWorldDescriptorV2,
    WorldDescriptorV2
} from "./WorldDescriptorV2";

export type HydrologyBodyId = string;
export type HydrologyFeatureId = string;
export type HydrologyNodeId = string;
export type HydrologyEdgeId = string;

export const OCEAN_BODY_ID: HydrologyBodyId = "hydrology:ocean:v1";
export const HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS = 2;
export const HYDROLOGY_MAX_DISCHARGE_CLASS = 15;
export const HYDROLOGY_MAX_MACRO_NODES = 16_384;
export const HYDROLOGY_SEA_LEVEL = quantizeMacroHeight(LANDFORM_SEA_LEVEL);

const HYDROLOGY_MIN_EXPLICIT_LAKE_COMPONENT_NODES = 128;
const HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE = 8;

export interface InfiniteDrainageBasinKey {
    readonly basinX: number;
    readonly basinY: number;
}

export interface MacroHeightSource {
    sampleMacroHeight(tileX: number, tileY: number): number;
}

export interface MacroDrainageTerminal {
    readonly nodeId: HydrologyNodeId;
    readonly bodyId: HydrologyBodyId;
    readonly kind: "ocean" | "lake";
    readonly level: number;
}

export interface MacroDrainageNode {
    readonly nodeId: HydrologyNodeId;
    readonly x: number;
    readonly y: number;
    readonly macroHeight: number;
    readonly drainageLevel: number;
    readonly downstreamNodeId?: HydrologyNodeId;
    readonly terminalBodyId: HydrologyBodyId;
    readonly drainageRank: number;
    readonly dischargeClass: number;
    readonly accumulatedFlow: number;
}

export interface MacroDrainageEdge {
    readonly edgeId: HydrologyEdgeId;
    readonly riverId: HydrologyFeatureId;
    readonly upstreamNodeId: HydrologyNodeId;
    readonly downstreamNodeId: HydrologyNodeId;
    readonly terminalBodyId: HydrologyBodyId;
    readonly dischargeClass: number;
}

export interface MacroDrainageGraph {
    readonly graphId: string;
    readonly topology: "infinite-basin" | "bounded" | "toroidal";
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
    readonly wrapX: boolean;
    readonly wrapY: boolean;
    readonly nodes: readonly MacroDrainageNode[];
    readonly edges: readonly MacroDrainageEdge[];
    readonly terminals: readonly MacroDrainageTerminal[];
}

export interface BuildMacroDrainageGraphOptions {
    readonly descriptor: WorldDescriptorV2;
    readonly basin?: InfiniteDrainageBasinKey;
    readonly macroHeightSource?: MacroHeightSource;
}

interface MutableNode {
    nodeId: HydrologyNodeId;
    x: number;
    y: number;
    macroHeight: number;
    drainageLevel?: number;
    gridX: number;
    gridY: number;
    downstreamIndex?: number;
    terminalIndex?: number;
    drainageRank?: number;
    accumulatedFlow: number;
    distanceToTerminal?: number;
    settled?: boolean;
    included?: boolean;
    isDrainageRoot?: boolean;
    outletIngressIndices?: Set<number>;
}

interface DrainageQueueEntry {
    readonly nodeIndex: number;
    readonly drainageLevel: number;
    readonly distance: number;
}

class DrainageMinHeap {
    private readonly entries: DrainageQueueEntry[] = [];

    public push(entry: DrainageQueueEntry): void {
        this.entries.push(entry);
        let index = this.entries.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (!DrainageMinHeap.less(entry, this.entries[parent])) break;
            this.entries[index] = this.entries[parent];
            index = parent;
        }
        this.entries[index] = entry;
    }

    public pop(): DrainageQueueEntry | undefined {
        const first = this.entries[0];
        const last = this.entries.pop();
        if (!first || !last || this.entries.length === 0) return first;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= this.entries.length) break;
            const right = left + 1;
            const child = right < this.entries.length && DrainageMinHeap.less(this.entries[right], this.entries[left])
                ? right : left;
            if (!DrainageMinHeap.less(this.entries[child], last)) break;
            this.entries[index] = this.entries[child];
            index = child;
        }
        this.entries[index] = last;
        return first;
    }

    private static less(first: DrainageQueueEntry, second: DrainageQueueEntry): boolean {
        return first.drainageLevel < second.drainageLevel
            || first.drainageLevel === second.drainageLevel && (first.distance < second.distance
                || first.distance === second.distance && first.nodeIndex < second.nodeIndex);
    }
}

const STABLE_ID_SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35] as const;

function hashText(value: string, initial: number): number {
    let hash = initial >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
        hash ^= hash >>> 13;
    }
    return hash >>> 0;
}

export function createStableHydrologyId(namespace: string, parts: readonly unknown[]): string {
    if (!/^[a-z][a-z0-9-]*$/.test(namespace)) {
        throw new TypeError("hydrology ID namespace must use lowercase ASCII words");
    }
    const canonical = JSON.stringify(parts);
    const digest = STABLE_ID_SEEDS
        .map(seed => hashText(canonical, seed).toString(16).padStart(8, "0"))
        .join("");
    return `${namespace}:${digest}`;
}

function assertMacroHeight(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new RangeError("macro height source must return a Uint16 value");
    }
}

function assertBasinKey(value: InfiniteDrainageBasinKey | undefined): asserts value is InfiniteDrainageBasinKey {
    if (!value || !Number.isSafeInteger(value.basinX) || !Number.isSafeInteger(value.basinY)
        || Object.getOwnPropertyNames(value).some(name => name !== "basinX" && name !== "basinY")) {
        throw new TypeError("infinite hydrology requires a safe-integer basin key");
    }
    const originX = value.basinX * HYDROLOGY_INFINITE_BASIN_SIZE;
    const originY = value.basinY * HYDROLOGY_INFINITE_BASIN_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER
        || originX + HYDROLOGY_INFINITE_BASIN_SIZE - 1 < Number.MIN_SAFE_INTEGER
        || originY > Number.MAX_SAFE_INTEGER
        || originY + HYDROLOGY_INFINITE_BASIN_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
        throw new RangeError("hydrology basin lies outside the safe integer tile domain");
    }
}

export function createProceduralMacroHeightSource(
    descriptor: ProceduralWorldDescriptorV2
): MacroHeightSource {
    const resolver = createSemanticChunkSurfaceResolver(descriptor);
    return Object.freeze({
        sampleMacroHeight(tileX: number, tileY: number): number {
            if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
                throw new RangeError("macro height coordinates must be safe integers");
            }
            return quantizeMacroHeight(resolver.sampleGenerated(tileX, tileY).landform.elevation);
        }
    });
}

function dimensionsFor(options: BuildMacroDrainageGraphOptions): {
    topology: MacroDrainageGraph["topology"];
    originX: number;
    originY: number;
    width: number;
    height: number;
    wrapX: boolean;
    wrapY: boolean;
    graphParts: readonly unknown[];
} {
    const descriptor = options.descriptor;
    if (descriptor.topology === "infinite") {
        assertBasinKey(options.basin);
        return {
            topology: "infinite-basin",
            originX: options.basin.basinX * HYDROLOGY_INFINITE_BASIN_SIZE,
            originY: options.basin.basinY * HYDROLOGY_INFINITE_BASIN_SIZE,
            width: HYDROLOGY_INFINITE_BASIN_SIZE,
            height: HYDROLOGY_INFINITE_BASIN_SIZE,
            wrapX: false,
            wrapY: false,
            graphParts: [serializeWorldDescriptorV2(descriptor), options.basin.basinX, options.basin.basinY]
        };
    }
    if (options.basin !== undefined) {
        throw new TypeError("finite hydrology graphs do not accept an infinite basin key");
    }
    return {
        topology: descriptor.topology,
        originX: 0,
        originY: 0,
        width: descriptor.width,
        height: descriptor.height,
        wrapX: descriptor.topology === "toroidal",
        wrapY: descriptor.topology === "toroidal",
        graphParts: [serializeWorldDescriptorV2(descriptor)]
    };
}

function resolveHeightSource(options: BuildMacroDrainageGraphOptions): MacroHeightSource {
    if (options.macroHeightSource) return options.macroHeightSource;
    if (options.descriptor.sourceKind === "static") {
        throw new TypeError("static hydrology graph generation requires an explicit immutable macro height source");
    }
    return createProceduralMacroHeightSource(options.descriptor);
}

function nodeCoordinate(origin: number, size: number, grid: number): number {
    return Math.min(origin + size - 1, origin + grid * HYDROLOGY_MACRO_CELL_SIZE
        + Math.floor(HYDROLOGY_MACRO_CELL_SIZE / 2));
}

function neighborIndices(
    node: MutableNode,
    columns: number,
    rows: number,
    wrapX: boolean,
    wrapY: boolean
): number[] {
    const result = new Set<number>();
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            if (dx === 0 && dy === 0) continue;
            let x = node.gridX + dx;
            let y = node.gridY + dy;
            if (wrapX) x = positiveIntegerModulo(x, columns);
            if (wrapY) y = positiveIntegerModulo(y, rows);
            if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
            const index = x * rows + y;
            if (index !== node.gridX * rows + node.gridY) result.add(index);
        }
    }
    return [...result];
}

function buildNeighborTable(
    nodes: readonly MutableNode[],
    columns: number,
    rows: number,
    wrapX: boolean,
    wrapY: boolean
): readonly number[][] {
    return nodes.map(node => neighborIndices(node, columns, rows, wrapX, wrapY));
}

function lowerNodeFirst(nodes: readonly MutableNode[], first: number, second: number): number {
    return nodes[first].macroHeight - nodes[second].macroHeight || first - second;
}

function selectExplicitLake(
    component: readonly number[],
    componentId: number,
    componentByNode: Int32Array,
    outletIngressIndex: number,
    nodes: readonly MutableNode[],
    neighbors: readonly number[][],
    distances: Int32Array
): number | undefined {
    if (component.length < HYDROLOGY_MIN_EXPLICIT_LAKE_COMPONENT_NODES) return undefined;
    const queue: number[] = [];
    distances[outletIngressIndex] = 0;
    queue.push(outletIngressIndex);
    let maximumDistance = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        const distance = distances[index];
        maximumDistance = Math.max(maximumDistance, distance);
        for (const candidateIndex of neighbors[index]) {
            if (componentByNode[candidateIndex] !== componentId || distances[candidateIndex] >= 0) continue;
            distances[candidateIndex] = distance + 1;
            queue.push(candidateIndex);
        }
    }
    if (maximumDistance < HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE) {
        for (const index of component) distances[index] = -1;
        return undefined;
    }

    const minimumDistance = Math.max(
        HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE,
        Math.ceil(maximumDistance * 2 / 3)
    );
    let selected: number | undefined;
    let selectedIsLocalMinimum = false;
    for (const index of component) {
        if (distances[index] < minimumDistance) continue;
        const isLocalMinimum = neighbors[index].every(candidateIndex =>
            componentByNode[candidateIndex] !== componentId
            || nodes[candidateIndex].macroHeight >= nodes[index].macroHeight
        );
        if (selected === undefined
            || isLocalMinimum && !selectedIsLocalMinimum
            || isLocalMinimum === selectedIsLocalMinimum
                && (nodes[index].macroHeight < nodes[selected].macroHeight
                    || nodes[index].macroHeight === nodes[selected].macroHeight
                        && (distances[index] > distances[selected]
                            || distances[index] === distances[selected] && index < selected))) {
            selected = index;
            selectedIsLocalMinimum = isLocalMinimum;
        }
    }
    for (const index of component) distances[index] = -1;
    return selected;
}

function selectDrainageRoots(
    nodes: MutableNode[],
    neighbors: readonly number[][]
): ReadonlySet<number> {
    const componentByNode = new Int32Array(nodes.length);
    componentByNode.fill(-1);
    const components: number[][] = [];
    for (let start = 0; start < nodes.length; start += 1) {
        if (nodes[start].macroHeight < HYDROLOGY_SEA_LEVEL || componentByNode[start] >= 0) continue;
        const componentId = components.length;
        const component: number[] = [start];
        componentByNode[start] = componentId;
        for (let cursor = 0; cursor < component.length; cursor += 1) {
            const index = component[cursor];
            for (const candidateIndex of neighbors[index]) {
                if (nodes[candidateIndex].macroHeight < HYDROLOGY_SEA_LEVEL
                    || componentByNode[candidateIndex] >= 0) continue;
                componentByNode[candidateIndex] = componentId;
                component.push(candidateIndex);
            }
        }
        components.push(component);
    }

    const roots = new Set<number>();
    const distances = new Int32Array(nodes.length);
    distances.fill(-1);
    for (let componentId = 0; componentId < components.length; componentId += 1) {
        const component = components[componentId];
        const outletCandidates = new Set<number>();
        for (const index of component) {
            nodes[index].included = true;
            for (const candidateIndex of neighbors[index]) {
                if (nodes[candidateIndex].macroHeight < HYDROLOGY_SEA_LEVEL) {
                    outletCandidates.add(candidateIndex);
                }
            }
        }
        if (outletCandidates.size === 0) {
            roots.add([...component].sort((first, second) => lowerNodeFirst(nodes, first, second))[0]);
            continue;
        }
        const outletIndex = [...outletCandidates]
            .sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
        const outletIngressIndex = neighbors[outletIndex]
            .filter(index => componentByNode[index] === componentId)
            .sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
        if (outletIngressIndex === undefined) {
            throw new Error("selected hydrology outlet does not touch its land component");
        }
        roots.add(outletIndex);
        nodes[outletIndex].included = true;
        (nodes[outletIndex].outletIngressIndices ??= new Set()).add(outletIngressIndex);
        const lakeIndex = selectExplicitLake(
            component,
            componentId,
            componentByNode,
            outletIngressIndex,
            nodes,
            neighbors,
            distances
        );
        if (lakeIndex !== undefined) roots.add(lakeIndex);
    }

    if (roots.size === 0) {
        const oceanIndex = nodes.map((_, index) => index)
            .sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
        roots.add(oceanIndex);
        nodes[oceanIndex].included = true;
    }
    return roots;
}

function assignDrainage(
    nodes: MutableNode[],
    columns: number,
    rows: number,
    wrapX: boolean,
    wrapY: boolean
): void {
    const neighbors = buildNeighborTable(nodes, columns, rows, wrapX, wrapY);
    const seedIndices = selectDrainageRoots(nodes, neighbors);
    const queue = new DrainageMinHeap();
    let settled = 0;
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node.macroHeight >= HYDROLOGY_SEA_LEVEL || seedIndices.has(index)) continue;
        node.drainageLevel = HYDROLOGY_SEA_LEVEL;
        node.distanceToTerminal = 0;
        node.terminalIndex = index;
        node.drainageRank = 0;
        node.settled = true;
        settled += 1;
    }
    for (const index of seedIndices) {
        const node = nodes[index];
        node.isDrainageRoot = true;
        node.drainageLevel = node.macroHeight < HYDROLOGY_SEA_LEVEL ? HYDROLOGY_SEA_LEVEL : node.macroHeight;
        node.distanceToTerminal = 0;
        node.terminalIndex = index;
        node.drainageRank = 0;
        queue.push({ nodeIndex: index, drainageLevel: node.drainageLevel, distance: 0 });
    }

    while (settled < nodes.length) {
        const entry = queue.pop();
        if (!entry) throw new Error("macro drainage priority flood did not reach every node");
        const node = nodes[entry.nodeIndex];
        if (node.settled || node.drainageLevel !== entry.drainageLevel
            || node.distanceToTerminal !== entry.distance) continue;
        node.settled = true;
        settled += 1;
        const candidateIndices = node.outletIngressIndices ?? neighbors[entry.nodeIndex];
        for (const candidateIndex of candidateIndices) {
            const candidate = nodes[candidateIndex];
            if (candidate.settled || candidate.isDrainageRoot
                || candidate.macroHeight < HYDROLOGY_SEA_LEVEL) continue;
            const candidateLevel = Math.max(candidate.macroHeight, node.drainageLevel);
            const candidateDistance = (node.distanceToTerminal as number) + 1;
            const priorParent = candidate.downstreamIndex;
            const better = candidate.drainageLevel === undefined
                || candidateLevel < candidate.drainageLevel
                || candidateLevel === candidate.drainageLevel
                    && (candidateDistance < (candidate.distanceToTerminal as number)
                        || candidateDistance === candidate.distanceToTerminal
                            && entry.nodeIndex < (priorParent as number));
            if (!better) continue;
            candidate.drainageLevel = candidateLevel;
            candidate.distanceToTerminal = candidateDistance;
            candidate.downstreamIndex = entry.nodeIndex;
            candidate.terminalIndex = node.terminalIndex;
            candidate.drainageRank = (node.drainageRank as number) + 1;
            queue.push({ nodeIndex: candidateIndex, drainageLevel: candidateLevel, distance: candidateDistance });
        }
    }
}

function freezeGraph(
    graphId: string,
    dimensions: ReturnType<typeof dimensionsFor>,
    nodes: MutableNode[]
): MacroDrainageGraph {
    const includedIndices = nodes.map((_, index) => index).filter(index => nodes[index].included);
    const terminals: MacroDrainageTerminal[] = [];
    const terminalByIndex = new Map<number, MacroDrainageTerminal>();
    for (const index of includedIndices) {
        const node = nodes[index];
        if (node.downstreamIndex !== undefined) continue;
        const kind = node.macroHeight < HYDROLOGY_SEA_LEVEL ? "ocean" : "lake";
        const terminal = Object.freeze({
            nodeId: node.nodeId,
            bodyId: kind === "ocean"
                ? OCEAN_BODY_ID
                : createStableHydrologyId("lake", [graphId, node.nodeId]),
            kind,
            level: kind === "ocean" ? HYDROLOGY_SEA_LEVEL : node.macroHeight
        } as const);
        terminalByIndex.set(index, terminal);
        terminals.push(terminal);
    }

    const byRankDescending = [...includedIndices].sort((first, second) =>
        (nodes[second].drainageRank as number) - (nodes[first].drainageRank as number) || first - second);
    for (const index of byRankDescending) {
        const node = nodes[index];
        if (node.downstreamIndex !== undefined) {
            nodes[node.downstreamIndex].accumulatedFlow += node.accumulatedFlow;
        }
    }

    const frozenNodeByIndex = new Map<number, MacroDrainageNode>();
    const frozenNodes: MacroDrainageNode[] = includedIndices.map(index => {
        const node = nodes[index];
        const terminal = terminalByIndex.get(node.terminalIndex as number);
        if (!terminal) throw new Error("macro drainage node resolved an unknown terminal");
        const frozen = Object.freeze({
            nodeId: node.nodeId,
            x: node.x,
            y: node.y,
            macroHeight: node.macroHeight,
            drainageLevel: node.drainageLevel as number,
            downstreamNodeId: node.downstreamIndex === undefined
                ? undefined : nodes[node.downstreamIndex].nodeId,
            terminalBodyId: terminal.bodyId,
            drainageRank: node.drainageRank as number,
            dischargeClass: Math.min(
                HYDROLOGY_MAX_DISCHARGE_CLASS,
                Math.floor(Math.log2(node.accumulatedFlow))
            ),
            accumulatedFlow: node.accumulatedFlow
        });
        frozenNodeByIndex.set(index, frozen);
        return frozen;
    });
    const edges: MacroDrainageEdge[] = [];
    for (const index of includedIndices) {
        const upstream = frozenNodeByIndex.get(index) as MacroDrainageNode;
        const downstreamIndex = nodes[index].downstreamIndex;
        if (downstreamIndex === undefined) continue;
        const downstream = frozenNodeByIndex.get(downstreamIndex);
        if (!downstream) throw new Error("macro drainage edge resolved an excluded downstream node");
        const terminalIndex = nodes[index].terminalIndex as number;
        edges.push(Object.freeze({
            edgeId: createStableHydrologyId("drainage-edge", [graphId, upstream.nodeId, downstream.nodeId]),
            riverId: createStableHydrologyId("river", [graphId, nodes[terminalIndex].nodeId]),
            upstreamNodeId: upstream.nodeId,
            downstreamNodeId: downstream.nodeId,
            terminalBodyId: upstream.terminalBodyId,
            dischargeClass: upstream.dischargeClass
        }));
    }

    const graph: MacroDrainageGraph = Object.freeze({
        graphId,
        topology: dimensions.topology,
        originX: dimensions.originX,
        originY: dimensions.originY,
        width: dimensions.width,
        height: dimensions.height,
        wrapX: dimensions.wrapX,
        wrapY: dimensions.wrapY,
        nodes: Object.freeze(frozenNodes),
        edges: Object.freeze(edges),
        terminals: Object.freeze(terminals.sort((first, second) => first.nodeId.localeCompare(second.nodeId)))
    });
    assertMacroDrainageGraph(graph);
    return graph;
}

export function buildMacroDrainageGraph(options: BuildMacroDrainageGraphOptions): MacroDrainageGraph {
    if (!options || typeof options !== "object") throw new TypeError("macro drainage graph options are required");
    assertWorldDescriptorV2(options.descriptor);
    const dimensions = dimensionsFor(options);
    const columns = Math.ceil(dimensions.width / HYDROLOGY_MACRO_CELL_SIZE);
    const rows = Math.ceil(dimensions.height / HYDROLOGY_MACRO_CELL_SIZE);
    const nodeCount = columns * rows;
    if (!Number.isSafeInteger(nodeCount) || nodeCount <= 0 || nodeCount > HYDROLOGY_MAX_MACRO_NODES) {
        throw new RangeError(
            `macro drainage graph requires ${nodeCount} nodes; format limit is ${HYDROLOGY_MAX_MACRO_NODES}`
        );
    }
    const graphId = createStableHydrologyId("drainage-graph", dimensions.graphParts);
    const source = resolveHeightSource(options);
    const nodes: MutableNode[] = [];
    for (let gridX = 0; gridX < columns; gridX += 1) {
        for (let gridY = 0; gridY < rows; gridY += 1) {
            const x = nodeCoordinate(dimensions.originX, dimensions.width, gridX);
            const y = nodeCoordinate(dimensions.originY, dimensions.height, gridY);
            if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
            const macroHeight = source.sampleMacroHeight(x, y);
            assertMacroHeight(macroHeight);
            nodes.push({
                nodeId: createStableHydrologyId("drainage-node", [graphId, gridX, gridY]),
                x,
                y,
                macroHeight,
                gridX,
                gridY,
                accumulatedFlow: 1
            });
        }
    }
    if (nodes.length !== nodeCount) {
        // Only the extreme safe-integer basins can contain invalid macro cells.
        // Reindexing their sparse grid would make neighbor arithmetic ambiguous,
        // so those edge basins fail deterministically until a dedicated terminal
        // partial-basin format is introduced.
        throw new RangeError("hydrology macro nodes cannot be represented at this safe-integer boundary");
    }
    assignDrainage(nodes, columns, rows, dimensions.wrapX, dimensions.wrapY);
    return freezeGraph(graphId, dimensions, nodes);
}

export function assertMacroDrainageGraph(value: unknown): asserts value is MacroDrainageGraph {
    if (!value || typeof value !== "object") throw new TypeError("macro drainage graph must be an object");
    const graph = value as MacroDrainageGraph;
    const allowed = new Set([
        "graphId", "topology", "originX", "originY", "width", "height", "wrapX", "wrapY",
        "nodes", "edges", "terminals"
    ]);
    if (Object.getOwnPropertyNames(graph).some(name => !allowed.has(name))) {
        throw new TypeError("macro drainage graph contains unknown fields");
    }
    if (typeof graph.graphId !== "string" || !["infinite-basin", "bounded", "toroidal"].includes(graph.topology)
        || !Number.isInteger(graph.originX) || !Number.isInteger(graph.originY)
        || !Number.isSafeInteger(graph.width) || graph.width <= 0
        || !Number.isSafeInteger(graph.height) || graph.height <= 0
        || graph.originX > Number.MAX_SAFE_INTEGER
        || graph.originX + graph.width - 1 < Number.MIN_SAFE_INTEGER
        || graph.originY > Number.MAX_SAFE_INTEGER
        || graph.originY + graph.height - 1 < Number.MIN_SAFE_INTEGER
        || typeof graph.wrapX !== "boolean" || typeof graph.wrapY !== "boolean"
        || !Array.isArray(graph.nodes) || graph.nodes.length === 0 || graph.nodes.length > HYDROLOGY_MAX_MACRO_NODES
        || !Array.isArray(graph.edges) || !Array.isArray(graph.terminals)) {
        throw new TypeError("macro drainage graph header is invalid");
    }
    const nodes = new Map<string, MacroDrainageNode>();
    for (const node of graph.nodes) {
        if (!node || typeof node.nodeId !== "string" || nodes.has(node.nodeId)
            || !Number.isSafeInteger(node.x) || !Number.isSafeInteger(node.y)
            || !Number.isInteger(node.macroHeight) || node.macroHeight < 0 || node.macroHeight > 65535
            || !Number.isInteger(node.drainageLevel) || node.drainageLevel < 0 || node.drainageLevel > 65535
            || !Number.isInteger(node.drainageRank) || node.drainageRank < 0
            || !Number.isInteger(node.dischargeClass) || node.dischargeClass < 0
            || node.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS
            || !Number.isSafeInteger(node.accumulatedFlow) || node.accumulatedFlow <= 0
            || typeof node.terminalBodyId !== "string") {
            throw new TypeError("macro drainage graph contains an invalid or duplicate node");
        }
        nodes.set(node.nodeId, node);
    }
    const terminalNodes = new Set<string>();
    const bodyKinds = new Map<string, MacroDrainageTerminal["kind"]>();
    for (const terminal of graph.terminals) {
        const node = nodes.get(terminal?.nodeId);
        if (!node || node.downstreamNodeId !== undefined || terminalNodes.has(terminal.nodeId)
            || (terminal.kind !== "ocean" && terminal.kind !== "lake")
            || typeof terminal.bodyId !== "string" || terminal.bodyId !== node.terminalBodyId
            || !Number.isInteger(terminal.level) || terminal.level < 0 || terminal.level > 65535
            || (terminal.kind === "ocean" && terminal.bodyId !== OCEAN_BODY_ID)
            || (terminal.kind === "lake" && terminal.bodyId === OCEAN_BODY_ID)) {
            throw new TypeError("macro drainage graph contains an invalid terminal");
        }
        const priorKind = bodyKinds.get(terminal.bodyId);
        if (priorKind && priorKind !== terminal.kind) {
            throw new TypeError("macro drainage graph reuses a body ID for different kinds");
        }
        bodyKinds.set(terminal.bodyId, terminal.kind);
        terminalNodes.add(terminal.nodeId);
    }
    if (terminalNodes.size === 0) throw new TypeError("macro drainage graph must contain a terminal");

    for (const node of graph.nodes) {
        if (node.downstreamNodeId === undefined) {
            if (node.drainageRank !== 0 || !terminalNodes.has(node.nodeId)) {
                throw new TypeError("macro drainage terminal node is not declared or has nonzero rank");
            }
            continue;
        }
        const downstream = nodes.get(node.downstreamNodeId);
        if (!downstream || downstream.drainageRank >= node.drainageRank
            || downstream.drainageLevel > node.drainageLevel
            || downstream.terminalBodyId !== node.terminalBodyId
            || downstream.dischargeClass < node.dischargeClass) {
            throw new TypeError("macro drainage downstream edge violates rank, terminal, or discharge invariants");
        }
    }
    const edgeIds = new Set<string>();
    for (const edge of graph.edges) {
        const upstream = nodes.get(edge?.upstreamNodeId);
        const downstream = nodes.get(edge?.downstreamNodeId);
        if (!upstream || !downstream || upstream.downstreamNodeId !== downstream.nodeId
            || typeof edge.edgeId !== "string" || edgeIds.has(edge.edgeId)
            || typeof edge.riverId !== "string" || edge.terminalBodyId !== upstream.terminalBodyId
            || edge.dischargeClass !== upstream.dischargeClass) {
            throw new TypeError("macro drainage graph contains an invalid or duplicate edge");
        }
        edgeIds.add(edge.edgeId);
    }
    if (graph.edges.length !== graph.nodes.length - graph.terminals.length) {
        throw new TypeError("macro drainage graph does not serialize every downstream relation exactly once");
    }
}

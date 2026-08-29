import { HydrologyRegion, HydrologyRegionKey } from "./HydrologyRegion";
import {
    HydrologyRegionAssembler,
    canonicalIntegerHydrologyPoint
} from "./HydrologyRegionAssembler";
import {
    MACRO_DRAINAGE_NODE_STEP_TILES,
    MacroDrainageGraph,
    assertMacroDrainageGraph,
    macroDrainageNodeId,
    macroDrainageNodeTile,
    macroDrainageTerminalBodyId
} from "./MacroDrainageGraph";
import {
    MACRO_DRAINAGE_TERMINAL,
    deriveMacroDrainageTerminalWaterLevels,
    macroDrainageIndex
} from "./MacroDrainageTree";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

export const MIN_RIVER_DISCHARGE = 8;
export const MIN_LAKE_RADIUS_TILES = 4;
export const MAX_LAKE_RADIUS_TILES = 16;

const MACRO_NODE_CENTER_OFFSET = MACRO_DRAINAGE_NODE_STEP_TILES / 2;

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function wrappedNodeStep(from: number, to: number, count: number): number {
    let step = to - from;
    if (step > 1) step -= count;
    else if (step < -1) step += count;
    if (step < -1 || step > 1) throw new Error("toroidal drainage edge is not a neighboring node step");
    return step;
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

export class MacroDrainageHydrologySource {
    public readonly graph: MacroDrainageGraph;
    public readonly regionCountX: number;
    public readonly regionCountY: number;
    private readonly terminalWaterLevel: Uint16Array;

    constructor(graph: MacroDrainageGraph) {
        assertMacroDrainageGraph(graph);
        this.graph = graph;
        this.regionCountX = Math.ceil(graph.worldWidth / HYDROLOGY_REGION_SIZE);
        this.regionCountY = Math.ceil(graph.worldHeight / HYDROLOGY_REGION_SIZE);
        this.terminalWaterLevel = deriveMacroDrainageTerminalWaterLevels(graph, graph);
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
        const toroidal = this.graph.topology === "toroidal";
        const assembler = new HydrologyRegionAssembler({
            worldIdentity: this.graph.worldIdentity,
            topology: this.graph.topology,
            key,
            validWidth,
            validHeight,
            canonicalizePort: (tileX, tileY) => {
                const canonical = canonicalIntegerHydrologyPoint(tileX, tileY);
                return toroidal ? Object.freeze({
                    tileX: positiveModulo(canonical.tileX, this.graph.worldWidth),
                    tileY: positiveModulo(canonical.tileY, this.graph.worldHeight)
                }) : canonical;
            }
        });
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
                    && this.graph.ocean[sourceIndex] !== 0) assembler.addOceanReference();

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
                const parentTerminal = this.graph.downstream[parentIndex] === MACRO_DRAINAGE_TERMINAL;
                assembler.addDrainageEdge({
                    sourceNodeId: macroDrainageNodeId(this.graph, sourceIndex),
                    parentNodeId: macroDrainageNodeId(this.graph, parentIndex),
                    terminalNodeId: macroDrainageNodeId(this.graph, this.graph.terminalNode[sourceIndex]),
                    sourceX: physicalSourceX,
                    sourceY: physicalSourceY,
                    parentX: physicalParentX,
                    parentY: physicalParentY,
                    sourceLevel: this.graph.spillLevel[sourceIndex],
                    parentLevel: parentTerminal
                        ? this.terminalWaterLevel[parentIndex] : this.graph.spillLevel[parentIndex],
                    dischargeClass: this.graph.dischargeClass[sourceIndex],
                    ...(parentTerminal ? {
                        parentTerminal: {
                            bodyId: macroDrainageTerminalBodyId(this.graph, sourceIndex),
                            kind: this.graph.ocean[parentIndex] !== 0 ? "ocean" as const : "lake" as const
                        }
                    } : {})
                });
            }
        }
        this.addLakeSlices(assembler);
        return assembler.finish();
    }

    private addLakeSlices(assembler: HydrologyRegionAssembler): void {
        if (this.graph.terminalKind !== "lake") return;
        const toroidal = this.graph.topology === "toroidal";
        for (const terminal of this.graph.terminalIndices) {
            const center = macroDrainageNodeTile(this.graph, terminal);
            const radiusTiles = Math.min(
                MAX_LAKE_RADIUS_TILES,
                MIN_LAKE_RADIUS_TILES + this.graph.dischargeClass[terminal]
            );
            const shiftsX = toroidal ? [-this.graph.worldWidth, 0, this.graph.worldWidth] : [0];
            const shiftsY = toroidal ? [-this.graph.worldHeight, 0, this.graph.worldHeight] : [0];
            for (const shiftX of shiftsX) {
                for (const shiftY of shiftsY) {
                    assembler.addLakeSlice({
                        bodyId: macroDrainageTerminalBodyId(this.graph, terminal),
                        centerX: center.x + shiftX,
                        centerY: center.y + shiftY,
                        radiusTiles,
                        level: this.terminalWaterLevel[terminal]
                    });
                }
            }
        }
    }

}

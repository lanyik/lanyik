export const MACRO_DRAINAGE_TERMINAL = -1;
export const MACRO_DRAINAGE_INVALID = -2;
export const MACRO_DRAINAGE_INVALID_RANK = 0xffff_ffff;

const UNREACHED_SPILL_HEIGHT = 0x1_0000;
const MAX_NODE_COUNT = 0x7fff_ffff;

// Canonical eight-neighbor order for the low-resolution drainage raster. This
// raster is a hydrology graph domain, not the authoritative logical hex grid.
const NEIGHBOR_X = [-1, -1, -1, 0, 0, 1, 1, 1] as const;
const NEIGHBOR_Y = [-1, 0, 1, -1, 1, -1, 0, 1] as const;

export interface MacroDrainageRaster {
    readonly width: number;
    readonly height: number;
    readonly valid: Uint8Array;
    readonly groundHeight: Uint16Array;
    readonly ocean: Uint8Array;
    readonly seaLevel: number;
}

export interface MacroDrainageTree {
    readonly width: number;
    readonly height: number;
    readonly terminalKind: "ocean" | "lake";
    readonly terminalIndices: Uint32Array;
    readonly downstream: Int32Array;
    readonly drainageRank: Uint32Array;
    readonly spillLevel: Uint16Array;
    readonly discharge: Uint32Array;
    readonly validNodeCount: number;
    readonly maxDrainageRank: number;
}

class DrainageMinHeap {
    private readonly indices: number[] = [];
    private readonly priorities: number[] = [];

    public get size(): number { return this.indices.length; }

    public push(index: number, priority: number): void {
        let cursor = this.indices.length;
        this.indices.push(index);
        this.priorities.push(priority);
        while (cursor > 0) {
            const parent = Math.floor((cursor - 1) / 2);
            if (!this.less(priority, index, this.priorities[parent], this.indices[parent])) break;
            this.indices[cursor] = this.indices[parent];
            this.priorities[cursor] = this.priorities[parent];
            cursor = parent;
        }
        this.indices[cursor] = index;
        this.priorities[cursor] = priority;
    }

    public pop(): readonly [index: number, priority: number] | undefined {
        const length = this.indices.length;
        if (length === 0) return undefined;
        const rootIndex = this.indices[0];
        const rootPriority = this.priorities[0];
        const lastIndex = this.indices.pop() as number;
        const lastPriority = this.priorities.pop() as number;
        if (length > 1) {
            let cursor = 0;
            const remaining = length - 1;
            while (true) {
                const left = cursor * 2 + 1;
                if (left >= remaining) break;
                const right = left + 1;
                let child = left;
                if (right < remaining && this.less(
                    this.priorities[right],
                    this.indices[right],
                    this.priorities[left],
                    this.indices[left]
                )) child = right;
                if (!this.less(
                    this.priorities[child],
                    this.indices[child],
                    lastPriority,
                    lastIndex
                )) break;
                this.indices[cursor] = this.indices[child];
                this.priorities[cursor] = this.priorities[child];
                cursor = child;
            }
            this.indices[cursor] = lastIndex;
            this.priorities[cursor] = lastPriority;
        }
        return [rootIndex, rootPriority];
    }

    private less(firstPriority: number, firstIndex: number, secondPriority: number, secondIndex: number): boolean {
        return firstPriority < secondPriority
            || (firstPriority === secondPriority && firstIndex < secondIndex);
    }
}

export function macroDrainageIndex(x: number, y: number, height: number): number {
    return x * height + y;
}

function assertRaster(
    raster: Readonly<MacroDrainageRaster>,
    topology: "bounded" | "toroidal"
): number {
    if (!Number.isInteger(raster.width) || raster.width <= 0
        || !Number.isInteger(raster.height) || raster.height <= 0) {
        throw new RangeError("macro drainage raster dimensions must be positive integers");
    }
    const length = raster.width * raster.height;
    if (!Number.isSafeInteger(length) || length > MAX_NODE_COUNT) {
        throw new RangeError("macro drainage raster exceeds the supported node count");
    }
    if (!(raster.valid instanceof Uint8Array) || raster.valid.length !== length
        || !(raster.groundHeight instanceof Uint16Array) || raster.groundHeight.length !== length
        || !(raster.ocean instanceof Uint8Array) || raster.ocean.length !== length) {
        throw new TypeError("macro drainage raster arrays do not match its dimensions");
    }
    if (!Number.isInteger(raster.seaLevel) || raster.seaLevel < 0 || raster.seaLevel > 0xffff) {
        throw new RangeError("macro drainage sea level must be a uint16 value");
    }
    let validCount = 0;
    for (let index = 0; index < length; index += 1) {
        if (raster.valid[index] > 1 || raster.ocean[index] > 1) {
            throw new TypeError("macro drainage masks must contain only zero or one");
        }
        if (raster.valid[index] === 0 && raster.ocean[index] !== 0) {
            throw new TypeError("macro drainage ocean nodes must be valid");
        }
        if (raster.ocean[index] !== 0 && raster.groundHeight[index] > raster.seaLevel) {
            throw new RangeError("macro drainage ocean ground cannot exceed sea level");
        }
        if (raster.valid[index] !== 0) validCount += 1;
    }
    if (validCount === 0) throw new RangeError("macro drainage raster must contain a valid node");
    assertConnected(raster, validCount, topology);
    return validCount;
}

function forEachNeighbor(
    index: number,
    width: number,
    height: number,
    topology: "bounded" | "toroidal",
    visit: (neighbor: number) => void
): void {
    const x = Math.floor(index / height);
    const y = index - x * height;
    for (let direction = 0; direction < NEIGHBOR_X.length; direction += 1) {
        let neighborX = x + NEIGHBOR_X[direction];
        let neighborY = y + NEIGHBOR_Y[direction];
        if (topology === "toroidal") {
            neighborX = (neighborX + width) % width;
            neighborY = (neighborY + height) % height;
        } else if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
            continue;
        }
        visit(macroDrainageIndex(neighborX, neighborY, height));
    }
}

function areNeighbors(
    first: number,
    second: number,
    width: number,
    height: number,
    topology: "bounded" | "toroidal"
): boolean {
    const firstX = Math.floor(first / height);
    const firstY = first - firstX * height;
    const secondX = Math.floor(second / height);
    const secondY = second - secondX * height;
    let distanceX = Math.abs(firstX - secondX);
    let distanceY = Math.abs(firstY - secondY);
    if (topology === "toroidal") {
        distanceX = Math.min(distanceX, width - distanceX);
        distanceY = Math.min(distanceY, height - distanceY);
    }
    return distanceX <= 1 && distanceY <= 1 && (distanceX !== 0 || distanceY !== 0);
}

function assertConnected(
    raster: Readonly<MacroDrainageRaster>,
    validCount: number,
    topology: "bounded" | "toroidal"
): void {
    const first = raster.valid.findIndex(value => value !== 0);
    const visited = new Uint8Array(raster.valid.length);
    const queue = new Int32Array(validCount);
    let read = 0;
    let written = 1;
    queue[0] = first;
    visited[first] = 1;
    while (read < written) {
        const index = queue[read++];
        forEachNeighbor(index, raster.width, raster.height, topology, neighbor => {
            if (raster.valid[neighbor] === 0 || visited[neighbor] !== 0) return;
            visited[neighbor] = 1;
            queue[written++] = neighbor;
        });
    }
    if (written !== validCount) {
        throw new Error("macro drainage basin mask must be connected");
    }
}

function betterParent(
    candidate: number,
    current: number,
    spillLevel: Uint16Array,
    drainageRank: Uint32Array
): boolean {
    if (current < 0) return true;
    return spillLevel[candidate] < spillLevel[current]
        || (spillLevel[candidate] === spillLevel[current]
            && (drainageRank[candidate] < drainageRank[current]
                || (drainageRank[candidate] === drainageRank[current] && candidate < current)));
}

function buildMacroDrainageTreeForTopology(
    raster: Readonly<MacroDrainageRaster>,
    topology: "bounded" | "toroidal"
): MacroDrainageTree {
    const validNodeCount = assertRaster(raster, topology);
    const length = raster.valid.length;
    const downstream = new Int32Array(length);
    downstream.fill(MACRO_DRAINAGE_INVALID);
    const drainageRank = new Uint32Array(length);
    drainageRank.fill(MACRO_DRAINAGE_INVALID_RANK);
    const spillLevel = new Uint16Array(length);
    const discharge = new Uint32Array(length);
    const bestSpill = new Uint32Array(length);
    bestSpill.fill(UNREACHED_SPILL_HEIGHT);
    const settled = new Uint8Array(length);
    const terminalIndices: number[] = [];

    for (let index = 0; index < length; index += 1) {
        if (raster.valid[index] !== 0) discharge[index] = 1;
        if (raster.ocean[index] === 0) continue;
        terminalIndices.push(index);
    }
    const terminalKind = terminalIndices.length > 0 ? "ocean" as const : "lake" as const;
    if (terminalIndices.length === 0) {
        let terminal = -1;
        for (let index = 0; index < length; index += 1) {
            if (raster.valid[index] === 0) continue;
            if (terminal < 0 || raster.groundHeight[index] < raster.groundHeight[terminal]) terminal = index;
        }
        terminalIndices.push(terminal);
    }

    for (const terminal of terminalIndices) {
        settled[terminal] = 1;
        downstream[terminal] = MACRO_DRAINAGE_TERMINAL;
        drainageRank[terminal] = 0;
        const level = terminalKind === "ocean" ? raster.seaLevel : raster.groundHeight[terminal];
        spillLevel[terminal] = level;
        bestSpill[terminal] = level;
    }

    const heap = new DrainageMinHeap();
    const relaxFrom = (parent: number) => {
        forEachNeighbor(parent, raster.width, raster.height, topology, neighbor => {
            if (raster.valid[neighbor] === 0 || settled[neighbor] !== 0) return;
            const candidateSpill = Math.max(raster.groundHeight[neighbor], spillLevel[parent]);
            if (candidateSpill < bestSpill[neighbor]) {
                bestSpill[neighbor] = candidateSpill;
                downstream[neighbor] = parent;
                heap.push(neighbor, candidateSpill);
            } else if (candidateSpill === bestSpill[neighbor]
                && betterParent(parent, downstream[neighbor], spillLevel, drainageRank)) {
                downstream[neighbor] = parent;
            }
        });
    };
    for (const terminal of terminalIndices) relaxFrom(terminal);

    const settlementOrder: number[] = [];
    while (heap.size > 0) {
        const entry = heap.pop() as readonly [number, number];
        const [index, priority] = entry;
        if (settled[index] !== 0 || bestSpill[index] !== priority) continue;
        const parent = downstream[index];
        if (parent < 0 || settled[parent] === 0) {
            throw new Error("macro drainage priority queue selected an unsettled parent");
        }
        settled[index] = 1;
        spillLevel[index] = priority;
        drainageRank[index] = settlementOrder.length + 1;
        settlementOrder.push(index);
        relaxFrom(index);
    }
    if (settlementOrder.length + terminalIndices.length !== validNodeCount) {
        throw new Error("macro drainage tree did not reach every valid node");
    }

    for (let order = settlementOrder.length - 1; order >= 0; order -= 1) {
        const index = settlementOrder[order];
        const parent = downstream[index];
        discharge[parent] = Math.min(0xffff_ffff, discharge[parent] + discharge[index]);
    }

    const tree: MacroDrainageTree = Object.freeze({
        width: raster.width,
        height: raster.height,
        terminalKind,
        terminalIndices: Uint32Array.from(terminalIndices),
        downstream,
        drainageRank,
        spillLevel,
        discharge,
        validNodeCount,
        maxDrainageRank: settlementOrder.length
    });
    assertMacroDrainageTree(tree, raster.valid, topology);
    return tree;
}

export function buildMacroDrainageTree(raster: Readonly<MacroDrainageRaster>): MacroDrainageTree {
    return buildMacroDrainageTreeForTopology(raster, "bounded");
}

export function buildToroidalMacroDrainageTree(raster: Readonly<MacroDrainageRaster>): MacroDrainageTree {
    if (raster.width < 3 || raster.height < 3) {
        throw new RangeError("toroidal macro drainage raster dimensions must each be at least three");
    }
    return buildMacroDrainageTreeForTopology(raster, "toroidal");
}

export function assertMacroDrainageTree(
    tree: Readonly<MacroDrainageTree>,
    valid: Uint8Array,
    topology: "bounded" | "toroidal" = "bounded"
): void {
    if (!tree || typeof tree !== "object"
        || !Number.isInteger(tree.width) || tree.width <= 0
        || !Number.isInteger(tree.height) || tree.height <= 0
        || (tree.terminalKind !== "ocean" && tree.terminalKind !== "lake")
        || (topology !== "bounded" && topology !== "toroidal")) {
        throw new TypeError("macro drainage tree shape or topology is invalid");
    }
    const length = tree.width * tree.height;
    if (!(valid instanceof Uint8Array) || valid.length !== length
        || !(tree.terminalIndices instanceof Uint32Array)
        || !(tree.downstream instanceof Int32Array) || tree.downstream.length !== length
        || !(tree.drainageRank instanceof Uint32Array) || tree.drainageRank.length !== length
        || !(tree.spillLevel instanceof Uint16Array) || tree.spillLevel.length !== length
        || !(tree.discharge instanceof Uint32Array) || tree.discharge.length !== length) {
        throw new TypeError("macro drainage tree arrays do not match its dimensions");
    }
    if (!Number.isSafeInteger(tree.validNodeCount) || tree.validNodeCount <= 0 || tree.validNodeCount > length
        || !Number.isSafeInteger(tree.maxDrainageRank)
        || tree.maxDrainageRank < 0 || tree.maxDrainageRank >= tree.validNodeCount
        || tree.terminalIndices.length !== tree.validNodeCount - tree.maxDrainageRank
        || tree.terminalIndices.length === 0) {
        throw new RangeError("macro drainage tree summary is outside its supported bounds");
    }
    const terminalMask = new Uint8Array(length);
    for (const terminal of tree.terminalIndices) {
        if (terminal >= length || valid[terminal] === 0 || terminalMask[terminal] !== 0) {
            throw new Error("macro drainage terminal list contains an invalid or duplicate node");
        }
        terminalMask[terminal] = 1;
    }
    const nodeAtRank = new Uint32Array(tree.maxDrainageRank + 1);
    const rankSeen = new Uint8Array(tree.maxDrainageRank + 1);
    let validCount = 0;
    let observedMaxRank = 0;
    for (let index = 0; index < length; index += 1) {
        if (valid[index] > 1) throw new TypeError("macro drainage valid mask must contain only zero or one");
        if (valid[index] === 0) {
            if (tree.downstream[index] !== MACRO_DRAINAGE_INVALID
                || tree.drainageRank[index] !== MACRO_DRAINAGE_INVALID_RANK
                || tree.discharge[index] !== 0 || terminalMask[index] !== 0) {
                throw new Error("macro drainage tree populated an invalid node");
            }
            continue;
        }
        validCount += 1;
        observedMaxRank = Math.max(observedMaxRank, tree.drainageRank[index]);
        const parent = tree.downstream[index];
        if (parent === MACRO_DRAINAGE_TERMINAL) {
            if (tree.drainageRank[index] !== 0 || terminalMask[index] === 0) {
                throw new Error("macro drainage terminal must be listed exactly once with rank zero");
            }
            continue;
        }
        const rank = tree.drainageRank[index];
        if (terminalMask[index] !== 0 || rank === 0 || rank > tree.maxDrainageRank || rankSeen[rank] !== 0) {
            throw new Error("macro drainage non-terminal ranks must form one canonical order");
        }
        rankSeen[rank] = 1;
        nodeAtRank[rank] = index;
        if (parent < 0 || parent >= length || valid[parent] === 0
            || !areNeighbors(index, parent, tree.width, tree.height, topology)) {
            throw new Error("macro drainage node has an invalid downstream parent");
        }
        if (tree.drainageRank[parent] >= tree.drainageRank[index]) {
            throw new Error("macro drainage rank must strictly decrease downstream");
        }
        if (tree.spillLevel[parent] > tree.spillLevel[index]) {
            throw new Error("macro drainage spill level cannot rise downstream");
        }
        if (tree.discharge[parent] < tree.discharge[index]) {
            throw new Error("macro drainage discharge cannot decrease at a merge");
        }
    }
    if (validCount !== tree.validNodeCount || observedMaxRank !== tree.maxDrainageRank) {
        throw new Error("macro drainage tree summary does not match its arrays");
    }
    const expectedDischarge = new Uint32Array(length);
    for (let index = 0; index < length; index += 1) {
        if (valid[index] !== 0) expectedDischarge[index] = 1;
    }
    for (let rank = tree.maxDrainageRank; rank > 0; rank -= 1) {
        if (rankSeen[rank] === 0) throw new Error("macro drainage rank order contains a gap");
        const index = nodeAtRank[rank];
        const parent = tree.downstream[index];
        expectedDischarge[parent] = Math.min(0xffff_ffff, expectedDischarge[parent] + expectedDischarge[index]);
    }
    for (let index = 0; index < length; index += 1) {
        if (tree.discharge[index] !== expectedDischarge[index]) {
            throw new Error("macro drainage discharge does not match the canonical accumulation");
        }
    }
}

import {
    AuthoredHydrologyFeature,
    HydrologyFeatureDelta,
    HydrologyFeatureUpsertDelta,
    assertHydrologyFeatureDelta
} from "./HydrologyFeatureDelta";
import {
    HYDROLOGY_POINT_QUANTIZATION,
    HydrologyRegion,
    assertHydrologyRegion
} from "./HydrologyRegion";
import { hydrologyRiverHalfWidthTiles } from "./HydrologyGeometry";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";
import {
    WorldDescriptorV2,
    assertWorldDescriptorV2,
    serializeWorldDescriptorV2
} from "./WorldDescriptorV2";

export const HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE = 8;
export const MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS = 16_384;

export interface HydrologyFeatureBoundsQ64 {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

interface SpatialItem {
    readonly bounds: HydrologyFeatureBoundsQ64;
    readonly deltaIndex: number;
}

interface SpatialNode extends HydrologyFeatureBoundsQ64 {
    readonly start: number;
    readonly count: number;
    readonly left: number;
    readonly right: number;
}

interface AxisInterval {
    readonly minimum: number;
    readonly maximum: number;
}

function assertBounds(bounds: Readonly<HydrologyFeatureBoundsQ64>): void {
    if (!bounds || typeof bounds !== "object"
        || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)
        || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)
        || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
        throw new RangeError("hydrology feature query bounds are invalid");
    }
}

function boundsForPoints(points: Float64Array, expansion: number): HydrologyFeatureBoundsQ64 {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < points.length; index += 2) {
        minX = Math.min(minX, points[index]);
        minY = Math.min(minY, points[index + 1]);
        maxX = Math.max(maxX, points[index]);
        maxY = Math.max(maxY, points[index + 1]);
    }
    return Object.freeze({
        minX: minX - expansion,
        minY: minY - expansion,
        maxX: maxX + expansion,
        maxY: maxY + expansion
    });
}

export function authoredHydrologyFeatureBoundsQ64(
    feature: Readonly<AuthoredHydrologyFeature>
): HydrologyFeatureBoundsQ64 {
    if (!feature || typeof feature !== "object") {
        throw new TypeError("authored hydrology feature is required for spatial bounds");
    }
    if (feature.kind === "lake") return boundsForPoints(feature.polygon, 0);
    let maximumHalfWidth = 0;
    for (const widthClass of feature.widthProfile) {
        maximumHalfWidth = Math.max(maximumHalfWidth, hydrologyRiverHalfWidthTiles(widthClass));
    }
    return boundsForPoints(
        feature.controlPoints,
        maximumHalfWidth * HYDROLOGY_POINT_QUANTIZATION
    );
}

export function hydrologyRegionBoundsQ64(
    region: Readonly<HydrologyRegion>
): HydrologyFeatureBoundsQ64 {
    assertHydrologyRegion(region);
    const origin = chunkOrigin(region.key.regionX, region.key.regionY, HYDROLOGY_REGION_SIZE);
    return Object.freeze({
        minX: origin.x * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2,
        minY: origin.y * HYDROLOGY_POINT_QUANTIZATION - HYDROLOGY_POINT_QUANTIZATION / 2,
        maxX: (origin.x + region.validBounds.maxXExclusive) * HYDROLOGY_POINT_QUANTIZATION
            - HYDROLOGY_POINT_QUANTIZATION / 2,
        maxY: (origin.y + region.validBounds.maxYExclusive) * HYDROLOGY_POINT_QUANTIZATION
            - HYDROLOGY_POINT_QUANTIZATION / 2
    });
}

function positiveModulo(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function periodicIntervals(minimum: number, maximum: number, period: number): readonly AxisInterval[] {
    const domainMinimum = -HYDROLOGY_POINT_QUANTIZATION / 2;
    const domainMaximum = domainMinimum + period;
    const span = maximum - minimum;
    if (span >= period) return Object.freeze([{ minimum: domainMinimum, maximum: domainMaximum }]);
    const start = domainMinimum + positiveModulo(minimum - domainMinimum, period);
    const end = start + span;
    return end <= domainMaximum
        ? Object.freeze([{ minimum: start, maximum: end }])
        : Object.freeze([
            { minimum: start, maximum: domainMaximum },
            { minimum: domainMinimum, maximum: domainMinimum + end - domainMaximum }
        ]);
}

function projectedBounds(
    descriptor: WorldDescriptorV2,
    bounds: Readonly<HydrologyFeatureBoundsQ64>
): readonly HydrologyFeatureBoundsQ64[] {
    if (descriptor.sourceKind !== "procedural-toroidal") return Object.freeze([bounds]);
    const periodX = descriptor.width * HYDROLOGY_POINT_QUANTIZATION;
    const periodY = descriptor.height * HYDROLOGY_POINT_QUANTIZATION;
    if (!Number.isSafeInteger(periodX) || !Number.isSafeInteger(periodY)) {
        throw new RangeError("toroidal hydrology q64 period exceeds the safe integer range");
    }
    const xIntervals = periodicIntervals(bounds.minX, bounds.maxX, periodX);
    const yIntervals = periodicIntervals(bounds.minY, bounds.maxY, periodY);
    const output: HydrologyFeatureBoundsQ64[] = [];
    for (const x of xIntervals) {
        for (const y of yIntervals) {
            output.push(Object.freeze({
                minX: x.minimum,
                minY: y.minimum,
                maxX: x.maximum,
                maxY: y.maximum
            }));
        }
    }
    return Object.freeze(output);
}

function unionBounds(items: readonly SpatialItem[], start: number, end: number): HydrologyFeatureBoundsQ64 {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = start; index < end; index += 1) {
        const bounds = items[index].bounds;
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
    }
    return { minX, minY, maxX, maxY };
}

function intersects(first: Readonly<HydrologyFeatureBoundsQ64>, second: Readonly<HydrologyFeatureBoundsQ64>): boolean {
    return first.minX <= second.maxX && first.maxX >= second.minX
        && first.minY <= second.maxY && first.maxY >= second.minY;
}

function compareItems(axis: "x" | "y", first: SpatialItem, second: SpatialItem): number {
    const firstCenter = axis === "x"
        ? first.bounds.minX + first.bounds.maxX : first.bounds.minY + first.bounds.maxY;
    const secondCenter = axis === "x"
        ? second.bounds.minX + second.bounds.maxX : second.bounds.minY + second.bounds.maxY;
    return firstCenter - secondCenter || first.deltaIndex - second.deltaIndex
        || first.bounds.minX - second.bounds.minX || first.bounds.minY - second.bounds.minY;
}

export class HydrologyFeatureSpatialIndex {
    public readonly worldIdentity: string;
    public readonly featureCount: number;
    public readonly itemCount: number;
    private readonly deltas: readonly HydrologyFeatureUpsertDelta[];
    private readonly items: SpatialItem[];
    private readonly nodes: SpatialNode[] = [];
    private readonly root: number;

    constructor(descriptor: WorldDescriptorV2, deltas: readonly HydrologyFeatureDelta[]) {
        assertWorldDescriptorV2(descriptor);
        if (!Array.isArray(deltas)) throw new TypeError("hydrology feature spatial index deltas must be an array");
        this.worldIdentity = serializeWorldDescriptorV2(descriptor);
        const upserts: HydrologyFeatureUpsertDelta[] = [];
        const items: SpatialItem[] = [];
        let previousId: string | undefined;
        for (const delta of deltas) {
            assertHydrologyFeatureDelta(delta);
            if (delta.worldIdentity !== this.worldIdentity) {
                throw new TypeError("hydrology feature spatial index delta belongs to another world");
            }
            if (previousId !== undefined && previousId >= delta.featureId) {
                throw new Error("hydrology feature spatial index deltas must use unique ascending feature identities");
            }
            previousId = delta.featureId;
            if (delta.operation === "delete") continue;
            const deltaIndex = upserts.length;
            upserts.push(delta);
            const bounds = authoredHydrologyFeatureBoundsQ64(delta.feature);
            for (const projected of projectedBounds(descriptor, bounds)) {
                items.push({ bounds: projected, deltaIndex });
            }
        }
        if (items.length > MAX_HYDROLOGY_FEATURE_SPATIAL_INDEX_ITEMS) {
            throw new RangeError("hydrology feature spatial index exceeds its fixed item budget");
        }
        this.deltas = Object.freeze(upserts);
        this.items = items;
        this.featureCount = upserts.length;
        this.itemCount = items.length;
        this.root = items.length === 0 ? -1 : this.buildNode(0, items.length);
    }

    public query(bounds: Readonly<HydrologyFeatureBoundsQ64>): readonly HydrologyFeatureUpsertDelta[] {
        assertBounds(bounds);
        if (this.root < 0) return Object.freeze([]);
        const stack = [this.root];
        const matches = new Set<number>();
        while (stack.length > 0) {
            const node = this.nodes[stack.pop() as number];
            if (!intersects(node, bounds)) continue;
            if (node.count > 0) {
                for (let index = node.start; index < node.start + node.count; index += 1) {
                    const item = this.items[index];
                    if (intersects(item.bounds, bounds)) matches.add(item.deltaIndex);
                }
            } else {
                stack.push(node.left, node.right);
            }
        }
        return Object.freeze([...matches]
            .sort((first, second) => first - second)
            .map(index => this.deltas[index]));
    }

    public queryRegion(region: Readonly<HydrologyRegion>): readonly HydrologyFeatureUpsertDelta[] {
        if (region.worldIdentity !== this.worldIdentity) {
            throw new TypeError("hydrology feature spatial query region belongs to another world");
        }
        return this.query(hydrologyRegionBoundsQ64(region));
    }

    private buildNode(start: number, end: number): number {
        const bounds = unionBounds(this.items, start, end);
        const nodeIndex = this.nodes.length;
        this.nodes.push({ ...bounds, start: 0, count: 0, left: -1, right: -1 });
        const count = end - start;
        if (count <= HYDROLOGY_FEATURE_SPATIAL_INDEX_LEAF_SIZE) {
            this.nodes[nodeIndex] = Object.freeze({ ...bounds, start, count, left: -1, right: -1 });
            return nodeIndex;
        }
        const axis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? "x" : "y";
        const sorted = this.items.slice(start, end).sort((first, second) => compareItems(axis, first, second));
        this.items.splice(start, count, ...sorted);
        const middle = start + Math.floor(count / 2);
        const left = this.buildNode(start, middle);
        const right = this.buildNode(middle, end);
        this.nodes[nodeIndex] = Object.freeze({ ...bounds, start: 0, count: 0, left, right });
        return nodeIndex;
    }
}

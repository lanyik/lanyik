import {
    assertHydrologyRegion,
    HydrologyRegion,
    LakeFeature,
    RiverFeatureSegment,
    RiverMouthFeature
} from "./HydrologyRegion";
import {
    HYDROLOGY_COORDINATE_SCALE,
    HydrologyRegionLocalBounds
} from "./WorldSemanticFormat";

export const HYDROLOGY_SPATIAL_BIN_SIZE = 16;

export type HydrologyIndexedFeature =
    | { readonly kind: "river"; readonly feature: RiverFeatureSegment }
    | { readonly kind: "lake"; readonly feature: LakeFeature }
    | { readonly kind: "mouth"; readonly feature: RiverMouthFeature };

export interface HydrologyQueryBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

interface FeatureBounds extends HydrologyQueryBounds {}

function riverBounds(feature: RiverFeatureSegment): FeatureBounds {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maximumWidth = 0;
    for (let index = 0; index < feature.controlPoints.length; index += 2) {
        minX = Math.min(minX, feature.controlPoints[index] / HYDROLOGY_COORDINATE_SCALE);
        minY = Math.min(minY, feature.controlPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE);
        maxX = Math.max(maxX, feature.controlPoints[index] / HYDROLOGY_COORDINATE_SCALE);
        maxY = Math.max(maxY, feature.controlPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE);
        maximumWidth = Math.max(maximumWidth, feature.widthProfile[index / 2] / HYDROLOGY_COORDINATE_SCALE);
    }
    const radius = maximumWidth / 2;
    return { minX: minX - radius, minY: minY - radius, maxXExclusive: maxX + radius, maxYExclusive: maxY + radius };
}

function lakeBounds(feature: LakeFeature): FeatureBounds {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < feature.boundaryPoints.length; index += 2) {
        minX = Math.min(minX, feature.boundaryPoints[index] / HYDROLOGY_COORDINATE_SCALE);
        minY = Math.min(minY, feature.boundaryPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE);
        maxX = Math.max(maxX, feature.boundaryPoints[index] / HYDROLOGY_COORDINATE_SCALE);
        maxY = Math.max(maxY, feature.boundaryPoints[index + 1] / HYDROLOGY_COORDINATE_SCALE);
    }
    return { minX, minY, maxXExclusive: maxX, maxYExclusive: maxY };
}

function mouthBounds(feature: RiverMouthFeature): FeatureBounds {
    const radius = feature.width / HYDROLOGY_COORDINATE_SCALE / 2;
    const x = feature.x / HYDROLOGY_COORDINATE_SCALE;
    const y = feature.y / HYDROLOGY_COORDINATE_SCALE;
    return { minX: x - radius, minY: y - radius, maxXExclusive: x + radius, maxYExclusive: y + radius };
}

function intersects(first: HydrologyQueryBounds, second: HydrologyQueryBounds): boolean {
    return first.minX < second.maxXExclusive && first.maxXExclusive > second.minX
        && first.minY < second.maxYExclusive && first.maxYExclusive > second.minY;
}

function assertQueryBounds(query: HydrologyQueryBounds, valid: HydrologyRegionLocalBounds): void {
    if (!query || !Number.isFinite(query.minX) || !Number.isFinite(query.minY)
        || !Number.isFinite(query.maxXExclusive) || !Number.isFinite(query.maxYExclusive)
        || query.minX >= query.maxXExclusive || query.minY >= query.maxYExclusive
        || query.minX < valid.minX || query.minY < valid.minY
        || query.maxXExclusive > valid.maxXExclusive || query.maxYExclusive > valid.maxYExclusive) {
        throw new RangeError("hydrology spatial query bounds must lie inside region validBounds");
    }
}

export class HydrologyRegionSpatialIndex {
    public readonly offsets: Uint32Array;
    public readonly entries: Uint16Array;
    public readonly byteLength: number;
    private readonly features: readonly HydrologyIndexedFeature[];
    private readonly featureBounds: readonly FeatureBounds[];
    private readonly binsX: number;
    private readonly binsY: number;

    constructor(public readonly region: HydrologyRegion) {
        assertHydrologyRegion(region);
        this.binsX = Math.ceil(region.validBounds.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE);
        this.binsY = Math.ceil(region.validBounds.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE);
        const features: HydrologyIndexedFeature[] = [
            ...region.rivers.map(feature => ({ kind: "river" as const, feature })),
            ...region.lakes.map(feature => ({ kind: "lake" as const, feature })),
            ...region.mouths.map(feature => ({ kind: "mouth" as const, feature }))
        ];
        if (features.length > 0xffff) {
            throw new RangeError("hydrology spatial index feature count exceeds Uint16 addressing");
        }
        const bounds = features.map(candidate => candidate.kind === "river"
            ? riverBounds(candidate.feature)
            : candidate.kind === "lake" ? lakeBounds(candidate.feature) : mouthBounds(candidate.feature));
        const bins: number[][] = Array.from({ length: this.binsX * this.binsY }, () => []);
        for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
            const featureBounds = bounds[featureIndex];
            const minBinX = Math.max(0, Math.floor(featureBounds.minX / HYDROLOGY_SPATIAL_BIN_SIZE));
            const minBinY = Math.max(0, Math.floor(featureBounds.minY / HYDROLOGY_SPATIAL_BIN_SIZE));
            const maxBinX = Math.min(this.binsX - 1, Math.floor(featureBounds.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
            const maxBinY = Math.min(this.binsY - 1, Math.floor(featureBounds.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
            for (let binX = minBinX; binX <= maxBinX; binX += 1) {
                for (let binY = minBinY; binY <= maxBinY; binY += 1) {
                    bins[binX * this.binsY + binY].push(featureIndex);
                }
            }
        }
        this.offsets = new Uint32Array(bins.length + 1);
        let entryCount = 0;
        for (let index = 0; index < bins.length; index += 1) {
            this.offsets[index] = entryCount;
            entryCount += bins[index].length;
        }
        this.offsets[bins.length] = entryCount;
        this.entries = new Uint16Array(entryCount);
        let cursor = 0;
        for (const bin of bins) for (const entry of bin) this.entries[cursor++] = entry;
        this.features = Object.freeze(features);
        this.featureBounds = Object.freeze(bounds);
        this.byteLength = this.offsets.byteLength + this.entries.byteLength;
    }

    public query(query: HydrologyQueryBounds): readonly HydrologyIndexedFeature[] {
        assertQueryBounds(query, this.region.validBounds);
        const minBinX = Math.floor(query.minX / HYDROLOGY_SPATIAL_BIN_SIZE);
        const minBinY = Math.floor(query.minY / HYDROLOGY_SPATIAL_BIN_SIZE);
        const maxBinX = Math.min(this.binsX - 1, Math.floor(query.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
        const maxBinY = Math.min(this.binsY - 1, Math.floor(query.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
        const matches = new Set<number>();
        for (let binX = minBinX; binX <= maxBinX; binX += 1) {
            for (let binY = minBinY; binY <= maxBinY; binY += 1) {
                const binIndex = binX * this.binsY + binY;
                for (let cursor = this.offsets[binIndex]; cursor < this.offsets[binIndex + 1]; cursor += 1) {
                    const featureIndex = this.entries[cursor];
                    if (intersects(query, this.featureBounds[featureIndex])) matches.add(featureIndex);
                }
            }
        }
        return Object.freeze([...matches].sort((first, second) => first - second).map(index => this.features[index]));
    }

    public queryTile(localX: number, localY: number, output: HydrologyIndexedFeature[]): void {
        if (!Number.isInteger(localX) || !Number.isInteger(localY)
            || localX < this.region.validBounds.minX || localX >= this.region.validBounds.maxXExclusive
            || localY < this.region.validBounds.minY || localY >= this.region.validBounds.maxYExclusive) {
            throw new RangeError("hydrology tile query must lie inside region validBounds");
        }
        if (!Array.isArray(output)) throw new TypeError("hydrology tile query output must be a reusable array");
        output.length = 0;
        const binX = Math.floor(localX / HYDROLOGY_SPATIAL_BIN_SIZE);
        const binY = Math.floor(localY / HYDROLOGY_SPATIAL_BIN_SIZE);
        const binIndex = binX * this.binsY + binY;
        const tileBounds = {
            minX: localX,
            minY: localY,
            maxXExclusive: localX + 1,
            maxYExclusive: localY + 1
        };
        for (let cursor = this.offsets[binIndex]; cursor < this.offsets[binIndex + 1]; cursor += 1) {
            const featureIndex = this.entries[cursor];
            if (intersects(tileBounds, this.featureBounds[featureIndex])) output.push(this.features[featureIndex]);
        }
    }
}

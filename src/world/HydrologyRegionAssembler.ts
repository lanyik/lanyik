import {
    HYDROLOGY_BOUNDARY_MAX_X,
    HYDROLOGY_BOUNDARY_MAX_Y,
    HYDROLOGY_BOUNDARY_MIN_X,
    HYDROLOGY_BOUNDARY_MIN_Y,
    HYDROLOGY_POINT_QUANTIZATION,
    HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE,
    HYDROLOGY_REGION_REVISION,
    HydrologyBodyKind,
    HydrologyBodyRef,
    HydrologyPort,
    HydrologyRegion,
    HydrologyRegionKey,
    HydrologyRegionTopology,
    LakeFeature,
    LAKE_HYDROLOGY_PROFILE,
    OCEAN_HYDROLOGY_PROFILE,
    RIVER_HYDROLOGY_PROFILE,
    RiverFeatureSegment,
    RiverMouthFeature,
    createHydrologyRegion,
    hydrologyRegionMaximumQuantizedCoordinate
} from "./HydrologyRegion";
import { HYDROLOGY_REGION_SIZE } from "./SurfaceCompileProfile";
import { chunkOrigin } from "./WorldGrid";

const CLIP_EPSILON = 1e-9;

interface ClippedLine {
    readonly startX: number;
    readonly startY: number;
    readonly endX: number;
    readonly endY: number;
    readonly startT: number;
    readonly endT: number;
}

export interface CanonicalHydrologyPoint {
    readonly tileX: number;
    readonly tileY: number;
}

export interface HydrologyTerminalBodyInput {
    readonly bodyId: string;
    readonly kind: Extract<HydrologyBodyKind, "ocean" | "lake">;
}

export interface HydrologyDrainageEdgeInput {
    readonly sourceNodeId: string;
    readonly parentNodeId: string;
    readonly terminalNodeId: string;
    readonly sourceX: number;
    readonly sourceY: number;
    readonly parentX: number;
    readonly parentY: number;
    readonly sourceLevel: number;
    readonly parentLevel: number;
    readonly dischargeClass: number;
    readonly parentTerminal?: HydrologyTerminalBodyInput;
}

export interface HydrologyLakeSliceInput {
    readonly bodyId: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly radiusTiles: number;
    readonly level: number;
}

export interface HydrologyRegionAssemblerOptions {
    readonly worldIdentity: string;
    readonly topology: HydrologyRegionTopology;
    readonly key: HydrologyRegionKey;
    readonly validWidth: number;
    readonly validHeight: number;
    readonly canonicalizePort: (tileX: number, tileY: number) => CanonicalHydrologyPoint;
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
    if (localX === HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE) mask |= HYDROLOGY_BOUNDARY_MIN_X;
    if (localX === maximumX) mask |= HYDROLOGY_BOUNDARY_MAX_X;
    if (localY === HYDROLOGY_REGION_MINIMUM_QUANTIZED_COORDINATE) mask |= HYDROLOGY_BOUNDARY_MIN_Y;
    if (localY === maximumY) mask |= HYDROLOGY_BOUNDARY_MAX_Y;
    if (mask === 0) throw new Error("clipped hydrology endpoint is not on a region boundary");
    return mask;
}

function widthClass(dischargeClass: number): number {
    return Math.min(0xff, dischargeClass + 1);
}

export class HydrologyRegionAssembler {
    private readonly options: Readonly<HydrologyRegionAssemblerOptions>;
    private readonly origin: Readonly<{ x: number; y: number }>;
    private readonly rivers: RiverFeatureSegment[] = [];
    private readonly ports: HydrologyPort[] = [];
    private readonly lakes: LakeFeature[] = [];
    private readonly mouths: RiverMouthFeature[] = [];
    private readonly bodies = new Map<string, HydrologyBodyRef>();
    private readonly segmentIds = new Set<string>();

    constructor(options: Readonly<HydrologyRegionAssemblerOptions>) {
        this.options = options;
        this.origin = chunkOrigin(options.key.regionX, options.key.regionY, HYDROLOGY_REGION_SIZE);
    }

    public addOceanReference(): void {
        this.addBody({ bodyId: "ocean", kind: "ocean", profileIndex: OCEAN_HYDROLOGY_PROFILE });
    }

    public addDrainageEdge(edge: Readonly<HydrologyDrainageEdgeInput>): boolean {
        const minimumX = this.origin.x - 0.5;
        const minimumY = this.origin.y - 0.5;
        const endX = this.origin.x + this.options.validWidth - 0.5;
        const endY = this.origin.y + this.options.validHeight - 0.5;
        const clipped = clipLineToRegion(
            edge.sourceX,
            edge.sourceY,
            edge.parentX,
            edge.parentY,
            minimumX,
            minimumY,
            endX,
            endY
        );
        if (!clipped) return false;
        const localStartX = quantizeLocal(clipped.startX, this.origin.x);
        const localStartY = quantizeLocal(clipped.startY, this.origin.y);
        const localEndX = quantizeLocal(clipped.endX, this.origin.x);
        const localEndY = quantizeLocal(clipped.endY, this.origin.y);
        const canonicalEdgeId = `edge:${edge.sourceNodeId}>${edge.parentNodeId}`;
        const segmentId = `segment:${canonicalEdgeId}@${this.options.key.regionX}:${this.options.key.regionY}`
            + `:${localStartX},${localStartY}>${localEndX},${localEndY}`;
        if (this.segmentIds.has(segmentId)) throw new Error("hydrology region produced a duplicate segment identity");
        this.segmentIds.add(segmentId);
        const riverId = `river:${edge.terminalNodeId}`;
        const edgeWidthClass = widthClass(edge.dischargeClass);
        const startLevel = interpolateUint16(edge.sourceLevel, edge.parentLevel, clipped.startT);
        const endLevel = interpolateUint16(edge.sourceLevel, edge.parentLevel, clipped.endT);
        const directionX = Math.sign(edge.parentX - edge.sourceX);
        const directionY = Math.sign(edge.parentY - edge.sourceY);
        let entry: RiverFeatureSegment["entry"] = { kind: "node", nodeId: edge.sourceNodeId };
        let exit: RiverFeatureSegment["exit"] = edge.parentTerminal
            ? { kind: "body", bodyId: edge.parentTerminal.bodyId }
            : { kind: "node", nodeId: edge.parentNodeId };
        if (clipped.startT > CLIP_EPSILON) {
            const canonical = this.options.canonicalizePort(clipped.startX, clipped.startY);
            const connectionId = `connection:${canonicalEdgeId}@${canonical.tileX}:${canonical.tileY}`;
            entry = { kind: "port", connectionId };
            this.ports.push({
                connectionId,
                riverId,
                segmentId,
                endpoint: "entry",
                boundaryMask: boundaryMask(
                    localStartX,
                    localStartY,
                    hydrologyRegionMaximumQuantizedCoordinate(this.options.validWidth),
                    hydrologyRegionMaximumQuantizedCoordinate(this.options.validHeight)
                ),
                point: new Int16Array([localStartX, localStartY]),
                canonicalTileX: canonical.tileX,
                canonicalTileY: canonical.tileY,
                flowDirection: new Int8Array([directionX, directionY]),
                widthClass: edgeWidthClass,
                level: startLevel,
                dischargeClass: edge.dischargeClass
            });
        }
        if (clipped.endT < 1 - CLIP_EPSILON) {
            const canonical = this.options.canonicalizePort(clipped.endX, clipped.endY);
            const connectionId = `connection:${canonicalEdgeId}@${canonical.tileX}:${canonical.tileY}`;
            exit = { kind: "port", connectionId };
            this.ports.push({
                connectionId,
                riverId,
                segmentId,
                endpoint: "exit",
                boundaryMask: boundaryMask(
                    localEndX,
                    localEndY,
                    hydrologyRegionMaximumQuantizedCoordinate(this.options.validWidth),
                    hydrologyRegionMaximumQuantizedCoordinate(this.options.validHeight)
                ),
                point: new Int16Array([localEndX, localEndY]),
                canonicalTileX: canonical.tileX,
                canonicalTileY: canonical.tileY,
                flowDirection: new Int8Array([directionX, directionY]),
                widthClass: edgeWidthClass,
                level: endLevel,
                dischargeClass: edge.dischargeClass
            });
        }
        this.rivers.push({
            riverId,
            segmentId,
            controlPoints: new Int16Array([localStartX, localStartY, localEndX, localEndY]),
            widthProfile: new Uint8Array([edgeWidthClass, edgeWidthClass]),
            levelProfile: new Uint16Array([startLevel, endLevel]),
            dischargeClass: edge.dischargeClass,
            entry,
            exit
        });
        this.addBody({ bodyId: riverId, kind: "river", profileIndex: RIVER_HYDROLOGY_PROFILE });
        if (exit.kind === "body") {
            if (!edge.parentTerminal || edge.parentTerminal.bodyId !== exit.bodyId) {
                throw new Error("terminal drainage edge lost its target body during clipping");
            }
            this.addBody({
                bodyId: exit.bodyId,
                kind: edge.parentTerminal.kind,
                profileIndex: edge.parentTerminal.kind === "ocean"
                    ? OCEAN_HYDROLOGY_PROFILE : LAKE_HYDROLOGY_PROFILE
            });
            this.mouths.push({
                mouthId: `mouth:${canonicalEdgeId}`,
                riverId,
                segmentId,
                targetBodyId: exit.bodyId,
                point: new Int16Array([localEndX, localEndY]),
                widthClass: edgeWidthClass,
                dischargeClass: edge.dischargeClass
            });
        }
        return true;
    }

    public addLakeSlice(lake: Readonly<HydrologyLakeSliceInput>): boolean {
        const minimumX = this.origin.x - 0.5;
        const minimumY = this.origin.y - 0.5;
        const endX = this.origin.x + this.options.validWidth - 0.5;
        const endY = this.origin.y + this.options.validHeight - 0.5;
        if (lake.centerX + lake.radiusTiles < minimumX
            || lake.centerX - lake.radiusTiles > endX
            || lake.centerY + lake.radiusTiles < minimumY
            || lake.centerY - lake.radiusTiles > endY) return false;
        const localCenterX = quantizeLocal(lake.centerX, this.origin.x);
        const localCenterY = quantizeLocal(lake.centerY, this.origin.y);
        const radius = lake.radiusTiles * HYDROLOGY_POINT_QUANTIZATION;
        this.lakes.push({
            featureId: `lake-slice:${lake.bodyId}@${this.options.key.regionX}:${this.options.key.regionY}`
                + `:${localCenterX},${localCenterY}`,
            bodyId: lake.bodyId,
            center: new Int16Array([localCenterX, localCenterY]),
            radius,
            level: lake.level,
            profileIndex: LAKE_HYDROLOGY_PROFILE
        });
        this.addBody({ bodyId: lake.bodyId, kind: "lake", profileIndex: LAKE_HYDROLOGY_PROFILE });
        return true;
    }

    public finish(): HydrologyRegion {
        return createHydrologyRegion({
            worldIdentity: this.options.worldIdentity,
            topology: this.options.topology,
            key: this.options.key,
            revision: HYDROLOGY_REGION_REVISION,
            validBounds: {
                minX: 0,
                minY: 0,
                maxXExclusive: this.options.validWidth,
                maxYExclusive: this.options.validHeight
            },
            boundaryPorts: this.ports,
            rivers: this.rivers,
            lakes: this.lakes,
            mouths: this.mouths,
            bodies: [...this.bodies.values()]
        });
    }

    private addBody(body: HydrologyBodyRef): void {
        const existing = this.bodies.get(body.bodyId);
        if (existing && (existing.kind !== body.kind || existing.profileIndex !== body.profileIndex)) {
            throw new Error("hydrology body identity resolved to conflicting kinds or profiles");
        }
        if (!existing) this.bodies.set(body.bodyId, Object.freeze(body));
    }
}

export function canonicalHydrologyPoint(tileX: number, tileY: number): CanonicalHydrologyPoint {
    const roundedX = Math.round(tileX * 2) / 2;
    const roundedY = Math.round(tileY * 2) / 2;
    if (Math.abs(tileX - roundedX) > CLIP_EPSILON || Math.abs(tileY - roundedY) > CLIP_EPSILON
        || !Number.isSafeInteger(roundedX * 2) || !Number.isSafeInteger(roundedY * 2)) {
        throw new Error("hydrology boundary crossing is not a half-tile logical coordinate");
    }
    return Object.freeze({ tileX: roundedX, tileY: roundedY });
}

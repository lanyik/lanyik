import { Point } from "../interfaces";

const SQRT_3 = 1.7320508075688772;
const positiveModulo = (value: number, period: number): number => ((value % period) + period) % period;

// The renderer uses an even-column offset grid: even x columns sit half a row
// lower than odd columns (getHexCenter/getNeighborCoords). Keeping the parity
// term on the + side is essential; the odd-column formula produces paths and
// disks whose adjacency disagrees with the visible world grid.
export function worldOffsetToAxial(point: Readonly<Point>): Point {
    const parity = positiveModulo(point.x, 2);
    return { x: point.x, y: point.y - (point.x + parity) / 2 };
}

export function worldAxialToOffset(point: Readonly<Point>): Point {
    const parity = positiveModulo(point.x, 2);
    return { x: point.x, y: point.y + (point.x + parity) / 2 };
}

function cubeRound(x: number, y: number, z: number): Point {
    let roundedX = Math.round(x);
    let roundedY = Math.round(y);
    let roundedZ = Math.round(z);
    const deltaX = Math.abs(roundedX - x);
    const deltaY = Math.abs(roundedY - y);
    const deltaZ = Math.abs(roundedZ - z);
    if (deltaX > deltaY && deltaX > deltaZ) roundedX = -roundedY - roundedZ;
    else if (deltaY > deltaZ) roundedY = -roundedX - roundedZ;
    else roundedZ = -roundedX - roundedY;
    return worldAxialToOffset({ x: roundedX, y: roundedZ });
}

export function rasterizeHexLine(from: Readonly<Point>, to: Readonly<Point>): Point[] {
    const first = worldOffsetToAxial(from);
    const second = worldOffsetToAxial(to);
    const firstY = -first.x - first.y;
    const secondY = -second.x - second.y;
    const distance = Math.max(
        Math.abs(first.x - second.x),
        Math.abs(firstY - secondY),
        Math.abs(first.y - second.y)
    );
    const result: Point[] = [];
    for (let index = 0; index <= distance; index += 1) {
        const amount = distance === 0 ? 0 : index / distance;
        result.push(cubeRound(
            first.x + (second.x - first.x) * amount,
            firstY + (secondY - firstY) * amount,
            first.y + (second.y - first.y) * amount
        ));
    }
    return result;
}

function renderedCenterY(x: number, y: number): number {
    return (y + (x % 2 === 0 ? 0.5 : 0)) * SQRT_3;
}

interface RiverCurveSample extends Point {
    readonly distance: number;
}

export interface RiverReach {
    /** Continuous rendered-plane points, NOT rounded hex coordinates. */
    readonly samples: readonly RiverCurveSample[];
    /** Arc length measured in hex-neighbour spacing. */
    readonly length: number;
}

const renderedPoint = (point: Readonly<Point>): Point => ({
    x: point.x * 1.5,
    y: renderedCenterY(point.x, point.y)
});

function renderedPointToHex(point: Readonly<Point>): Point {
    const q = point.x / 1.5;
    const r = point.y / SQRT_3 - q / 2 - 0.5;
    return cubeRound(q, -q - r, r);
}

// Round drainage corners using quadratic Bezier spans between edge midpoints.
// A coarse node is a control point, not a mandatory sharp turn in the water.
// All incoming branches share the midpoint/tangent of the outgoing edge.
export function createRiverReach(
    from: Readonly<Point>,
    to: Readonly<Point>,
    downstream?: Readonly<Point>,
    startsAtSource = true
): RiverReach {
    const first = renderedPoint(from);
    const corner = renderedPoint(to);
    const next = downstream ? renderedPoint(downstream) : corner;
    const start = startsAtSource ? first : { x: (first.x + corner.x) / 2, y: (first.y + corner.y) / 2 };
    const end = downstream ? { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 } : corner;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // Work relative to the start so translating a toroidal copy does not
    // change the polynomial through large-coordinate cancellation.
    const control = { x: corner.x - start.x, y: corner.y - start.y };
    // Linear interpolation error <= max |B''| / (8 n²). A 1/16-hex
    // tolerance is below categorical bank resolution; normal reaches need
    // only a few samples. The coarse lattice bounds the maximum work.
    const secondDerivative = 2 * Math.hypot(dx - 2 * control.x, dy - 2 * control.y);
    const projection = dx * control.x + dy * control.y;
    const straight = (dx !== 0 || dy !== 0 || (control.x === 0 && control.y === 0))
        && Math.abs(dx * control.y - dy * control.x) < 1e-9
        && projection >= 0 && projection <= dx * dx + dy * dy;
    const segments = straight ? 1 : Math.max(1, Math.ceil(Math.sqrt(secondDerivative / (8 * SQRT_3 / 16))));
    if (segments > 32) throw new RangeError("river reach exceeds the bounded curve tessellation budget");
    const samples: RiverCurveSample[] = [{ ...start, distance: 0 }];
    let length = 0;
    for (let index = 1; index <= segments; index += 1) {
        const t = index / segments;
        const u = 1 - t;
        const point = index === segments ? end : {
            x: start.x + 2 * u * t * control.x + t * t * dx,
            y: start.y + 2 * u * t * control.y + t * t * dy
        };
        const previous = samples[samples.length - 1];
        length += Math.hypot(point.x - previous.x, point.y - previous.y) / SQRT_3;
        samples.push({ ...point, distance: length });
    }
    return { samples, length };
}

// Retain a suffix without snapping its new source to a coarse drainage node.
// Distances are measured on the same tessellated curve used for water ownership.
export function trimRiverReachStart(reach: RiverReach, distance: number): RiverReach {
    if (!Number.isFinite(distance) || distance < 0 || distance > reach.length) {
        throw new RangeError("river trim distance must stay within its arc length");
    }
    if (distance === 0) return reach;
    const endIndex = reach.samples.findIndex(sample => sample.distance >= distance);
    const end = reach.samples[endIndex];
    const start = reach.samples[endIndex - 1];
    const t = (distance - start.distance) / (end.distance - start.distance);
    const samples: RiverCurveSample[] = [{
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        distance: 0
    }];
    for (let index = endIndex; index < reach.samples.length; index += 1) {
        const sample = reach.samples[index];
        if (sample.distance > distance) samples.push({ ...sample, distance: sample.distance - distance });
    }
    return { samples, length: reach.length - distance };
}

// Sweep tapered disks along the unrounded curve. Test each whole tile against
// the union once, rather than snapping spline samples to hexes and reintroducing
// angular centreline dilation. The quadratic tests the actual disk envelope.
export function forEachHexRiverReach(
    reach: RiverReach,
    fromRadius: number,
    toRadius: number,
    visit: (point: Point) => void
): void {
    if (!Number.isFinite(fromRadius) || fromRadius < 0 || !Number.isFinite(toRadius) || toRadius < 0) {
        throw new RangeError("river reach radii must be finite and non-negative");
    }
    const radius = Math.max(fromRadius, toRadius);
    const spine = new Map<string, Point>();
    if (Math.min(fromRadius, toRadius) < 1) {
        for (let index = 1; index < reach.samples.length; index += 1) {
            for (const point of rasterizeHexLine(
                renderedPointToHex(reach.samples[index - 1]), renderedPointToHex(reach.samples[index])
            )) spine.set(`${point.x},${point.y}`, point);
        }
    }
    if (radius === 0) {
        spine.forEach(visit);
        return;
    }
    const segments = reach.samples.slice(1).map((end, index) => {
        const start = reach.samples[index];
        const startFraction = reach.length === 0 ? 0 : start.distance / reach.length;
        const endFraction = reach.length === 0 ? 1 : end.distance / reach.length;
        const startRadius = (fromRadius + (toRadius - fromRadius) * startFraction) * SQRT_3;
        const radiusDelta = (toRadius - fromRadius) * (endFraction - startFraction) * SQRT_3;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const quadratic = dx * dx + dy * dy - radiusDelta * radiusDelta;
        return { start, dx, dy, startRadius, radiusDelta, quadratic };
    });
    const padding = Math.ceil(radius * SQRT_3 / 1.5) + 1;
    const minimumX = Math.floor(Math.min(...reach.samples.map(point => point.x)) / 1.5) - padding;
    const maximumX = Math.ceil(Math.max(...reach.samples.map(point => point.x)) / 1.5) + padding;
    const minimumY = Math.floor(Math.min(...reach.samples.map(point => point.y)) / SQRT_3) - padding;
    const maximumY = Math.ceil(Math.max(...reach.samples.map(point => point.y)) / SQRT_3) + padding;
    for (let x = minimumX; x <= maximumX; x += 1) {
        const candidateWorldX = x * 1.5;
        for (let y = minimumY; y <= maximumY; y += 1) {
            const candidateWorldY = renderedCenterY(x, y);
            let inside = spine.size > 0 && spine.has(`${x},${y}`);
            for (const segment of segments) {
                if (inside) break;
                const { start, dx, dy, startRadius, radiusDelta, quadratic } = segment;
                const deltaX = candidateWorldX - start.x;
                const deltaY = candidateWorldY - start.y;
                const linear = deltaX * dx + deltaY * dy + startRadius * radiusDelta;
                const constant = deltaX * deltaX + deltaY * deltaY - startRadius * startRadius;
                const amount = quadratic > 0 ? Math.max(0, Math.min(1, linear / quadratic)) : 0;
                const distance = quadratic > 0
                    ? constant - 2 * linear * amount + quadratic * amount * amount
                    : Math.min(constant, constant - 2 * linear + quadratic);
                inside = distance <= 1e-9;
            }
            if (inside) visit({ x, y });
        }
    }
}

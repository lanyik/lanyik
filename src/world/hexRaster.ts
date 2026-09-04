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

function squaredDistanceToSegment(
    pointX: number,
    pointY: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): number {
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared === 0) {
        const deltaX = pointX - fromX;
        const deltaY = pointY - fromY;
        return deltaX * deltaX + deltaY * deltaY;
    }
    const amount = Math.max(0, Math.min(1,
        ((pointX - fromX) * segmentX + (pointY - fromY) * segmentY) / lengthSquared
    ));
    const deltaX = pointX - (fromX + segmentX * amount);
    const deltaY = pointY - (fromY + segmentY * amount);
    return deltaX * deltaX + deltaY * deltaY;
}

// Rasterize a constant-width capsule by testing tile centres against the
// ideal line in rendered world space. Every emitted item is still a complete
// hex tile; this only gives ambiguous outer-ring tiles a deterministic,
// geometric water/land decision. Compared with graph-distance disk dilation,
// bends no longer inherit the jagged union of several offset hexagons.
export function forEachHexCapsule(
    from: Readonly<Point>,
    to: Readonly<Point>,
    radius: number,
    visit: (point: Point) => void
): void {
    if (!Number.isSafeInteger(radius) || radius < 0) {
        throw new RangeError("hex capsule radius must be a non-negative safe integer");
    }
    if (radius === 0) {
        rasterizeHexLine(from, to).forEach(visit);
        return;
    }

    const fromWorldX = from.x * 1.5;
    const fromWorldY = renderedCenterY(from.x, from.y);
    const toWorldX = to.x * 1.5;
    const toWorldY = renderedCenterY(to.x, to.y);
    const maximumDistanceSquared = radius * radius * 3 + 1e-9;
    // In offset coordinates r world-radius rings require at most r+1 columns
    // or rows of padding (the extra half-row is the even-column offset). A
    // compact rectangle is cheaper than repeatedly unioning a disk around
    // every digital-line cell and allocates no transient key set.
    const padding = radius + 1;
    const minimumX = Math.min(from.x, to.x) - padding;
    const maximumX = Math.max(from.x, to.x) + padding;
    const minimumY = Math.min(from.y, to.y) - padding;
    const maximumY = Math.max(from.y, to.y) + padding;
    for (let x = minimumX; x <= maximumX; x += 1) {
        const candidateWorldX = x * 1.5;
        for (let y = minimumY; y <= maximumY; y += 1) {
            if (squaredDistanceToSegment(
                candidateWorldX,
                renderedCenterY(x, y),
                fromWorldX,
                fromWorldY,
                toWorldX,
                toWorldY
            ) <= maximumDistanceSquared) {
                visit({ x, y });
            }
        }
    }
}

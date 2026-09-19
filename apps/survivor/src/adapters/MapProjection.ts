/** Inverse even-column offset layout, interpolated between tile centres. */
export function overviewPoint(x: number, z: number): { x: number; y: number } {
    const column = x / 1.5, left = Math.floor(column), fraction = column - left;
    const shift = (left % 2 === 0 ? 1 - fraction : fraction) * .5;
    return { x: column + .5, y: z / Math.sqrt(3) - shift + .5 };
}

/** North-up map: combat heading zero faces +Z (down), independently of camera orbit. */
export function overviewHeading(heading: number, scaleX: number, scaleY: number): number {
    return Math.atan2(Math.sin(heading) / 1.5 * scaleX, -Math.cos(heading) / Math.sqrt(3) * scaleY);
}

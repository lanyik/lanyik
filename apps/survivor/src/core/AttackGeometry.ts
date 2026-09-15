/** First contact with a vertical cylinder, including vertical entry after radial entry. */
export function segmentCylinderHit(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number,
    x: number, z: number, bottom: number, top: number, radius: number): number {
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, ox = sx - x, oz = sz - z;
    let enter = 0, exit = 1;
    if (dy === 0) { if (sy < bottom || sy > top) return Infinity; }
    else {
        const a = (bottom - sy) / dy, b = (top - sy) / dy;
        enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    const a = dx * dx + dz * dz, b = ox * dx + oz * dz, c = ox * ox + oz * oz - radius * radius;
    if (a === 0) { if (c > 0) return Infinity; }
    else {
        const d = b * b - a * c;
        if (d < 0) return Infinity;
        const root = Math.sqrt(d);
        enter = Math.max(enter, (-b - root) / a); exit = Math.min(exit, (-b + root) / a);
    }
    return enter <= exit ? enter : Infinity;
}

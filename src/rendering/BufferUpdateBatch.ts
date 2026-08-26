import { BufferAttribute } from "three";

export interface BufferUpdateRange {
    start: number;
    count: number;
}

export interface GpuTileStateChange {
    x: number;
    y: number;
    state: number;
}

//Three.js accepts multiple component ranges, but a long fog/frontier update can
//otherwise append hundreds of overlapping one-element uploads before the next
//render. Sort and merge touching ranges once per attribute/batch.
export function mergeBufferUpdateRanges(
    ranges: readonly BufferUpdateRange[]
): BufferUpdateRange[] {
    const sorted = ranges
        .filter(range => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.count)
            && range.start >= 0 && range.count > 0)
        .map(range => ({ start: range.start, count: range.count }))
        .sort((a, b) => a.start - b.start || a.count - b.count);
    if (sorted.length === 0) return [];

    const merged: BufferUpdateRange[] = [sorted[0]];
    for (let index = 1; index < sorted.length; index += 1) {
        const next = sorted[index];
        const current = merged[merged.length - 1];
        const end = current.start + current.count;
        if (next.start > end) {
            merged.push(next);
            continue;
        }
        current.count = Math.max(end, next.start + next.count) - current.start;
    }
    return merged;
}

export function commitBufferAttributeRanges(
    attribute: BufferAttribute,
    ranges: readonly BufferUpdateRange[]
): void {
    const merged = mergeBufferUpdateRanges([...attribute.updateRanges, ...ranges]);
    if (merged.length === 0) return;
    attribute.clearUpdateRanges();
    for (const range of merged) attribute.addUpdateRange(range.start, range.count);
    attribute.needsUpdate = true;
}

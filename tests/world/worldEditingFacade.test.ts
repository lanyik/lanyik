import { describe, expect, test } from "vitest";

import { Land } from "../../src/enums";
import { MapInfo } from "../../src/interfaces";
import { MutableWorldSource, WorldChunk } from "../../src/world/WorldSource";
import { WorldEditingFacade } from "../../src/world/WorldEditingFacade";

function world(): MapInfo {
    return { w: 2, h: 1, data: { 0: { 0: { type: Land.land } }, 1: { 0: { type: Land.sand } } } };
}

class EditableSource implements MutableWorldSource {
    public readonly chunkSize = 12;
    public constructor(public readonly map: MapInfo) {}
    public resolveChunk(x: number, y: number) { return x === 0 && y === 0 ? { x, y } : undefined; }
    public chunkDistance(x: number, y: number, cx: number, cy: number) { return Math.hypot(x - cx, y - cy); }
    public loadChunk(): Promise<WorldChunk> { return Promise.reject(new Error("unused")); }
    public releaseChunk(): void {}
    public hasChunk() { return true; }
    public hasTile(x: number, y: number) { return Boolean(this.map.data[x]?.[y]); }
    public setTileOverride(x: number, y: number, changes: Record<string, unknown>): void {
        Object.assign(this.map.data[x][y], changes);
    }
    public clearTileOverride(): boolean { return false; }
    public dispose(): void {}
}

describe("WorldEditingFacade", () => {
    test("canonicalizes a batch and returns only visually dirty coordinates", () => {
        const source = new EditableSource(world());
        const editing = new WorldEditingFacade(source, source.map, {
            visualSignature: tile => String(tile?.type)
        });
        const result = editing.setTileOverrides([
            { x: 0, y: 0, changes: { unit: "u" } },
            { x: 1, y: 0, changes: { type: Land.snow } }
        ]);
        expect(result.changed).toBe(true);
        expect(result.dirtyTiles).toEqual([{ x: 1, y: 0 }]);
        expect(editing.stats).toMatchObject({ editBatches: 1, changedTiles: 2, visualDirtyTiles: 1 });
    });

    test("cannot mutate its old world after disposal", () => {
        const source = new EditableSource(world());
        const editing = new WorldEditingFacade(source, source.map);
        editing.dispose();
        expect(() => editing.setTileOverride(0, 0, { type: Land.snow })).toThrow(/disposed/);
    });
});

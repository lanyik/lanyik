import { describe, expect, test } from "vitest";
import { Ray, Vector3 } from "three";
import { Land } from "../../src/enums";
import { getHexCenter } from "../../src/helpers/helpers";
import { intersectWorldSurface, pickTile } from "../../src/helpers/picking";
import { MapInfo } from "../../src/interfaces";
import { SurfaceHexMarker, SurfaceMarkerProjectionCache } from "../../src/rendering/SurfaceHexMarker";
import { createWorldSurfaceView } from "../../src/world/WorldSurfaceView";

function mountainMap(): MapInfo {
    const map: MapInfo = { data: {}, w: 20, h: 20 };
    for (let x = 0; x < 20; x += 1) {
        map.data[x] = {};
        for (let y = 0; y < 20; y += 1) map.data[x][y] = { type: x < 10 ? Land.land : Land.mountain };
    }
    return map;
}

describe("terrain-projected interaction", () => {
    test("projects the entire rim onto a slope and reuses only current surface projections", () => {
        const surface = createWorldSurfaceView({ map: mountainMap(), tileSize: 40, mountainHeight: 120 });
        const cache = new SurfaceMarkerProjectionCache();
        const tile = { x: 10, y: 10 };
        const center = getHexCenter(tile.x, tile.y, 40);
        const first = cache.project(surface, tile);
        expect(cache.project(surface, tile)).toBe(first);
        const heights: number[] = [];
        for (let i = 0; i < first.length; i += 3) {
            const ground = surface.getWorldHeight(center.x + first[i], center.y + first[i + 2]);
            expect(first[i + 1]).toBeCloseTo(ground * 1.015 + 0.32, 4);
            heights.push(first[i + 1]);
        }
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(30);
        surface.setMountainHeight(180);
        expect(cache.project(surface, tile)).not.toBe(first);
        const changed = cache.project(surface, tile);
        surface.map.data[10][10] = { type: Land.sea };
        surface.invalidate();
        expect(cache.project(surface, tile)).not.toEqual(changed);
        const nextWorld = createWorldSurfaceView({ map: mountainMap(), tileSize: 40, mountainHeight: 0 });
        expect(cache.project(nextWorld, tile)[1]).toBeCloseTo(0.32);
    });

    test("bounded cache eviction leaves displayed geometry intact", () => {
        const surface = createWorldSurfaceView({ map: mountainMap(), tileSize: 40, mountainHeight: 120 });
        const cache = new SurfaceMarkerProjectionCache();
        const tile = { x: 0, y: 0 };
        const first = cache.project(surface, tile);
        const marker = new SurfaceHexMarker(0xffffff, cache);
        marker.project(surface, tile);
        const before = marker.geometry.getAttribute("position").array.slice();
        for (let x = 1; x < 20; x += 1) for (let y = 0; y < 10; y += 1) cache.project(surface, { x, y });
        expect(cache.project(surface, tile)).not.toBe(first);
        expect(marker.geometry.getAttribute("position").array).toEqual(before);
        const positions = marker.geometry.getAttribute("position");
        const index = marker.geometry.getIndex()!;
        const a = new Vector3().fromBufferAttribute(positions, index.getX(0));
        const b = new Vector3().fromBufferAttribute(positions, index.getX(1));
        const c = new Vector3().fromBufferAttribute(positions, index.getX(2));
        expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
        marker.geometry.dispose();
        marker.material.dispose();
        cache.clear();
    });

    test.each([0, 80, 240])("picks visible mountain terrain at height %s instead of the Y=0 tile", height => {
        const surface = createWorldSurfaceView({ map: mountainMap(), tileSize: 40, mountainHeight: height });
        const center = getHexCenter(13, 10, 40);
        const target = new Vector3(center.x, surface.getTileCenterHeight(13, 10), center.y);
        const origin = target.clone().add(new Vector3(0, 250, 160));
        const ray = new Ray(origin, target.clone().sub(origin).normalize());
        const hit = intersectWorldSurface(ray, surface, 2000)!;
        expect(hit.distanceTo(target)).toBeLessThan(1e-5);
        expect(pickTile(hit, 40)).toMatchObject({ x: 13, y: 10 });
        expect(intersectWorldSurface(ray, surface, 1)).toBeNull();
        expect(intersectWorldSurface(new Ray(origin, new Vector3(0, 1, 0)), surface, 2000)).toBeNull();
    });

    test("picks slopes, toroidal copies, and negative logical coordinates", () => {
        const map = mountainMap();
        map.wrapX = map.wrapY = true;
        const surface = createWorldSurfaceView({ map, tileSize: 40, mountainHeight: 200 });
        for (const [x, y] of [[10, 10], [-10, 10], [30, -10]]) {
            const center = getHexCenter(x, y, 40);
            const target = new Vector3(center.x + 8, surface.getWorldHeight(center.x + 8, center.y + 9), center.y + 9);
            const ray = new Ray(target.clone().add(new Vector3(0, 400, 0)), new Vector3(0, -1, 0));
            expect(intersectWorldSurface(ray, surface, 1000)!.distanceTo(target)).toBeLessThan(1e-5);
        }
        const infinite: MapInfo = { data: { [-2]: { [-3]: { type: Land.mountain } } }, w: 1, h: 1, infinite: true };
        const negative = createWorldSurfaceView({ map: infinite, tileSize: 40, mountainHeight: 80 });
        const center = getHexCenter(-2, -3, 40);
        const hit = intersectWorldSurface(new Ray(new Vector3(center.x, 400, center.y), new Vector3(0, -1, 0)), negative, 1000)!;
        expect(pickTile(hit, 40)).toMatchObject({ x: -2, y: -3 });
    });

    test("traverses multiple hexes before hitting low ground beyond the mountain-height interval", () => {
        const surface = createWorldSurfaceView({ map: mountainMap(), tileSize: 40, mountainHeight: 80 });
        const center = getHexCenter(8, 10, 40);
        const target = new Vector3(center.x, 0, center.y);
        const origin = target.clone().add(new Vector3(400, 300, 0));
        const ray = new Ray(origin, target.clone().sub(origin).normalize());
        expect(intersectWorldSurface(ray, surface, 1000)!.distanceTo(target)).toBeLessThan(1e-5);
    });
});

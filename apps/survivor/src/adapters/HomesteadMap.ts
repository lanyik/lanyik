import { Land, type MapInfo } from "three-hex-map";
import { HOMESTEAD } from "../core/Homestead";

export function createHomesteadMap(): MapInfo {
    const map: MapInfo = { w: HOMESTEAD.width, h: HOMESTEAD.height, wrapX: false, wrapY: false, data: {} };
    for (let x = 0; x < map.w; x++) {
        map.data[x] = {};
        for (let y = 0; y < map.h; y++) {
            const edge = x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1;
            const path = Math.abs(x - 32) <= 1 || Math.abs(y - 32) <= 1 || Math.hypot(x - 32, y - 32) < 7;
            map.data[x][y] = { type: edge ? Land.sea : path ? Land.sand : Land.land };
        }
    }
    return map;
}

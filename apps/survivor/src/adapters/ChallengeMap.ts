import { Land, getHexCenter, type MapInfo } from "three-hex-map";
import { CHALLENGE_ARENA } from "../core/BossChallenge";

export function createChallengeMap(): MapInfo {
    const arena = CHALLENGE_ARENA, map: MapInfo = { w: arena.width, h: arena.height, wrapX: false, wrapY: false, data: {} };
    for (let x = 0; x < map.w; x++) {
        map.data[x] = {};
        for (let y = 0; y < map.h; y++) {
            const center = getHexCenter(x, y, 1), radius = Math.hypot(center.x - arena.x, center.y - arena.z);
            map.data[x][y] = { type: radius < 4 || radius > arena.radius - 2 ? Land.sand : Land.land };
        }
    }
    return map;
}

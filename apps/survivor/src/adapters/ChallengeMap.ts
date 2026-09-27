import { Land, getHexCenter, type MapInfo } from "three-hex-map";
import { CHALLENGE_ARENA } from "../core/BossChallenge";
import { challengeBank, challengePathDistance } from "../core/ChallengeLayout";

export function createChallengeMap(): MapInfo {
    const arena = CHALLENGE_ARENA, map: MapInfo = { w: arena.width, h: arena.height, wrapX: false, wrapY: false, data: {} };
    for (let x = 0; x < map.w; x++) {
        map.data[x] = {};
        for (let y = 0; y < map.h; y++) {
            const center = getHexCenter(x, y, 1), radius = Math.hypot(center.x - arena.x, center.y - arena.z);
            const bank = challengeBank(center.y), path = challengePathDistance(center.x, center.y);
            map.data[x][y] = center.x < bank ? { type: Land.sea }
                : { type: Land.land, modifiers: path < 1.3 || radius < 6 || center.x < bank + 2 ? ["soil"] : [] };
        }
    }
    return map;
}

import { CHALLENGE_ARENA, CHALLENGE_SPAWN, challengeSpawns } from "./BossChallenge";
import { DeterministicRandom } from "./DeterministicRandom";

/** Production scenery, also used by the visual review. Coordinates are game units. */
export const CHALLENGE_ROUTE = Object.freeze([
    { id: "camp", ...CHALLENGE_SPAWN },
    { id: "path", x: 22, z: 43 },
    { id: "bank", x: 16, z: 39 },
    { id: "boss", x: CHALLENGE_ARENA.x, z: CHALLENGE_ARENA.z - 5 }
].map(point => Object.freeze(point)));
export const CHALLENGE_PATH = Object.freeze([
    CHALLENGE_ROUTE[0], { x: 27, z: 48 }, CHALLENGE_ROUTE[1], { x: 18.5, z: 42 },
    CHALLENGE_ROUTE[2], { x: 18, z: 34 }, { x: 24, z: 29 }, CHALLENGE_ROUTE[3]
].map(point => Object.freeze(point)));

/** Shared continuous river edge. The unwalkable 1.2-unit margin contains its sloped bank. */
export function challengeBank(z: number): number { return 8.5 + 4 * Math.exp(-(((z - 41) / 6) ** 2)); }
export function challengePathDistance(x: number, z: number): number {
    let distance = Infinity;
    for (let index = 1; index < CHALLENGE_PATH.length; index++) {
        const a = CHALLENGE_PATH[index - 1], b = CHALLENGE_PATH[index], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
    return distance;
}

interface ChallengeProp {
    readonly model: `rock${number}` | "firepit" | "timber";
    readonly x: number; readonly z: number; readonly radius: number; readonly height: number;
    readonly rotation: number; readonly solid: boolean;
}
interface ChallengeTree { readonly x: number; readonly z: number; readonly scale: number; readonly rotation: number }

function createScenery() {
    const random = new DeterministicRandom("challenge-scenery-v1"), props: ChallengeProp[] = [], trees: ChallengeTree[] = [];
    const spawns = challengeSpawns("stone-sovereign", 1);
    const reserved = (x: number, z: number, radius: number) => Math.hypot(x - CHALLENGE_SPAWN.x, z - CHALLENGE_SPAWN.z) < radius + 1
        || spawns.some((spawn, index) => Math.hypot(x - spawn.x, z - spawn.z) < radius + (index === 0 ? 5 : 1.2));
    const rock = (x: number, z: number, radius: number, height: number, solid = true) => {
        props.push({ model: `rock${Math.floor(random.next() * 6)}`, x, z, radius, height, rotation: random.next() * Math.PI * 2, solid });
    };
    // Broken stone enclosure around the entrance; the west-facing exit stays open.
    props.push({ model: "firepit", x: 32.4, z: 50, radius: 1.1, height: .55, rotation: .4, solid: true });
    for (const [x, z, height] of [[27, 52, 1.3], [26, 51.5, .85], [34, 49, 1.6], [35, 48, 1.1],
        [34.4, 46.8, .65], [29, 48, .5], [33, 53, .7]]) rock(x, z, .65, height);
    // Walkable, embedded pavers: two irregular rows, interrupted by soil at the bank.
    for (let segment = 1; segment < CHALLENGE_PATH.length; segment++) {
        const a = CHALLENGE_PATH[segment - 1], b = CHALLENGE_PATH[segment], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        for (let step = .6; step < length; step += .85) for (const side of [-1, 1]) {
            if (segment === 4 || random.next() < .13) continue;
            const offset = side * (.38 + random.next() * .13), along = Math.min(length, step + random.next() * .2);
            rock(a.x + dx / length * along - dz / length * offset, a.z + dz / length * along + dx / length * offset,
                .32 + random.next() * .13, .035, false);
        }
    }
    for (let x = 12; x <= 49; x += 3.4) for (let z = 12; z <= 51; z += 3.4) {
        const tx = x + (random.next() - .5) * 1.8, tz = z + (random.next() - .5) * 1.8;
        if (Math.hypot(tx - CHALLENGE_ARENA.x, tz - CHALLENGE_ARENA.z) > 22 || tx < challengeBank(tz) + 2.5
            || challengePathDistance(tx, tz) < 2 || reserved(tx, tz, .7)) continue;
        trees.push({ x: tx, z: tz, scale: .9 + random.next() * .35, rotation: random.next() * Math.PI * 2 });
    }
    // Scanned boulders along the river and around the boss clearing.
    for (const [x, z] of [[14.6, 36.5], [14.9, 43], [16.5, 45], [27, 22], [32, 21], [36, 25], [34, 32]]) {
        if (!reserved(x, z, .9) && challengePathDistance(x, z) > 1.8) rock(x, z, .8, .75 + random.next() * .5);
    }
    // Fallen timbers remain inside the same conservative collision cylinders as their meshes.
    for (const [x, z, radius, height, rotation] of [[35, 51.7, 1.1, .3, .8], [28, 54, 1, .26, 1.9], [26, 53.5, .7, .35, -.3]]) {
        if (!reserved(x, z, radius)) props.push({ model: "timber", x, z, radius, height, rotation, solid: true });
    }
    for (const rotation of [0, 2.1, 4.2]) props.push({ model: "timber", x: 32.4 + .12 * Math.cos(rotation), z: 50 + .12 * Math.sin(rotation),
        radius: .5, height: .25, rotation, solid: false });
    return { props: Object.freeze(props.map(prop => Object.freeze(prop))), trees: Object.freeze(trees.map(tree => Object.freeze(tree))) };
}
export const CHALLENGE_SCENERY = Object.freeze(createScenery());

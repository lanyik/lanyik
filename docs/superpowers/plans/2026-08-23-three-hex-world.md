# Three.js Procedural Hex World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor `gunyakov/three-hex-map` into this repository and deliver a graphics-only browser demo that generates deterministic Civilization-style hex worlds from a seed.

**Architecture:** Preserve the upstream renderer, instanced geometry, shaders, assets, and build pipeline. Add a pure TypeScript seeded world generator that returns the upstream `MapInfo` type, export it from the library, and replace the gameplay-oriented demo bootstrap with a `HexMap`-only page using dat.gui controls.

**Tech Stack:** TypeScript 6, Three.js, tsup, Rollup, Vitest, dat.gui, stats.js, static HTML/CSS/ES modules.

---

### Task 1: Integrate the upstream renderer without losing project documents

**Files:**
- Import from `upstream/main`: upstream tracked files under `src/`, `public/`, `scripts/`, plus root build/configuration files
- Preserve: `docs/superpowers/specs/2026-08-23-three-hex-world-design.md`
- Preserve and extend: `.gitignore`

- [ ] **Step 1: Confirm the fetched upstream revision**

Run:

```powershell
git rev-parse upstream/main
git status --short
```

Expected: a 40-character upstream commit and a clean working tree.

- [ ] **Step 2: Merge the upstream history**

Run:

```powershell
git merge upstream/main --allow-unrelated-histories -X theirs -m "chore: import three-hex-map upstream"
```

Expected: upstream files appear while the committed `docs/` tree remains present.

- [ ] **Step 3: Keep the brainstorming workspace ignored**

Ensure the upstream `.gitignore` ends with:

```gitignore

# Local design companion state
.superpowers/
```

- [ ] **Step 4: Verify attribution and imported structure**

Run:

```powershell
git status --short
Test-Path LICENSE
Test-Path src/HexMap.ts
Test-Path public/index.html
Select-String -Path LICENSE -Pattern "Mozilla Public License Version 2.0"
```

Expected: only `.gitignore` is modified, all three paths exist, and the MPL-2.0 heading is found.

- [ ] **Step 5: Commit the ignore rule**

Run:

```powershell
git add .gitignore
git commit -m "chore: ignore local design companion state"
```

Expected: commit succeeds and `git status --short` is empty.

### Task 2: Establish the test harness and baseline

**Files:**
- Modify: `package.json`
- Modify mechanically: `package-lock.json`

- [ ] **Step 1: Install upstream dependencies**

Run:

```powershell
npm install
```

Expected: dependencies install without audit or peer-dependency failure.

- [ ] **Step 2: Add Vitest**

Run:

```powershell
npm install --save-dev vitest
```

Expected: `vitest` is recorded under `devDependencies` and the lockfile is updated.

- [ ] **Step 3: Add deterministic test scripts**

Add these entries to `package.json`'s `scripts` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

The complete scripts object becomes:

```json
{
  "build:lib": "tsup && tsc -p tsconfig.build.json && rollup -c rollup.config.global.mjs",
  "build:demo": "npm run build:lib && node scripts/copy-demo-assets.cjs",
  "build": "npm run build:demo",
  "server": "npx http-server public -c-1 -p 3000",
  "start": "npm run build && npm run server",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify the untouched upstream baseline**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0 before feature code is introduced.

- [ ] **Step 5: Commit the harness**

Run:

```powershell
git add package.json package-lock.json
git commit -m "test: add vitest harness"
```

Expected: commit succeeds.

### Task 3: Specify the seeded world generator with failing tests

**Files:**
- Create: `tests/world/generateWorld.test.ts`

- [ ] **Step 1: Add behavioral tests through the public API**

Create `tests/world/generateWorld.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
    generateWorld,
    getNeighbors,
    Land,
    MAX_WORLD_SIZE,
    MIN_WORLD_SIZE
} from "../../src/index";

const landTypes = new Set(Object.values(Land));
const allowedModifiers = new Set(["hill", "wood", "lake"]);
const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;

describe("generateWorld", () => {
    test("repeats exactly for the same seed and dimensions", () => {
        const first = generateWorld({ seed: "atlas", width: 24, height: 18 });
        const second = generateWorld({ seed: "atlas", width: 24, height: 18 });
        expect(second).toEqual(first);
    });

    test("changes terrain when the seed changes", () => {
        const first = generateWorld({ seed: "atlas", width: 24, height: 18 });
        const second = generateWorld({ seed: "meridian", width: 24, height: 18 });
        expect(second.data).not.toEqual(first.data);
    });

    test("fills every requested coordinate with supported data", () => {
        const width = 21;
        const height = 17;
        const world = generateWorld({ seed: 42, width, height });

        expect(world.w).toBe(width);
        expect(world.h).toBe(height);

        for (let x = 0; x < width; x += 1) {
            for (let y = 0; y < height; y += 1) {
                const tile = world.data[x][y];
                expect(tile).toBeDefined();
                expect(landTypes.has(tile.type)).toBe(true);
                expect((tile.modifiers ?? []).every(value => allowedModifiers.has(value))).toBe(true);
            }
        }
    });

    test("marks sea cells touching land as coastal and no other sea cells", () => {
        const world = generateWorld({ seed: "coast-check", width: 32, height: 24 });

        for (let x = 0; x < world.w; x += 1) {
            for (let y = 0; y < world.h; y += 1) {
                const tile = world.data[x][y];
                if (!isWater(tile.type)) continue;

                const touchesLand = getNeighbors(x, y).some(({ x: nx, y: ny }) => {
                    const neighbor = world.data[nx]?.[ny];
                    return neighbor !== undefined && !isWater(neighbor.type);
                });

                expect(tile.type === Land.coastal).toBe(touchesLand);
            }
        }
    });

    test.each([
        { seed: "x", width: MIN_WORLD_SIZE - 1, height: 20 },
        { seed: "x", width: 20, height: MAX_WORLD_SIZE + 1 },
        { seed: "x", width: 20.5, height: 20 }
    ])("rejects invalid dimensions: %o", options => {
        expect(() => generateWorld(options)).toThrow(/integer between/);
    });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm test -- tests/world/generateWorld.test.ts
```

Expected: FAIL because `generateWorld`, `MIN_WORLD_SIZE`, and `MAX_WORLD_SIZE` are not exported.

- [ ] **Step 3: Commit the failing specification**

Run:

```powershell
git add tests/world/generateWorld.test.ts
git commit -m "test: specify seeded hex world generation"
```

Expected: commit succeeds while the new test remains intentionally red.

### Task 4: Implement deterministic terrain generation

**Files:**
- Create: `src/world/noise.ts`
- Create: `src/world/generateWorld.ts`
- Modify: `src/index.ts`
- Test: `tests/world/generateWorld.test.ts`

- [ ] **Step 1: Implement deterministic value noise**

Create `src/world/noise.ts`:

```ts
const UINT32_MAX = 0xffffffff;

export function seedToUint32(seed: string | number): number {
    const text = String(seed);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function randomGridValue(seed: number, x: number, y: number): number {
    let hash = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
    return ((hash ^ (hash >>> 15)) >>> 0) / UINT32_MAX;
}

const smooth = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

export function valueNoise2D(seed: number, x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = lerp(randomGridValue(seed, x0, y0), randomGridValue(seed, x0 + 1, y0), tx);
    const bottom = lerp(randomGridValue(seed, x0, y0 + 1), randomGridValue(seed, x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
}

export function fractalNoise2D(seed: number, x: number, y: number, octaves: number): number {
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
        total += valueNoise2D((seed + Math.imul(octave, 0x9e3779b9)) >>> 0, x * frequency, y * frequency) * amplitude;
        normalization += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return total / normalization;
}

export function randomAt(seed: number, x: number, y: number, salt: number): number {
    return randomGridValue((seed ^ salt) >>> 0, x, y);
}
```

- [ ] **Step 2: Implement the `MapInfo` generator**

Create `src/world/generateWorld.ts`:

```ts
import { Land } from "../enums";
import { getNeighbors } from "../helpers/neighbors";
import { MapInfo, MapInfoData, TileInfo } from "../interfaces";
import { fractalNoise2D, randomAt, seedToUint32 } from "./noise";

export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 96;

export interface WorldGenerationOptions {
    seed: string | number;
    width: number;
    height: number;
}

interface ClimateSample {
    elevation: number;
    moisture: number;
    temperature: number;
}

const SEA_LEVEL = 0.43;
const isWater = (type: Land): boolean => type === Land.sea || type === Land.coastal;

function assertDimension(name: "width" | "height", value: number): void {
    if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
        throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
    }
}

function sampleClimate(seed: number, x: number, y: number, width: number, height: number): ClimateSample {
    const nx = width === 1 ? 0 : (x / (width - 1)) * 2 - 1;
    const ny = height === 1 ? 0 : (y / (height - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
    const detail = fractalNoise2D(seed ^ 0xa341316c, x * 0.14, y * 0.14, 3);
    const elevation = continent * 0.78 + detail * 0.22 + 0.12 - Math.pow(edge, 3) * 0.58;
    const moisture = fractalNoise2D(seed ^ 0xc8013ea4, x * 0.08, y * 0.08, 4);
    const temperatureNoise = fractalNoise2D(seed ^ 0xad90777d, x * 0.07, y * 0.07, 3);
    const latitude = Math.abs(ny);
    const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
    return { elevation, moisture, temperature };
}

function classifyTerrain({ elevation, moisture, temperature }: ClimateSample): Land {
    if (elevation < SEA_LEVEL) return Land.sea;
    if (elevation > 0.75) return Land.mountain;
    if (temperature < 0.18) return Land.snow;
    if (temperature < 0.34) return Land.tundra;
    if (temperature > 0.68 && moisture < 0.42) return Land.sand;
    return Land.land;
}

function decorateTile(seed: number, x: number, y: number, climate: ClimateSample, type: Land): TileInfo {
    const tile: TileInfo = { type };
    if (isWater(type) || type === Land.mountain || type === Land.snow) return tile;

    const modifiers: string[] = [];
    const lake = type === Land.land
        && climate.elevation > SEA_LEVEL + 0.025
        && climate.elevation < 0.56
        && climate.moisture > 0.74
        && randomAt(seed, x, y, 0x6c8e9cf5) > 0.94;

    if (lake) {
        modifiers.push("lake");
    } else {
        if (climate.elevation > 0.62) modifiers.push("hill");
        const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
        if (randomAt(seed, x, y, 0x27d4eb2f) < forestChance) {
            modifiers.push("wood");
            tile.treeModel = climate.temperature > 0.67
                ? "Assets/models/palm"
                : climate.temperature < 0.4
                    ? "Assets/models/pinia"
                    : "Assets/models/oak";
        }
    }

    if (modifiers.length > 0) tile.modifiers = modifiers;
    return tile;
}

export function generateWorld({ seed, width, height }: WorldGenerationOptions): MapInfo {
    assertDimension("width", width);
    assertDimension("height", height);

    const numericSeed = seedToUint32(seed);
    const data: MapInfoData = {};

    for (let x = 0; x < width; x += 1) {
        data[x] = {};
        for (let y = 0; y < height; y += 1) {
            const climate = sampleClimate(numericSeed, x, y, width, height);
            const type = classifyTerrain(climate);
            data[x][y] = decorateTile(numericSeed, x, y, climate, type);
        }
    }

    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
            const tile = data[x][y];
            if (tile.type !== Land.sea) continue;
            const touchesLand = getNeighbors(x, y).some(({ x: nx, y: ny }) => {
                const neighbor = data[nx]?.[ny];
                return neighbor !== undefined && !isWater(neighbor.type);
            });
            if (touchesLand) tile.type = Land.coastal;
        }
    }

    return { data, w: width, h: height };
}
```

- [ ] **Step 3: Export the generator through the library entry point**

Append to `src/index.ts`:

```ts
export { generateWorld, MIN_WORLD_SIZE, MAX_WORLD_SIZE } from "./world/generateWorld";
export type { WorldGenerationOptions } from "./world/generateWorld";
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- tests/world/generateWorld.test.ts
```

Expected: all five generator tests pass.

- [ ] **Step 5: Run type checking**

Run:

```powershell
npm run typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 6: Commit the implementation**

Run:

```powershell
git add src/world/noise.ts src/world/generateWorld.ts src/index.ts
git commit -m "feat: generate deterministic hex worlds"
```

Expected: commit succeeds.

### Task 5: Replace the gameplay demo with a graphics-only world viewer

**Files:**
- Create: `public/demo.js`
- Create: `public/demo.css`
- Modify: `public/index.html`
- Modify generated output: `public/js/hex-map.global.js`
- Modify generated output: `public/js/hex-map.global.js.map`

- [ ] **Step 1: Create the demo layout**

Replace `public/index.html` with:

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Procedural Hex World</title>
    <link rel="stylesheet" href="js/vendor/dat.gui.css">
    <link rel="stylesheet" href="demo.css">
</head>
<body>
    <canvas class="scene__canvas" data-world-canvas></canvas>
    <aside class="world-status" aria-live="polite">
        <strong data-world-title>正在生成世界…</strong>
        <span data-world-detail>初始化 Three.js 渲染器</span>
    </aside>

    <script type="module">
        import * as THREE from "./js/vendor/three.module.js";
        window.THREE = THREE;
    </script>
    <script src="js/hex-map.global.js" defer></script>
    <script type="module" src="demo.js"></script>
</body>
</html>
```

- [ ] **Step 2: Style the fullscreen canvas and status overlay**

Create `public/demo.css`:

```css
:root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #07141d;
}

* { box-sizing: border-box; }

html,
body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
}

.scene__canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.world-status {
    position: fixed;
    left: 16px;
    bottom: 16px;
    display: grid;
    gap: 4px;
    min-width: 260px;
    padding: 12px 14px;
    color: #ecf7ed;
    background: rgba(5, 17, 24, 0.78);
    border: 1px solid rgba(178, 217, 180, 0.28);
    border-radius: 10px;
    box-shadow: 0 12px 38px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(12px);
    pointer-events: none;
}

.world-status strong { font-size: 14px; }
.world-status span { color: #a9c3bd; font-size: 12px; }

.dg.ac { z-index: 10; }

@media (max-width: 640px) {
    .world-status {
        left: 10px;
        right: 10px;
        bottom: 10px;
        min-width: 0;
    }
}
```

- [ ] **Step 3: Bootstrap `HexMap`, generation, status, and visual controls**

Create `public/demo.js`:

```js
import { GUI } from "./js/vendor/dat.gui.module.js";
import Stats from "./js/vendor/stats.module.js";

const { HexMap, StaticWorldSource, generateWorld, MIN_WORLD_SIZE, MAX_WORLD_SIZE } = window.HexMap;
const title = document.querySelector("[data-world-title]");
const detail = document.querySelector("[data-world-detail]");

const map = new HexMap({
    element: "[data-world-canvas]",
    size: 48,
    texturesBaseUrl: "textures/",
    gridVisible: true,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    treesPerTile: 16,
    treeModel: "Assets/models/oak",
    grassEnabled: true,
    grassDensity: 45,
    waterColorShallow: 0x2f9c8f,
    waterColorDeep: 0x0f4c75,
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1,
    waterWaveSpeed: 1,
    coastalWavesEnabled: true,
    coastalWaveDistortion: 0.5,
    coastCurvature: 0.5,
    landBlendCurvature: 0.5,
    mountainHeight: 30
});

window.hexWorld = map;

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
map.on("frame", () => stats.update());

const controls = {
    seed: "new-world",
    width: 42,
    height: 32,
    regenerate
};

let currentWorld;
let generating = false;

async function regenerate() {
    if (generating) return;
    generating = true;
    title.textContent = "正在生成世界…";
    detail.textContent = `${controls.width} × ${controls.height} · seed ${controls.seed}`;

    try {
        const nextWorld = generateWorld({
            seed: controls.seed,
            width: Number(controls.width),
            height: Number(controls.height)
        });
        await map.loadWorld({ source: new StaticWorldSource(nextWorld) });
        currentWorld = nextWorld;
        title.textContent = "世界已生成";
        detail.textContent = `${nextWorld.w} × ${nextWorld.h} · seed ${controls.seed}`;
    } catch (error) {
        console.error(error);
        title.textContent = "生成失败";
        detail.textContent = error instanceof Error ? error.message : String(error);
        if (currentWorld) {
            await map.loadWorld({ source: new StaticWorldSource(currentWorld) })
                .catch(restoreError => console.error("Map restore failed", restoreError));
        }
    } finally {
        generating = false;
    }
}

map.on("hover", ({ x, y, tile }) => {
    title.textContent = `格子 ${x}, ${y}`;
    detail.textContent = [tile.type, ...(tile.modifiers ?? [])].join(" · ");
});

map.on("click", ({ x, y, tile }) => {
    title.textContent = `已选择 ${x}, ${y}`;
    detail.textContent = [tile.type, ...(tile.modifiers ?? [])].join(" · ");
});

const gui = new GUI({ width: 310 });
const worldFolder = gui.addFolder("World generation");
worldFolder.add(controls, "seed").name("seed");
worldFolder.add(controls, "width", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 1).name("width");
worldFolder.add(controls, "height", MIN_WORLD_SIZE, MAX_WORLD_SIZE, 1).name("height");
worldFolder.add(controls, "regenerate").name("Generate world");
worldFolder.open();

const terrainFolder = gui.addFolder("Terrain");
terrainFolder.add(map, "gridVisible").name("grid");
terrainFolder.add(map, "landBlendWidth", 0, 1, 0.01).name("blend width");
terrainFolder.add(map, "landBlendCurvature", 0, 1, 0.01).name("blend curve");
terrainFolder.add(map, "mountainHeight", 0, 80, 1).name("mountains");

const waterFolder = gui.addFolder("Water & coast");
waterFolder.add(map, "waterWaveAmplitude", 0, 5, 0.1).name("wave height");
waterFolder.add(map, "waterWaveSpeed", 0, 4, 0.05).name("wave speed");
waterFolder.add(map, "coastCurvature", 0, 1, 0.01).name("coast curve");
waterFolder.add(map, "coastalWaveOpacity", 0, 1, 0.01).name("foam");

const vegetationFolder = gui.addFolder("Vegetation");
vegetationFolder.add(map, "treesPerTile", 0, 40, 1).name("trees");
vegetationFolder.add(map, "grassVisible").name("grass");
vegetationFolder.add(map, "grassWindStrength", 0, 6, 0.1).name("wind");

await regenerate();
```

- [ ] **Step 4: Build the global bundle**

Run:

```powershell
npm run build
```

Expected: the build succeeds and `public/js/hex-map.global.js` contains `generateWorld`.

- [ ] **Step 5: Commit the viewer**

Run:

```powershell
git add public/index.html public/demo.css public/demo.js public/js/hex-map.global.js public/js/hex-map.global.js.map
git commit -m "feat: add graphics-only procedural world viewer"
```

Expected: commit succeeds.

### Task 6: Document and verify the deliverable

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add project-specific run instructions at the top of README**

Insert below the `# three-hex-map` heading:

```markdown
## Procedural world demo

This fork starts as a graphics-only Civilization-style world viewer. It keeps the upstream instanced terrain, water, coast, mountain, grass, and forest rendering, and adds deterministic world generation from a seed.

```bash
npm install
npm start
```

Open <http://127.0.0.1:3000>. Use the **World generation** panel to change the seed or dimensions and rebuild the map. The default page does not start units, pathfinding, turns, or fog-of-war gameplay.
```

- [ ] **Step 2: Run the complete automated gate**

Run:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: tests, typecheck, and build exit 0; `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Start the demo server**

Run:

```powershell
npm run server
```

Expected: the static server listens on `http://127.0.0.1:3000`.

- [ ] **Step 4: Exercise the browser flow**

Open `http://127.0.0.1:3000` with the browser validation tool and verify:

```text
1. The route loads a populated hex world rather than a blank canvas.
2. No uncaught error appears in the browser console.
3. Orbit rotation, pan, and zoom change the camera.
4. Hovering a tile updates the bottom-left tile status.
5. Clicking a tile leaves the selector on that cell and shows “已选择”.
6. Changing the seed and activating “Generate world” visibly replaces the terrain.
7. Reusing the original seed recreates the original terrain distribution.
8. Three successive regenerations leave a single canvas and one GUI panel.
```

- [ ] **Step 5: Commit the documentation and generated lock/build changes**

Run:

```powershell
git add README.md package-lock.json public/js/hex-map.global.js public/js/hex-map.global.js.map
git commit -m "docs: describe procedural world demo"
git status --short
```

Expected: commit succeeds and the working tree is clean.

import { GUI } from "./js/vendor/dat.gui.module.js";
import Stats from "./js/vendor/stats.module.js";

const { HexMap, generateWorld, MIN_WORLD_SIZE, MAX_WORLD_SIZE } = window.HexMap;
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

window.worldControls = controls;
window.regenerateWorld = regenerate;

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
        await map.load(nextWorld);
        currentWorld = nextWorld;
        title.textContent = "世界已生成";
        detail.textContent = `${nextWorld.w} × ${nextWorld.h} · seed ${controls.seed}`;
    } catch (error) {
        console.error(error);
        title.textContent = "生成失败";
        detail.textContent = error instanceof Error ? error.message : String(error);
        if (currentWorld) {
            await map.load(currentWorld).catch(restoreError => console.error("Map restore failed", restoreError));
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

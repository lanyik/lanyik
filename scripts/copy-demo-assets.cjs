// Copies the v2 browser entry, Worker, and Three.js peer dependency used by
// public/index.html. Persistence, pathfinding, and simulation remain library
// subpath exports; the demo does not publish duplicate browser copies.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const copies = [
    ["dist/hex-map.global.js", "public/js/hex-map.global.js"],
    ["dist/hex-map.global.js.map", "public/js/hex-map.global.js.map"],
    ["dist/world-generator.worker.mjs", "public/js/world-generator.worker.mjs"],
    ["dist/world-generator.worker.mjs.map", "public/js/world-generator.worker.mjs.map"],
    ["node_modules/three/build/three.module.js", "public/js/vendor/three.module.js"],
    ["node_modules/three/build/three.core.js", "public/js/vendor/three.core.js"],
    ["node_modules/dat.gui/build/dat.gui.module.js", "public/js/vendor/dat.gui.module.js"],
    ["node_modules/dat.gui/build/dat.gui.css", "public/js/vendor/dat.gui.css"]
];

fs.mkdirSync(path.join(root, "public/js/vendor"), { recursive: true });

for (const [from, to] of copies) {
    fs.copyFileSync(path.join(root, from), path.join(root, to));
    console.log(`copied ${from} -> ${to}`);
}

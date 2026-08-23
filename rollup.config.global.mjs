import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const stripTrailingWhitespace = {
    name: "strip-trailing-whitespace",
    renderChunk(code) {
        //Some bundled Three.js addon comments contain trailing spaces. They do
        //not affect source-map line/column locations, so normalize them here
        //and keep generated browser assets clean on every build.
        return { code: code.replace(/[ \t]+$/gm, ""), map: null };
    }
};

// Second-pass bundling: takes the already-transpiled ESM output from tsup
// (dist/hex-map.mjs, where "three" and its addon subpaths - OrbitControls,
// FBXLoader - as well as robust-point-in-polygon were left as unresolved
// imports by esbuild's dependency-externalization defaults) and produces a
// single, self-contained UMD/global script for plain <script> consumers.
//
// Only the bare "three" core package stays external here, mapped to the
// window.THREE global the consumer's own <script> tag provides. Everything
// else (three/examples/jsm addons, robust-point-in-polygon) is resolved from
// node_modules and inlined - a plain <script> consumer has no module system
// to fetch those from separately, and three's addons only ship as ES modules
// (no classic-script builds), so they must be bundled in.
export default {
    input: "dist/hex-map.mjs",
    external: (id) => id === "three",
    plugins: [nodeResolve(), commonjs(), stripTrailingWhitespace],
    output: {
        file: "dist/hex-map.global.js",
        format: "umd",
        name: "HexMap",
        exports: "named",
        sourcemap: true,
        globals: {
            three: "THREE"
        }
    }
};

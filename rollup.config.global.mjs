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
// (dist/hex-map.mjs, where the bare "three" core and ordinary runtime
// dependencies remain unresolved imports) and produces a
// single, self-contained UMD/global script for plain <script> consumers.
//
// Only the bare "three" core package stays external here, mapped to the
// window.THREE global the consumer's own <script> tag provides. Everything
// else (including robust-point-in-polygon) is resolved from
// node_modules and inlined - a plain <script> consumer has no module system
// to fetch those from separately, and three's addons only ship as ES modules
// (no classic-script builds), so they must be bundled in.
export default {
    input: "dist/hex-map.mjs",
    external: (id) => id === "three",
    plugins: [nodeResolve(), commonjs(), stripTrailingWhitespace],
    onwarn(warning, warn) {
        //SkeletonUtils includes retargeting helpers that import SkeletonHelper,
        //while this package only uses clone(). Rollup correctly tree-shakes the
        //retargeting code; silence only that known post-tree-shake external import.
        if (warning.code === "UNUSED_EXTERNAL_IMPORT"
            && warning.exporter === "three"
            && warning.names?.includes("SkeletonHelper")) return;
        warn(warning);
    },
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

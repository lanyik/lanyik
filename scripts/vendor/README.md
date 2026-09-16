# EZ-Tree offline generator

导航：[总导航 · 资产来源与许可](../../docs/README.md#assets) · [按任务阅读](../../docs/README.md#routes)

`ez-tree.mjs` is the unminified, build-only ESM bundle of Daniel Greenheck's MIT
licensed [EZ-Tree](https://github.com/dgreenheck/ez-tree) at commit
`dcf309bd86bd521083d9c70f01f2de45fdc7c457` (license alongside the bundle).
It never ships in the browser. The npm 1.1.0 release predates the deterministic
skeleton/LOD geometry API required by this pipeline, so this source revision is
pinned instead of using the older browser bundle with embedded demo textures.

Reproduce using the project's esbuild: entry `src/lib/tree.js` in that revision,
`bundle: true, format: "esm", platform: "node", external: ["three"]`. The only
addition is the provenance comment at the top; no upstream logic is modified.
Presets and textures have separate byte hashes and attribution in
`apps/survivor/assets/environment/sources.json`.

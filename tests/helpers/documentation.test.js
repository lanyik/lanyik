import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { inspectDocumentation } from "../../scripts/lib/documentation.mjs";

const roots = [];
afterEach(() => {
    for (const root of roots.splice(0)) {
        if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("hex-docs-")) throw new Error("Unexpected fixture directory");
        rmSync(root, { recursive: true });
    }
});
function check(files, listed = Object.keys(files)) {
    const root = mkdtempSync(join(tmpdir(), "hex-docs-")); roots.push(root);
    for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); }
    return inspectDocumentation(root, listed).issues;
}

test("indexes can reach contracts through another guide, including Unicode and duplicate headings", () => {
    expect(check({
        "docs/README.md": "[Game](game/)\n[Source](../src/main.ts)",
        "docs/game/README.md": "[状态](<状态 合同.md#状态-1>)",
        "docs/game/状态 合同.md": "# 状态\n## 状态\n[Home](../README.md)", "src/main.ts": ""
    })).toEqual([]);
});
test("missing files, wrong anchors and unindexed contracts are reported separately", () => {
    const issues = check({ "docs/README.md": "[Gone](gone.md)\n[Wrong](live.md#old)", "docs/live.md": "# New", "docs/orphan.md": "# Orphan" });
    expect(issues).toHaveLength(3);
    expect(issues.join("\n")).toMatch(/missing repository target.*gone/);
    expect(issues.join("\n")).toMatch(/missing heading.*old/);
    expect(issues.join("\n")).toMatch(/orphan.md: unreachable/);
});
test("code examples and external URLs are skipped; reference links and explicit anchors are checked", () => {
    expect(check({ "docs/README.md": "```md\n[Example](missing.md)\n```\n`[Sample](missing.md)`\n[External](https://example.com/missing)\n[Contract][c]\n[c]: contract.md#custom",
        "docs/contract.md": '<a id="custom"></a>\n# Contract' })).toEqual([]);
});
test("invalid encodings and links escaping the repository fail", () => {
    const issues = check({ "docs/README.md": "[Bad](%xx.md)\n[Outside](../../missing.md)" });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("invalid link encoding"); expect(issues[1]).toContain("missing repository target");
});

test("the entry point is required and local ignored files cannot satisfy repository links", () => {
    expect(check({})).toEqual(["docs/README.md: missing documentation entry point"]);
    const issues = check({ "docs/README.md": "[Local only](../scratch.md)", "scratch.md": "# Local" }, ["docs/README.md"]);
    expect(issues).toEqual(["docs/README.md:1: target absent from Git file list: ../scratch.md"]);
});

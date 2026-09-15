import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

function prose(source) {
    let fence;
    return source.split(/\r?\n/).map(line => {
        const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence) {
            if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = undefined;
            return "";
        }
        if (marker) { fence = marker; return ""; }
        return line;
    }).join("\n");
}

function anchors(source) {
    const result = new Set();
    for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
        const base = match[1].replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, "$1").replace(/<[^>]*>/g, "")
            .toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, "").replace(/\s/g, "-");
        let slug = base, suffix = 0;
        while (result.has(slug)) slug = `${base}-${++suffix}`;
        result.add(slug);
    }
    for (const match of source.matchAll(/<(?:a|[hH][1-6])\b[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/g)) result.add(match[1]);
    return result;
}

/** Local Markdown links and document reachability; does not claim to verify prose against code. */
export function inspectDocumentation(root, files) {
    const repositoryFiles = new Set(files);
    const documents = new Map(files.filter(file => file.endsWith(".md") && existsSync(resolve(root, file)))
        .map(file => [file, prose(readFileSync(resolve(root, file), "utf8"))]));
    const headings = new Map([...documents].map(([file, source]) => [file, anchors(source)]));
    const edges = new Map([...documents.keys()].map(file => [file, new Set()]));
    const issues = [];
    if (!documents.has("docs/README.md")) issues.push("docs/README.md: missing documentation entry point");
    for (const [file, source] of documents) {
        const withoutCode = source.replace(/(`+)([^\n]*?)\1/g, match => " ".repeat(match.length));
        // Inline/image links and reference definitions. External links are deliberately offline.
        const links = [...withoutCode.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g),
            ...withoutCode.matchAll(/^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm)];
        for (const match of links) {
            const href = match[1] ?? match[2];
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
            const location = `${file}:${source.slice(0, match.index).split("\n").length}`;
            let path, fragment;
            try {
                const hash = href.indexOf("#"), target = hash < 0 ? href : href.slice(0, hash);
                path = decodeURIComponent(target.split("?")[0]);
                fragment = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
            } catch { issues.push(`${location}: invalid link encoding: ${href}`); continue; }
            const absolute = path ? resolve(path.startsWith("/") ? root : dirname(resolve(root, file)), path.replace(/^\//, "")) : resolve(root, file);
            let target = relative(root, absolute).split(sep).join("/");
            if (target === ".." || target.startsWith("../") || !existsSync(absolute)) {
                issues.push(`${location}: missing repository target: ${href}`); continue;
            }
            if (statSync(absolute).isDirectory()) {
                target = `${target ? `${target}/` : ""}README.md`;
                if (!documents.has(target)) continue;
            } else if (!repositoryFiles.has(target)) {
                issues.push(`${location}: target absent from Git file list: ${href}`); continue;
            }
            if (fragment && headings.has(target) && !headings.get(target).has(fragment)) issues.push(`${location}: missing heading: ${href}`);
            if (documents.has(target)) edges.get(file).add(target);
        }
    }
    const reached = new Set(), pending = ["docs/README.md"];
    while (pending.length) {
        const file = pending.pop();
        if (reached.has(file)) continue;
        reached.add(file);
        for (const target of edges.get(file) ?? []) pending.push(target);
    }
    for (const file of documents.keys()) if (file.startsWith("docs/") && !reached.has(file)) issues.push(`${file}: unreachable from docs/README.md`);
    return { documents: documents.size, issues };
}

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectDocumentation } from "./lib/documentation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))];
const result = inspectDocumentation(root, files);
if (result.issues.length) {
    console.error(result.issues.join("\n"));
    process.exitCode = 1;
} else console.log(`Documentation links and index reachability passed (${result.documents} Markdown files).`);

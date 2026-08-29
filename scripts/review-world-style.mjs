import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("review:world-style must be started through npm");

for (const script of ["review:world-style:metrics", "review:world-style:gallery"]) {
    const result = spawnSync(process.execPath, [npmCli, "run", script], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}


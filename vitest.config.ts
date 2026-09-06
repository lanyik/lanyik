import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: { alias: [{ find: /^three-hex-map$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }] },
    test: {
        include: ["tests/**/*.test.{ts,js}", "apps/expedition/tests/**/*.test.ts"],
        exclude: ["tests/e2e/**"]
    }
});

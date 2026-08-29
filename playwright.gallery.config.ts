import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
    ...baseConfig,
    testDir: "./tests/gallery",
    testMatch: "**/*.pw.ts",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    outputDir: "test-results/world-style-gallery",
    reporter: "list",
    use: {
        ...baseConfig.use,
        viewport: { width: 1280, height: 800 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off"
    }
});


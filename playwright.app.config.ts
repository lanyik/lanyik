import { defineConfig } from "@playwright/test";
import foundation from "./playwright.config";

export default defineConfig({
    ...foundation,
    testDir: "./apps/expedition/tests/e2e",
    outputDir: "test-results/app",
    use: { ...foundation.use, baseURL: "http://127.0.0.1:4174" },
    webServer: {
        command: "npm run app:build && npm run app:preview",
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
});

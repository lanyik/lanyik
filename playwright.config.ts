import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: false,
    workers: 1,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        headless: true,
        viewport: { width: 1280, height: 720 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    projects: [{
        name: "chromium",
        use: {
            ...devices["Desktop Chrome"],
            launchOptions: {
                args: ["--enable-unsafe-swiftshader", "--js-flags=--expose-gc"]
            }
        }
    }],
    webServer: {
        command: "npm run build:demo && npx http-server public -c-1 -p 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
});

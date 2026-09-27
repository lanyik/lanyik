import { defineConfig, devices } from "@playwright/test";

const angleBackend = process.env.PLAYWRIGHT_ANGLE_BACKEND;
if (angleBackend !== undefined && angleBackend !== "d3d11") throw new Error("PLAYWRIGHT_ANGLE_BACKEND supports only d3d11; omit it for the default browser backend");

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
                args: [angleBackend ? `--use-angle=${angleBackend}` : "--enable-unsafe-swiftshader", "--js-flags=--expose-gc"]
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

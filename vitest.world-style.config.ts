import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/world/worldStyleGallery.review.ts"],
        testTimeout: 180_000,
        hookTimeout: 180_000,
        pool: "forks",
        maxWorkers: 1
    }
});


import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    publicDir: ".assets",
    resolve: { dedupe: ["three", "react", "react-dom"] },
    optimizeDeps: { exclude: ["three-hex-map"] },
    build: {
        target: "es2022",
        assetsDir: "bundles",
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        { name: "react", test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/, priority: 30 },
                        { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 20 },
                        { name: "world-runtime", test: /[\\/]dist[\\/]hex-map\.mjs$/, priority: 10 }
                    ]
                }
            }
        }
    }
});

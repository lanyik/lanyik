import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    publicDir: ".assets",
    resolve: { dedupe: ["three", "react", "react-dom"] },
    optimizeDeps: { exclude: ["three-hex-map"] },
    build: { target: "es2022", assetsDir: "bundles" }
});

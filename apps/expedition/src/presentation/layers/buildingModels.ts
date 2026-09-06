import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingId } from "../../content/buildings";

export const BUILDING_MODULES = ["command-core", "command-wing", "miner-head", "miner-base", "warehouse", "solar-array", "power-relay", "battery", "smelter-core", "smelter-port"] as const;
export type BuildingModule = typeof BUILDING_MODULES[number];
export function moduleFor(kind: BuildingId, index: number): BuildingModule {
    return kind === "command-center" ? index === 0 ? "command-core" : "command-wing"
        : kind === "miner" ? index === 0 ? "miner-head" : "miner-base"
            : kind === "smelter" ? index === 0 ? "smelter-core" : "smelter-port" : kind;
}

/** Small reusable, vertex-coloured industrial models. Dimensions are relative to one hex radius. */
export function createBuildingModels(): ReadonlyMap<BuildingModule, BufferGeometry> {
    const models = new Map<BuildingModule, BufferGeometry>();
    for (const role of BUILDING_MODULES) {
        const parts: BufferGeometry[] = [];
        const add = (shape: BufferGeometry, color: string, x: number, y: number, z: number) => {
            const geometry = shape.index ? shape.toNonIndexed() : shape;
            if (geometry !== shape) shape.dispose();
            geometry.deleteAttribute("uv");
            geometry.translate(x, y, z);
            const colors = new Float32Array(geometry.getAttribute("position").count * 3);
            const value = new Color(color);
            for (let i = 0; i < colors.length; i += 3) { colors[i] = value.r; colors[i + 1] = value.g; colors[i + 2] = value.b; }
            geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
            parts.push(geometry);
        };
        const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) =>
            add(new BoxGeometry(w, h, d), color, x, y, z);
        add(new CylinderGeometry(0.83, 0.88, 0.2, 6).rotateY(Math.PI / 6), "#354747", 0, 0.06, 0);
        if (role === "command-core") {
            box(1.0, 0.7, 0.92, "#cbd7cf", 0, 0.49, 0);
            box(1.05, 0.16, 0.98, "#346e70", 0, 0.91, 0);
            box(0.76, 0.2, 0.03, "#73dfdb", 0, 0.59, 0.47);
            box(0.23, 0.4, 0.03, "#213b40", 0, 0.3, -0.47);
            add(new CylinderGeometry(0.025, 0.035, 0.72, 6), "#d8ddd0", 0.27, 1.3, 0.13);
            add(new ConeGeometry(0.2, 0.12, 10).rotateZ(Math.PI / 5), "#e9be73", 0.27, 1.52, 0.13);
        } else if (role === "command-wing") {
            box(1.05, 0.46, 0.8, "#b5c6bd", 0, 0.37, 0);
            box(1.13, 0.09, 0.86, "#2d5e70", 0, 0.66, 0);
            for (const x of [-0.36, 0, 0.36]) box(0.02, 0.02, 0.8, "#78b6bd", x, 0.715, 0);
            box(0.74, 0.12, 0.035, "#78ded4", 0, 0.46, 0.41);
        } else if (role === "miner-head") {
            for (const x of [-0.51, 0.51]) box(0.13, 0.86, 0.17, "#e0ad56", x, 0.55, 0);
            box(1.2, 0.17, 0.25, "#f1bf65", 0, 1.01, 0);
            add(new CylinderGeometry(0.16, 0.16, 0.55, 8), "#7b9293", 0, 0.73, 0);
            add(new ConeGeometry(0.3, 0.44, 8).rotateZ(Math.PI), "#546b71", 0, 0.3, 0);
            box(0.78, 0.08, 0.16, "#ffe3a2", 0, 1.12, 0);
        } else if (role === "miner-base") {
            box(0.88, 0.53, 0.76, "#cf9c4c", 0, 0.42, 0);
            box(0.48, 0.19, 0.55, "#354f53", 0.17, 0.78, 0);
            for (const z of [-0.23, 0, 0.23]) box(0.05, 0.29, 0.09, "#283f42", -0.47, 0.43, z);
            box(0.04, 0.16, 0.26, "#8be1bd", 0.47, 0.47, 0.04);
        } else if (role === "solar-array") {
            for (const x of [-0.4, 0.4]) box(0.08, 0.4, 0.12, "#b4c7c1", x, 0.35, 0);
            add(new BoxGeometry(1.24, 0.09, 1.13).rotateX(-0.25), "#768e9b", 0, 0.61, 0);
            for (const x of [-0.4, 0, 0.4]) for (const z of [-0.34, 0, 0.34])
                add(new BoxGeometry(0.36, 0.025, 0.3).rotateX(-0.25), "#256798", x, 0.68 + z * 0.25, z);
        } else if (role === "power-relay") {
            for (const x of [-0.29, 0.29]) box(0.11, 1.1, 0.11, "#c9c4a2", x, 0.69, 0);
            box(0.7, 0.12, 0.24, "#567c7a", 0, 0.82, 0);
            add(new CylinderGeometry(0.1, 0.2, 1.4, 6), "#819fa1", 0, 0.86, 0);
            for (const y of [1.16, 1.38, 1.6]) add(new CylinderGeometry(0.38, 0.38, 0.065, 12), "#91e4ce", 0, y, 0);
            add(new ConeGeometry(0.16, 0.22, 6), "#d7bd74", 0, 1.77, 0);
        } else if (role === "battery") {
            for (const x of [-0.31, 0.31]) for (const z of [-0.28, 0.28]) {
                add(new CylinderGeometry(0.22, 0.22, 0.73, 8), "#aac7aa", x, 0.54, z);
                add(new CylinderGeometry(0.23, 0.23, 0.09, 8), "#3d7770", x, 0.85, z);
                box(0.1, 0.4, 0.025, "#86e3a8", x, 0.55, z + 0.22);
            }
            box(0.95, 0.11, 0.82, "#476262", 0, 0.98, 0);
        } else if (role === "smelter-core") {
            box(1.04, 0.66, 0.95, "#a49480", 0, 0.46, 0);
            box(1.1, 0.12, 1.01, "#515f67", 0, 0.86, 0);
            for (const x of [-0.32, 0.32]) {
                add(new CylinderGeometry(0.16, 0.21, 0.82, 8), "#7d8f93", x, 1.17, -0.18);
                add(new CylinderGeometry(0.19, 0.19, 0.07, 8), "#d9b17a", x, 1.57, -0.18);
            }
            box(0.62, 0.32, 0.03, "#e99b52", 0, 0.48, 0.49);
            for (const x of [-0.22, 0, 0.22]) box(0.045, 0.36, 0.04, "#475c63", x, 0.48, 0.51);
        } else if (role === "smelter-port") {
            box(1.15, 0.25, 0.71, "#677c83", 0, 0.28, 0);
            for (const x of [-0.43, -0.22, 0, 0.22, 0.43]) box(0.13, 0.09, 0.63, "#b8c7bb", x, 0.46, 0);
            box(0.35, 0.49, 0.31, "#c59c69", -0.3, 0.49, -0.48);
        } else if (role === "warehouse") {
            for (const z of [-0.24, 0.24]) {
                box(1.13, 0.43, 0.39, "#648b9d", 0, 0.37, z);
                box(0.92, 0.33, 0.36, "#91abb2", -0.06, 0.77, z);
                for (const x of [-0.35, 0, 0.35]) box(0.05, 0.42, 0.4, "#c1cdbd", x, 0.37, z);
            }
        }
        const geometry = mergeGeometries(parts);
        if (!geometry) throw new Error(`Could not assemble building model ${role}`);
        for (const part of parts) part.dispose();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        models.set(role, geometry);
    }
    return models;
}

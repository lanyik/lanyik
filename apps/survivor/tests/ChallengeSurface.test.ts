import { expect, test } from "vitest";
import { Mesh, MeshStandardMaterial, Texture } from "three";
import { GroundProjection, collectObject3DResourceAllocations } from "three-hex-map";
import { challengeBank } from "../src/core/ChallengeLayout";
import { ChallengeSurface } from "../src/presentation/ChallengeSurface";

test("authored bank joins water, keeps reachable land flat and releases only owned resources", () => {
    const textures: Record<string, Texture> = {};
    for (const name of ["soil", "grass"]) for (const channel of ["color", "normal", "orm"])
        textures[`scenery/${name}-${channel}.png`] = new Texture({ width: 512, height: 512 });
    const projection = new GroundProjection(32, 128), surface = new ChallengeSurface(textures, projection);
    const ground = surface.root.getObjectByName("challenge-ground") as Mesh;
    const water = surface.root.getObjectByName("challenge-water") as Mesh;
    const vertices = ground.geometry.getAttribute("position");
    let reachable = 0;
    for (let vertex = 0; vertex < vertices.count; vertex++) {
        const x = vertices.getX(vertex), z = vertices.getZ(vertex), y = vertices.getY(vertex);
        expect(y).toBeLessThanOrEqual(0);
        if (x >= challengeBank(z) + 1.2) { expect(y).toBeCloseTo(0, 8); reachable++; }
    }
    expect(reachable).toBeGreaterThan(20_000);
    const river = water.geometry.getAttribute("position");
    for (let vertex = 20; vertex < river.count; vertex += 21) {
        const x = river.getX(vertex), z = river.getZ(vertex);
        expect(x).toBeLessThanOrEqual(challengeBank(z) + .000001);
        expect(x).toBeGreaterThanOrEqual(challengeBank(z) - .161);
        expect(river.getY(vertex)).toBeCloseTo(-.3, 6);
        // The fourth vertex in each ground row is the shared waterline.
        const edge = (vertex - 20) / 21 * 117 + 3;
        expect(vertices.getX(edge)).toBe(x); expect(vertices.getY(edge)).toBe(river.getY(vertex));
    }
    const allocations = collectObject3DResourceAllocations([surface.root]);
    for (const texture of Object.values(textures)) expect(allocations.some(entry => entry.identity === texture)).toBe(true);
    const uv = ground.geometry.getAttribute("uv").array;
    surface.update(12500); surface.update(40000);
    expect(ground.geometry.getAttribute("uv").array).toBe(uv);
    let geometries = 0, materials = 0, images = 0, target = 0;
    for (const mesh of [ground, water]) {
        mesh.geometry.addEventListener("dispose", () => geometries++);
        (mesh.material as MeshStandardMaterial).addEventListener("dispose", () => materials++);
    }
    for (const texture of Object.values(textures)) texture.addEventListener("dispose", () => images++);
    projection.target.addEventListener("dispose", () => target++);
    surface.dispose(); expect([geometries, materials, images, target]).toEqual([2, 2, 0, 0]);
    projection.dispose(); Object.values(textures).forEach(texture => texture.dispose());
});

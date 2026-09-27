import { expect, test, vi } from "vitest";
import { DirectionalLight, PerspectiveCamera, Vector2, Vector3, type WebGLRenderer } from "three";
import { NearShadows } from "../../src/rendering/NearShadows";
import { ResourceBudgetLedger } from "../../src/runtime/ResourceBudget";

test("near shadows keep a bounded allocation and world-anchored texels across movement and rebases", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 0, gpuBytes: 64 * 1024 * 1024 });
    const account = ledger.createAccount("shadow-test"), light = new DirectionalLight();
    const renderer = { capabilities: { maxTextureSize: 4096 }, shadowMap: {} } as WebGLRenderer;
    const shadows = new NearShadows(light, 420, new PerspectiveCamera(), renderer, account);
    expect(account.stats.gpuBytes).toBe(32 * 1024 * 1024);
    shadows.prepare(new Vector3(), new Vector2());
    const point = new Vector3(12, 3, -18), initial = point.clone().applyMatrix4(light.shadow.matrix);
    shadows.prepare(new Vector3(.01, 0, .01), new Vector2());
    const moved = point.clone().applyMatrix4(light.shadow.matrix);
    expect(moved.x).toBeCloseTo(initial.x, 10); expect(moved.y).toBeCloseTo(initial.y, 10);
    const origin = new Vector2(1e8, -1e8), focus = new Vector3(20, 15, 30);
    shadows.prepare(focus, origin);
    const remote = point.clone().applyMatrix4(light.shadow.matrix);
    const shift = new Vector3(1700, 0, -3400);
    origin.add(new Vector2(shift.x, shift.z));
    shadows.prepare(focus.sub(shift), origin);
    const rebased = point.clone().sub(shift).applyMatrix4(light.shadow.matrix);
    expect(rebased.distanceTo(remote)).toBeLessThan(1e-9);
    const dispose = vi.spyOn(shadows.target, "dispose");
    shadows.handleContextLost();
    expect(dispose).toHaveBeenCalledOnce(); expect(account.stats.gpuBytes).toBe(32 * 1024 * 1024);
    expect(light.shadow.map).toBe(shadows.target);
    shadows.dispose(); expect(account.stats.gpuBytes).toBe(0); expect(light.shadow.map).toBeNull();
    account.dispose(); expect(ledger.stats.accounts).toBe(0);
});

test("unsupported shadow allocation is rejected before changing renderer state or reserving resources", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 0, gpuBytes: 1 });
    const account = ledger.createAccount("unsupported");
    const renderer = { capabilities: { maxTextureSize: 1024 }, shadowMap: { enabled: false } } as WebGLRenderer;
    expect(() => new NearShadows(new DirectionalLight(), 420, new PerspectiveCamera(), renderer, account)).toThrow("2048");
    expect(account.stats.reservations).toBe(0); expect(renderer.shadowMap.enabled).toBe(false);
    renderer.capabilities.maxTextureSize = 4096;
    const light = new DirectionalLight(), small = new NearShadows(light, .01, new PerspectiveCamera(), renderer, account);
    expect(light.shadow.camera.far).toBeGreaterThan(light.shadow.camera.near);
    expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    small.dispose(); account.dispose();
});

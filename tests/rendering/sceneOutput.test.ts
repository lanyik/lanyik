import { expect, test, vi } from "vitest";
import { PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from "three";
import { SceneOutput } from "../../src/rendering/SceneOutput";
import { ResourceBudgetLedger } from "../../src/runtime/ResourceBudget";

test("HDR output resizes its pinned allocation without accumulating targets and releases it", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 0, gpuBytes: 1000 });
    const account = ledger.createAccount("output"), output = new SceneOutput(true, account);
    output.resize(100, 50);
    // 5000 pixels: 40KB resolved RGBA16F, 20KB depth, 240KB four-sample color/depth.
    expect(account.stats).toMatchObject({ reservations: 1, pinnedReservations: 1, gpuBytes: 300000, textureBytes: 40000 });
    expect(ledger.stats.gpuExceededBytes).toBe(299000);
    const dispose = vi.spyOn(output.target, "dispose");
    output.resize(100, 50); expect(dispose).not.toHaveBeenCalled();
    output.resize(20, 10); expect(account.stats.gpuBytes).toBe(12000);
    const retained = account.stats;
    output.handleContextLost(); expect(account.stats).toEqual(retained);
    expect(() => output.resize(NaN, 1)).toThrow();
    expect(output.target.width).toBe(20);
    output.dispose(); expect(account.stats).toMatchObject({ reservations: 0, gpuBytes: 0 });
    account.dispose(); expect(ledger.stats.accounts).toBe(0);
});

test("render failure restores the caller's render target and cube/mip selection", () => {
    const ledger = new ResourceBudgetLedger({ cpuBytes: 0, gpuBytes: 1000 });
    const account = ledger.createAccount("output"), output = new SceneOutput(false, account);
    const previous = new WebGLRenderTarget(2, 2), setRenderTarget = vi.fn();
    const renderer = { getRenderTarget: () => previous, getActiveCubeFace: () => 3, getActiveMipmapLevel: () => 2,
        setRenderTarget, render: () => { throw new Error("draw failed"); } } as unknown as WebGLRenderer;
    expect(() => output.render(renderer, new Scene(), new PerspectiveCamera())).toThrow("draw failed");
    expect(setRenderTarget).toHaveBeenLastCalledWith(previous, 3, 2);
    output.dispose(); account.dispose(); previous.dispose();
});

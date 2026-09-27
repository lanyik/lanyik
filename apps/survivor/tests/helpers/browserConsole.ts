const GRAPHICS_WARNING = /WebGL|GL_|THREE\./i;
// Chromium emits this performance notification when screenshots/video read the framebuffer.
const SCREENSHOT_READBACK = /GL Driver Message \(OpenGL, Performance, [^)]*\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/;

// ANGLE/D3D reports PMREM constant folding below double relative machine precision.
// Match every diagnostic and its magnitude; mixed warnings and real shader errors still fail.
function isSubUlpConstantFold(text: string): boolean {
    const prefix = "THREE.WebGLProgram: Program Info Log: ";
    if (!text.startsWith(prefix)) return false;
    const lines = text.slice(prefix.length).replace(/\0/g, "").trim().split("\n");
    return lines.every(line => {
        const match = /^\(\d+,\d+-\d+\): warning X4122: sum of ([\d.e+-]+) and ([\d.e+-]+) cannot be represented accurately in double precision$/.exec(line.trim());
        if (!match) return false;
        const a = Number(match[1]), b = Number(match[2]);
        return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) < Number.EPSILON * Math.abs(a);
    });
}

export function isBrowserConsoleFailure(type: string, text: string): boolean {
    return type === "error" || type === "warning" && GRAPHICS_WARNING.test(text) && !SCREENSHOT_READBACK.test(text) && !isSubUlpConstantFold(text);
}

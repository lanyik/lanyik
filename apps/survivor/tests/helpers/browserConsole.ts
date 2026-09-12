const GRAPHICS_WARNING = /WebGL|GL_|THREE\./i;
// Chromium emits this performance notification when screenshots/video read the framebuffer.
const SCREENSHOT_READBACK = /GL Driver Message \(OpenGL, Performance, [^)]*\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/;

export function isBrowserConsoleFailure(type: string, text: string): boolean {
    return type === "error" || type === "warning" && GRAPHICS_WARNING.test(text) && !SCREENSHOT_READBACK.test(text);
}

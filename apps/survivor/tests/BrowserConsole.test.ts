import { expect, test } from "vitest";
import { isBrowserConsoleFailure } from "./helpers/browserConsole";

test("only sub-ULP ANGLE constant-fold diagnostics are non-fatal", () => {
    const warning = "THREE.WebGLProgram: Program Info Log: (210,81-129): warning X4122: sum of 0.996094 and -2.98545e-017 cannot be represented accurately in double precision\n\n\u0000";
    expect(isBrowserConsoleFailure("warning", warning)).toBe(false);
    expect(isBrowserConsoleFailure("error", warning)).toBe(true);
    expect(isBrowserConsoleFailure("warning", warning.replace("-2.98545e-017", "-0.001"))).toBe(true);
    expect(isBrowserConsoleFailure("warning", warning + "\nwarning: uninitialized variable")).toBe(true);
});

test("only the explicit screenshot readback performance warning is excluded from graphics failures", () => {
    const readback = "[.WebGL-0x123]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";
    expect(isBrowserConsoleFailure("warning", readback)).toBe(false);
    expect(isBrowserConsoleFailure("warning", `${readback} (this message will no longer repeat)`)).toBe(false);
    expect(isBrowserConsoleFailure("error", readback)).toBe(true);
    for (const message of [
        "GL_INVALID_OPERATION : glTexSubImage2D: invalid unpack params combination",
        "GL_OUT_OF_MEMORY", "WebGL context lost", "THREE.WebGLProgram: Shader Error",
        "THREE.WebGLRenderer: Unknown texture format",
        "GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): Another performance warning"
    ]) expect(isBrowserConsoleFailure("warning", message)).toBe(true);
    expect(isBrowserConsoleFailure("error", "Unrelated runtime failure")).toBe(true);
});

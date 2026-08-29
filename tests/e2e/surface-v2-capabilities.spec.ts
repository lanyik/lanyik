import { expect, test } from "@playwright/test";

interface TextureProbe {
    readonly name: string;
    readonly allocationError: number;
    readonly uploadError: number;
}

test("supports the frozen v2 WebGL2 array-texture contract", async ({ page }, testInfo) => {
    await page.setContent('<canvas id="surface-v2-probe" width="1" height="1"></canvas>');
    const result = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("#surface-v2-probe");
        const gl = canvas?.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false
        });
        if (!gl) return { supported: false as const };

        const width = 66;
        const height = 66;
        const layers = 128;
        const probes: TextureProbe[] = [];
        // 66-byte R8 rows are not aligned to WebGL's default of four bytes.
        // DataArrayTexture currently applies the same value, but the v2 pool
        // treats it as an explicit upload contract rather than a library accident.
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        const allocate = (
            name: string,
            internalFormat: number,
            format: number,
            type: number,
            data: ArrayBufferView
        ): WebGLTexture => {
            while (gl.getError() !== gl.NO_ERROR) { /* clear prior errors */ }
            const texture = gl.createTexture();
            if (!texture) throw new Error(`failed to create ${name} texture`);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internalFormat, width, height, layers);
            const allocationError = gl.getError();
            gl.texSubImage3D(
                gl.TEXTURE_2D_ARRAY,
                0,
                0,
                0,
                layers - 1,
                width,
                height,
                1,
                format,
                type,
                data
            );
            probes.push({ name, allocationError, uploadError: gl.getError() });
            return texture;
        };

        const halfFloatLayer = new Uint16Array(width * height);
        halfFloatLayer.fill(0x3c00);
        const heightTexture = allocate("R16F", gl.R16F, gl.RED, gl.HALF_FLOAT, halfFloatLayer);
        const rgbaLayer = new Uint8Array(width * height * 4);
        allocate("RGBA8", gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rgbaLayer);
        const flowLayer = new Int8Array(width * height * 2);
        allocate("RG8_SNORM", gl.RG8_SNORM, gl.RG, gl.BYTE, flowLayer);
        const fogLayer = new Uint8Array(width * height);
        allocate("R8", gl.R8, gl.RED, gl.UNSIGNED_BYTE, fogLayer);

        const compileShader = (type: number, source: string): WebGLShader => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("failed to create shader");
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader) ?? "surface v2 probe shader failed");
            }
            return shader;
        };
        const vertex = compileShader(gl.VERTEX_SHADER, `#version 300 es
            const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
            void main() { gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }
        `);
        const fragment = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
            precision highp float;
            precision highp sampler2DArray;
            uniform sampler2DArray surfaceHeight;
            out vec4 outputColor;
            void main() {
                float value = texelFetch(surfaceHeight, ivec3(65, 65, 127), 0).r;
                outputColor = vec4(value, 0.0, 0.0, 1.0);
            }
        `);
        const program = gl.createProgram();
        if (!program) throw new Error("failed to create surface v2 probe program");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
        const programLog = gl.getProgramInfoLog(program) ?? "";
        const pixel = new Uint8Array(4);
        if (linked) {
            gl.useProgram(program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, heightTexture);
            gl.uniform1i(gl.getUniformLocation(program, "surfaceHeight"), 0);
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            gl.deleteVertexArray(vao);
        }

        const renderer = gl.getExtension("WEBGL_debug_renderer_info");
        return {
            supported: true as const,
            maxArrayTextureLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number,
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
            renderer: renderer
                ? String(gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL))
                : String(gl.getParameter(gl.RENDERER)),
            probes,
            linked,
            programLog,
            sampledPixel: [...pixel],
            finalError: gl.getError()
        };
    });

    await testInfo.attach("surface-v2-webgl2-capabilities.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json"
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.maxArrayTextureLayers).toBeGreaterThanOrEqual(128);
    expect(result.maxTextureSize).toBeGreaterThanOrEqual(66);
    expect(result.probes).toEqual([
        { name: "R16F", allocationError: 0, uploadError: 0 },
        { name: "RGBA8", allocationError: 0, uploadError: 0 },
        { name: "RG8_SNORM", allocationError: 0, uploadError: 0 },
        { name: "R8", allocationError: 0, uploadError: 0 }
    ]);
    expect(result.linked, result.programLog).toBe(true);
    expect(result.sampledPixel).toEqual([255, 0, 0, 255]);
    expect(result.finalError).toBe(0);
});

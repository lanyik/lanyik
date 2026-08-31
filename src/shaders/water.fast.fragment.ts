import { HORIZON_FOG_FRAGMENT_APPLY, HORIZON_FOG_FRAGMENT_HEADER } from "./horizonFog";

export const WATER_FAST_FRAGMENT_SHADER = `
precision highp float;

${HORIZON_FOG_FRAGMENT_HEADER}

uniform sampler2D fogMap;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform vec3 lightDir;
uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;

varying float vBorder;
varying float vPriority;
varying vec3 vNormal;
varying float vShoreT;
varying float vFogState;
varying vec2 vFogUV;

void main() {
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
${HORIZON_FOG_FRAGMENT_APPLY}
        return;
    }

    vec3 fastDeepColor = mix(waterColorDeep, waterColorShallow, 0.45);
    vec3 color = vPriority < 0.5 ? fastDeepColor : waterColorShallow;
    color = mix(color, mix(waterColorShallow, vec3(1.0), 0.42), smoothstep(0.72, 1.0, vShoreT));
    float lambertian = max(dot(normalize(lightDir), normalize(vNormal)), 0.0);
    color *= 0.55 + 0.55 * lambertian;
    if (vFogState < 1.5) color *= fogDarkenFactor;
    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
${HORIZON_FOG_FRAGMENT_APPLY}
}
`;

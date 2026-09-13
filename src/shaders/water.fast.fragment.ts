import { GROUND_PROJECTION_HEADER } from "./groundProjection";
import { HORIZON_FOG_FRAGMENT_APPLY, HORIZON_FOG_FRAGMENT_HEADER } from "./horizonFog";

export const WATER_FAST_FRAGMENT_SHADER = `
precision highp float;
out vec4 waterColor;

${HORIZON_FOG_FRAGMENT_HEADER.replace(/varying /g, "in ")}

${GROUND_PROJECTION_HEADER}

uniform sampler2D fogMap;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform vec3 lightDir;
uniform mat3 normalMatrix;
uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;

in float vBorder;
in float vPriority;
in vec3 vNormal;
in vec3 vWorldPos;
in float vShoreT;
in float vFogState;
in vec2 vFogUV;

void main() {
    if (vFogState < 0.5) {
        waterColor = vec4(texture(fogMap, vFogUV).rgb, 1.0);
${HORIZON_FOG_FRAGMENT_APPLY.replace(/gl_FragColor/g, "waterColor")}
        return;
    }

    vec3 fastDeepColor = mix(waterColorDeep, waterColorShallow, 0.45);
    vec3 color = vPriority < 0.5 ? fastDeepColor : waterColorShallow;
    color = mix(color, mix(waterColorShallow, vec3(1.0), 0.42), smoothstep(0.72, 1.0, vShoreT));
    float lambertian = max(dot(normalize(normalMatrix * lightDir), normalize(vNormal)), 0.0);
    color *= 0.55 + 0.55 * lambertian;
    if (vFogState < 1.5) color *= fogDarkenFactor;
    waterColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        waterColor = mix(vec4(gridColor, 1.0), waterColor, 1.0 - gridOpacity);
    }
    if (vFogState > 1.5) waterColor.rgb = applyGroundProjection(waterColor.rgb, vWorldPos.xz);
${HORIZON_FOG_FRAGMENT_APPLY.replace(/gl_FragColor/g, "waterColor")}
}
`;

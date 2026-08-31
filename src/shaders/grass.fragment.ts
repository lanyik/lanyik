import { HORIZON_FOG_FRAGMENT_APPLY, HORIZON_FOG_FRAGMENT_HEADER } from "./horizonFog";

export const GRASS_FRAGMENT_SHADER = `
precision mediump float;

${HORIZON_FOG_FRAGMENT_HEADER}

uniform vec3 colorBase;
uniform vec3 colorTip;
uniform float fogDarkenFactor;

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

void main() {
    // Unseen: no feature should show at all under the war-fog tile.
    if (vFogState < 0.5) discard;

    vec3 color = mix(colorBase, colorTip, vHeightFactor) * vShade;

    // Explored: keep the blade visible, just darker (mirrors terrain.fragment.ts).
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);
${HORIZON_FOG_FRAGMENT_APPLY}
}
`;

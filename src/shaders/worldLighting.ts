/** The host binds the same sun and prefiltered linear sky used by Standard materials. */
export const WORLD_LIGHTING_HEADER = `
uniform sampler2D worldEnvironment;
uniform mat4 worldLightingCamera;
uniform vec3 worldSunColor;
uniform vec3 worldSunDirection;
#if __VERSION__ >= 300
#define texture2D texture
#endif
#define ENVMAP_TYPE_CUBE_UV
#include <cube_uv_reflection_fragment>

vec3 worldSky(vec3 viewDirection, float roughness) {
    return textureCubeUV(worldEnvironment, mat3(worldLightingCamera) * viewDirection, roughness).rgb;
}
vec3 worldDiffuse(vec3 albedo, vec3 viewNormal, float occlusion) {
    vec3 worldNormal = normalize(mat3(worldLightingCamera) * viewNormal);
    float nl = max(dot(worldNormal, worldSunDirection), 0.0);
    return albedo * (worldSky(viewNormal, 1.0) * occlusion + worldSunColor * (nl / 3.141592653589793));
}
`;

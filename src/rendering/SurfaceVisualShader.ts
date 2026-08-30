// Shared visual-space helpers. Both ground and water use the same analytic
// hex border so the gameplay grid cannot drift or double at layer boundaries.
export const SURFACE_VISUAL_PHASE_PERIOD = 192;

export const SURFACE_VISUAL_GRID_GLSL = /* glsl */`
vec2 surfaceRoundedAxial(vec2 worldPosition) {
    float q = worldPosition.x / 1.5;
    float r = worldPosition.y / 1.7320508075688772 - 0.5 - q * 0.5;
    vec3 cube = vec3(q, -q - r, r);
    vec3 rounded = floor(cube + vec3(0.5));
    vec3 difference = abs(rounded - cube);
    if (difference.x > difference.y && difference.x > difference.z) {
        rounded.x = -rounded.y - rounded.z;
    } else if (difference.y > difference.z) {
        rounded.y = -rounded.x - rounded.z;
    } else {
        rounded.z = -rounded.x - rounded.y;
    }
    return vec2(rounded.x, rounded.z);
}

float surfaceHexBorderDistance(vec2 worldPosition) {
    vec2 axial = surfaceRoundedAxial(worldPosition);
    vec2 center = vec2(
        axial.x * 1.5,
        1.7320508075688772 * (axial.y + axial.x * 0.5 + 0.5)
    );
    vec2 local = abs(worldPosition - center);
    return max(0.0, min(
        0.8660254037844386 - local.y,
        0.8660254037844386 - (0.8660254037844386 * local.x + 0.5 * local.y)
    ));
}

float surfaceHexGridCoverage(vec2 worldPosition, float width) {
    float distanceToBorder = surfaceHexBorderDistance(worldPosition);
    float antialiasWidth = max(fwidth(distanceToBorder), 0.0005);
    return 1.0 - smoothstep(width, width + antialiasWidth, distanceToBorder);
}
`;

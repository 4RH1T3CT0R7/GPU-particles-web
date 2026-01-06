/**
 * Volumetric lighting (God Rays) shader with raymarching
 */

export const volumetricFS = `#version 300 es
precision highp float;

uniform sampler2D u_sceneTex;     // HDR scene texture
uniform sampler2D u_depthTex;     // Depth buffer (if available)
uniform vec2 u_resolution;
uniform vec3 u_lightPositions[8];
uniform vec3 u_lightColors[8];
uniform float u_lightIntensities[8];
uniform int u_lightCount;
uniform mat4 u_invViewProj;
uniform vec3 u_cameraPos;
uniform float u_time;
uniform float u_volumetricStrength;

in vec2 v_uv;
out vec4 o_col;

// ============================================
// Noise for volumetric variation
// ============================================
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash13(i);
    float b = hash13(i + vec3(1.0, 0.0, 0.0));
    float c = hash13(i + vec3(0.0, 1.0, 0.0));
    float d = hash13(i + vec3(1.0, 1.0, 0.0));
    float e = hash13(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
    float g = hash13(i + vec3(0.0, 1.0, 1.0));
    float h = hash13(i + vec3(1.0, 1.0, 1.0));

    float x0 = mix(a, b, f.x);
    float x1 = mix(c, d, f.x);
    float x2 = mix(e, f1, f.x);
    float x3 = mix(g, h, f.x);

    float y0 = mix(x0, x1, f.y);
    float y1 = mix(x2, x3, f.y);

    return mix(y0, y1, f.z);
}

// ============================================
// Volumetric Density Function
// ============================================
float getVolumetricDensity(vec3 pos, float time) {
    // Animated noise for fog variation
    vec3 q = pos * 0.5 + vec3(time * 0.05, 0.0, 0.0);
    float density = noise3d(q) * 0.5 + 0.5;

    // Add second octave
    density += noise3d(q * 2.1 + vec3(0.0, time * 0.03, 0.0)) * 0.25;

    // Falloff from center
    float distFromCenter = length(pos);
    density *= exp(-distFromCenter * 0.15);

    return clamp(density, 0.0, 1.0);
}

// ============================================
// Raymarching for Volumetric Lighting
// ============================================
vec3 calculateVolumetricLight(vec3 rayOrigin, vec3 rayDir, float maxDist) {
    const int STEPS = 32;
    float stepSize = maxDist / float(STEPS);

    vec3 volumetricLight = vec3(0.0);
    vec3 pos = rayOrigin;

    for (int i = 0; i < STEPS; i++) {
        float t = float(i) * stepSize;
        pos = rayOrigin + rayDir * t;

        // Get density at this point
        float density = getVolumetricDensity(pos, u_time);

        // Calculate lighting from each light source
        for (int j = 0; j < u_lightCount && j < 8; j++) {
            vec3 lightDir = u_lightPositions[j] - pos;
            float dist = length(lightDir);
            lightDir /= dist;

            // Light attenuation
            float attenuation = 1.0 / (1.0 + dist * dist * 0.01);

            // Shadow term (simplified - raymarch towards light)
            float shadow = 1.0;
            vec3 shadowPos = pos;
            for (int k = 0; k < 4; k++) {
                shadowPos += lightDir * 0.5;
                float shadowDensity = getVolumetricDensity(shadowPos, u_time);
                shadow *= 1.0 - shadowDensity * 0.5;
            }

            // Accumulate light
            vec3 lightContrib = u_lightColors[j] * u_lightIntensities[j] * attenuation * shadow;
            volumetricLight += lightContrib * density * stepSize * 0.05;
        }

        // Early exit if accumulated enough
        if (length(volumetricLight) > 5.0) break;
    }

    return volumetricLight;
}

// ============================================
// Screen Space to World Position
// ============================================
vec3 getWorldPosition(vec2 uv, float depth) {
    vec4 clipSpace = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 worldSpace = u_invViewProj * clipSpace;
    return worldSpace.xyz / worldSpace.w;
}

// ============================================
// Main
// ============================================
void main() {
    vec2 uv = v_uv;

    // Sample scene color
    vec3 sceneColor = texture(u_sceneTex, uv).rgb;

    // Calculate ray direction in world space
    vec3 nearPos = getWorldPosition(uv, 0.0);
    vec3 farPos = getWorldPosition(uv, 1.0);
    vec3 rayDir = normalize(farPos - nearPos);
    vec3 rayOrigin = u_cameraPos;

    // Raymarch distance
    float maxDist = 15.0;

    // Calculate volumetric lighting
    vec3 volumetricLight = calculateVolumetricLight(rayOrigin, rayDir, maxDist);

    // Blend with scene
    vec3 finalColor = sceneColor + volumetricLight * u_volumetricStrength;

    o_col = vec4(finalColor, 1.0);
}
`;

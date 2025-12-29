/**
 * Physically Based Rendering (PBR) functions
 * Cook-Torrance BRDF implementation
 */

export const pbrFunctions = `
// ============================================
// PBR Constants
// ============================================
const float PI = 3.14159265359;
const float EPSILON = 0.00001;

// ============================================
// Fresnel - Schlick Approximation
// ============================================
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Fresnel with roughness (for IBL)
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// ============================================
// Normal Distribution Function - GGX/Trowbridge-Reitz
// ============================================
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float nom = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return nom / max(denom, EPSILON);
}

// ============================================
// Geometry Function - Smith's Schlick-GGX
// ============================================
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;

    float nom = NdotV;
    float denom = NdotV * (1.0 - k) + k;

    return nom / max(denom, EPSILON);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
}

// ============================================
// Cook-Torrance BRDF
// ============================================
vec3 cookTorranceBRDF(vec3 L, vec3 V, vec3 N, vec3 albedo, float roughness, float metallic) {
    vec3 H = normalize(V + L);

    // Calculate F0 (surface reflection at zero incidence)
    vec3 F0 = vec3(0.04); // Dielectric base reflectivity
    F0 = mix(F0, albedo, metallic);

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
    vec3 specular = numerator / max(denominator, EPSILON);

    // Energy conservation
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallic; // Metallic surfaces don't have diffuse

    float NdotL = max(dot(N, L), 0.0);

    // Final BRDF = diffuse + specular
    return (kD * albedo / PI + specular) * NdotL;
}

// ============================================
// Simple PBR Lighting (single light source)
// ============================================
vec3 calculatePBRLighting(
    vec3 worldPos,
    vec3 normal,
    vec3 viewDir,
    vec3 lightPos,
    vec3 lightColor,
    vec3 albedo,
    float roughness,
    float metallic,
    float ao
) {
    vec3 N = normalize(normal);
    vec3 V = normalize(viewDir);

    // Light direction and attenuation
    vec3 L = normalize(lightPos - worldPos);
    float distance = length(lightPos - worldPos);
    float attenuation = 1.0 / (1.0 + 0.09 * distance + 0.032 * distance * distance);
    vec3 radiance = lightColor * attenuation;

    // BRDF
    vec3 brdf = cookTorranceBRDF(L, V, N, albedo, roughness, metallic);

    // Final lighting
    vec3 Lo = brdf * radiance;

    // Ambient (simplified)
    vec3 ambient = vec3(0.03) * albedo * ao;

    return ambient + Lo;
}

// ============================================
// Multi-light PBR (up to 8 lights)
// ============================================
struct Light {
    vec3 position;
    vec3 color;
    float intensity;
    float radius;
};

vec3 calculateMultiLightPBR(
    vec3 worldPos,
    vec3 normal,
    vec3 viewDir,
    Light lights[8],
    int lightCount,
    vec3 albedo,
    float roughness,
    float metallic,
    float ao
) {
    vec3 N = normalize(normal);
    vec3 V = normalize(viewDir);

    vec3 Lo = vec3(0.0);

    // Calculate per-light contribution
    for (int i = 0; i < lightCount && i < 8; i++) {
        vec3 L = normalize(lights[i].position - worldPos);
        float distance = length(lights[i].position - worldPos);

        // Attenuation with configurable radius
        float attenuation = 1.0 / (1.0 + distance * distance / (lights[i].radius * lights[i].radius));
        attenuation = clamp(attenuation, 0.0, 1.0);

        vec3 radiance = lights[i].color * lights[i].intensity * attenuation;

        // BRDF
        vec3 brdf = cookTorranceBRDF(L, V, N, albedo, roughness, metallic);

        Lo += brdf * radiance;
    }

    // Ambient
    vec3 ambient = vec3(0.03) * albedo * ao;

    return ambient + Lo;
}

// ============================================
// Enhanced Fresnel for particles (rim lighting)
// ============================================
float enhancedFresnel(vec3 normal, vec3 viewDir, float power, float scale, float bias) {
    float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    return bias + scale * pow(fresnel, power);
}

// ============================================
// Subsurface scattering approximation
// ============================================
vec3 subsurfaceScattering(vec3 lightDir, vec3 viewDir, vec3 normal, vec3 thickness, vec3 baseColor) {
    // Simplified translucency
    vec3 H = normalize(lightDir + normal * 0.5);
    float VdotH = pow(clamp(dot(viewDir, -H), 0.0, 1.0), 4.0);
    float scatter = VdotH * 0.5;

    return baseColor * scatter * (1.0 - thickness);
}
`;

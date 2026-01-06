// ============================================
// PBR (Physically Based Rendering) Functions
// Cook-Torrance BRDF Implementation
// ============================================

// ============================================
// Fresnel - Schlick Approximation
// ============================================

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

fn fresnelSchlickRoughness(cosTheta: f32, F0: vec3<f32>, roughness: f32) -> vec3<f32> {
    return F0 + (max(vec3<f32>(1.0 - roughness), F0) - F0) * pow(saturate(1.0 - cosTheta), 5.0);
}

// ============================================
// Normal Distribution Function - GGX/Trowbridge-Reitz
// ============================================

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;

    let nom = a2;
    var denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return nom / max(denom, EPSILON);
}

// ============================================
// Geometry Function - Smith's Schlick-GGX
// ============================================

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;

    let nom = NdotV;
    let denom = NdotV * (1.0 - k) + k;

    return nom / max(denom, EPSILON);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2 = geometrySchlickGGX(NdotV, roughness);
    let ggx1 = geometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
}

// ============================================
// Cook-Torrance BRDF
// ============================================

struct BRDFResult {
    diffuse: vec3<f32>,
    specular: vec3<f32>,
    kD: vec3<f32>,
    kS: vec3<f32>,
}

fn cookTorranceBRDF(
    L: vec3<f32>,
    V: vec3<f32>,
    N: vec3<f32>,
    albedo: vec3<f32>,
    roughness: f32,
    metallic: f32
) -> BRDFResult {
    let H = normalize(V + L);

    // Calculate F0 (surface reflection at zero incidence)
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, albedo, metallic);

    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
    let specular = numerator / max(denominator, EPSILON);

    // Energy conservation
    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - metallic; // Metallic surfaces don't have diffuse

    var result: BRDFResult;
    result.diffuse = kD * albedo / PI;
    result.specular = specular;
    result.kD = kD;
    result.kS = kS;

    return result;
}

// ============================================
// PBR Direct Lighting (Single Light)
// ============================================

fn calculateDirectLighting(
    worldPos: vec3<f32>,
    normal: vec3<f32>,
    viewDir: vec3<f32>,
    lightPos: vec3<f32>,
    lightColor: vec3<f32>,
    lightIntensity: f32,
    lightRadius: f32,
    albedo: vec3<f32>,
    roughness: f32,
    metallic: f32,
    ao: f32
) -> vec3<f32> {
    let N = normalize(normal);
    let V = normalize(viewDir);
    let L = normalize(lightPos - worldPos);

    // Distance and attenuation
    let distance = length(lightPos - worldPos);
    let attenuation = 1.0 / (1.0 + distance * distance / (lightRadius * lightRadius));
    let radiance = lightColor * lightIntensity * attenuation;

    // BRDF
    let brdf = cookTorranceBRDF(L, V, N, albedo, roughness, metallic);
    let NdotL = max(dot(N, L), 0.0);

    // Final lighting
    return (brdf.diffuse + brdf.specular) * radiance * NdotL;
}

// ============================================
// PBR Ambient Lighting (IBL approximation)
// ============================================

fn calculateAmbientLighting(
    normal: vec3<f32>,
    viewDir: vec3<f32>,
    albedo: vec3<f32>,
    roughness: f32,
    metallic: f32,
    ao: f32
) -> vec3<f32> {
    let N = normalize(normal);
    let V = normalize(viewDir);

    // F0
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, albedo, metallic);

    // Simplified IBL
    let F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - metallic;

    // Ambient color (simplified - could be from environment map)
    let ambientColor = vec3<f32>(0.03, 0.035, 0.04);
    let diffuse = kD * albedo * ambientColor;
    let specular = F * ambientColor * (1.0 - roughness);

    return (diffuse + specular) * ao;
}

// ============================================
// Enhanced Fresnel for rim lighting
// ============================================

fn enhancedFresnel(normal: vec3<f32>, viewDir: vec3<f32>, power: f32, scale: f32, bias: f32) -> f32 {
    let fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    return bias + scale * pow(fresnel, power);
}

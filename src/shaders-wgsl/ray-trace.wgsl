// ============================================
// Ray Tracing Compute Shader
// BVH Traversal + Ray-Sphere Intersection
// ============================================

// ============================================
// Structures
// ============================================

struct Ray {
    origin: vec3<f32>,
    _pad0: f32,
    direction: vec3<f32>,
    _pad1: f32,
}

struct Hit {
    hit: bool,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    position: vec3<f32>,
    distance: f32,
    normal: vec3<f32>,
    particleIdx: u32,
}

struct Particle {
    position: vec3<f32>,
    radius: f32,
    velocity: vec3<f32>,
    _pad: f32,
}

struct BVHNode {
    min: vec3<f32>,
    leftChild: i32,    // if < 0, leaf node (particle index = -leftChild - 1)
    max: vec3<f32>,
    rightChild: i32,
}

struct Light {
    position: vec3<f32>,
    _pad0: f32,
    color: vec3<f32>,
    intensity: f32,
    radius: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

struct RayTraceParams {
    cameraPos: vec3<f32>,
    _pad0: f32,
    cameraForward: vec3<f32>,
    _pad1: f32,
    cameraRight: vec3<f32>,
    _pad2: f32,
    cameraUp: vec3<f32>,
    fov: f32,

    lightCount: u32,
    particleCount: u32,
    maxBounces: u32,
    samplesPerPixel: u32,

    time: f32,
    frameCount: u32,
    _pad3: u32,
    _pad4: u32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var<uniform> params: RayTraceParams;
@group(0) @binding(4) var outputTex: texture_storage_2d<rgba16float, write>;

// ============================================
// Ray-Sphere Intersection
// ============================================

fn raySphereIntersect(ray: Ray, center: vec3<f32>, radius: f32) -> f32 {
    let oc = ray.origin - center;
    let a = dot(ray.direction, ray.direction);
    let b = 2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - 4.0 * a * c;

    if (discriminant < 0.0) {
        return -1.0; // No intersection
    }

    let sqrtD = sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2.0 * a);
    let t2 = (-b + sqrtD) / (2.0 * a);

    // Return closest positive intersection
    if (t1 > 0.001) {
        return t1;
    } else if (t2 > 0.001) {
        return t2;
    }

    return -1.0;
}

// ============================================
// Ray-AABB Intersection
// ============================================

fn rayAABBIntersect(ray: Ray, boxMin: vec3<f32>, boxMax: vec3<f32>) -> bool {
    let invDir = 1.0 / ray.direction;
    let t0 = (boxMin - ray.origin) * invDir;
    let t1 = (boxMax - ray.origin) * invDir;

    let tmin = min(t0, t1);
    let tmax = max(t0, t1);

    let tenter = max(max(tmin.x, tmin.y), tmin.z);
    let texit = min(min(tmax.x, tmax.y), tmax.z);

    return tenter <= texit && texit > 0.001;
}

// ============================================
// BVH Traversal (Iterative)
// ============================================

const MAX_STACK_SIZE: u32 = 32u;

fn traceBVH(ray: Ray) -> Hit {
    var hit: Hit;
    hit.hit = false;
    hit.distance = 1e10;

    // Stack for iterative traversal
    var stack: array<i32, MAX_STACK_SIZE>;
    var stackPtr = 0i;
    stack[0] = 0; // Start with root node

    while (stackPtr >= 0) {
        let nodeIdx = stack[stackPtr];
        stackPtr -= 1;

        if (nodeIdx < 0 || nodeIdx >= i32(arrayLength(&bvhNodes))) {
            continue;
        }

        let node = bvhNodes[nodeIdx];

        // Check AABB intersection
        if (!rayAABBIntersect(ray, node.min, node.max)) {
            continue;
        }

        // Leaf node (contains particle)
        if (node.leftChild < 0) {
            let particleIdx = u32(-node.leftChild - 1);
            if (particleIdx < params.particleCount) {
                let particle = particles[particleIdx];
                let t = raySphereIntersect(ray, particle.position, particle.radius);

                if (t > 0.0 && t < hit.distance) {
                    hit.hit = true;
                    hit.distance = t;
                    hit.position = ray.origin + ray.direction * t;
                    hit.normal = normalize(hit.position - particle.position);
                    hit.particleIdx = particleIdx;
                }
            }
        }
        // Internal node
        else {
            // Push children to stack
            if (node.rightChild >= 0 && stackPtr < i32(MAX_STACK_SIZE) - 1) {
                stackPtr += 1;
                stack[stackPtr] = node.rightChild;
            }
            if (node.leftChild >= 0 && stackPtr < i32(MAX_STACK_SIZE) - 1) {
                stackPtr += 1;
                stack[stackPtr] = node.leftChild;
            }
        }
    }

    return hit;
}

// ============================================
// Shadow Ray Test
// ============================================

fn traceShadowRay(ray: Ray, maxDist: f32) -> bool {
    // Quick shadow test - just check if any intersection exists
    var stack: array<i32, MAX_STACK_SIZE>;
    var stackPtr = 0i;
    stack[0] = 0;

    while (stackPtr >= 0) {
        let nodeIdx = stack[stackPtr];
        stackPtr -= 1;

        if (nodeIdx < 0 || nodeIdx >= i32(arrayLength(&bvhNodes))) {
            continue;
        }

        let node = bvhNodes[nodeIdx];

        if (!rayAABBIntersect(ray, node.min, node.max)) {
            continue;
        }

        // Leaf node
        if (node.leftChild < 0) {
            let particleIdx = u32(-node.leftChild - 1);
            if (particleIdx < params.particleCount) {
                let particle = particles[particleIdx];
                let t = raySphereIntersect(ray, particle.position, particle.radius);

                if (t > 0.001 && t < maxDist) {
                    return true; // Shadow hit
                }
            }
        }
        // Internal node
        else {
            if (node.rightChild >= 0 && stackPtr < i32(MAX_STACK_SIZE) - 1) {
                stackPtr += 1;
                stack[stackPtr] = node.rightChild;
            }
            if (node.leftChild >= 0 && stackPtr < i32(MAX_STACK_SIZE) - 1) {
                stackPtr += 1;
                stack[stackPtr] = node.leftChild;
            }
        }
    }

    return false; // No shadow
}

// ============================================
// Direct Lighting with Shadows
// ============================================

fn calculateDirectLighting(hit: Hit, viewDir: vec3<f32>, albedo: vec3<f32>, roughness: f32, metallic: f32) -> vec3<f32> {
    var lighting = vec3<f32>(0.0);

    // Ambient
    lighting += albedo * 0.03;

    // For each light
    for (var i = 0u; i < params.lightCount; i++) {
        let light = lights[i];
        let lightDir = light.position - hit.position;
        let lightDist = length(lightDir);
        let L = normalize(lightDir);

        // Shadow ray
        var shadowRay: Ray;
        shadowRay.origin = hit.position + hit.normal * 0.001; // Bias to avoid self-intersection
        shadowRay.direction = L;

        let inShadow = traceShadowRay(shadowRay, lightDist);

        if (!inShadow) {
            // Attenuation
            let attenuation = 1.0 / (1.0 + lightDist * lightDist / (light.radius * light.radius));

            // Simple Lambertian + specular
            let NdotL = max(dot(hit.normal, L), 0.0);
            let diffuse = albedo * NdotL;

            // Specular (Blinn-Phong approximation)
            let H = normalize(L + viewDir);
            let NdotH = max(dot(hit.normal, H), 0.0);
            let spec = pow(NdotH, (1.0 - roughness) * 128.0) * (1.0 - roughness);
            let specular = vec3<f32>(spec) * metallic;

            lighting += (diffuse + specular) * light.color * light.intensity * attenuation;
        }
    }

    return lighting;
}

// ============================================
// Path Tracing (1 bounce GI approximation)
// ============================================

fn hash13(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

fn randomHemisphere(normal: vec3<f32>, seed: vec3<f32>) -> vec3<f32> {
    // Simple cosine-weighted hemisphere sampling
    let h1 = hash13(seed);
    let h2 = hash13(seed + vec3<f32>(12.9898, 78.233, 37.719));

    let phi = 2.0 * 3.14159 * h1;
    let cosTheta = sqrt(h2);
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    let localDir = vec3<f32>(
        cos(phi) * sinTheta,
        sin(phi) * sinTheta,
        cosTheta
    );

    // Transform to world space
    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(normal.y) < 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);

    return normalize(tangent * localDir.x + bitangent * localDir.y + normal * localDir.z);
}

// ============================================
// Material Properties from Particle Data
// ============================================

struct Material {
    albedo: vec3<f32>,
    roughness: f32,
    metallic: f32,
    emissive: f32,
}

fn getMaterial(particleIdx: u32) -> Material {
    var mat: Material;

    // Generate material properties based on particle index
    let hash = hash13(vec3<f32>(f32(particleIdx), f32(particleIdx * 7), f32(particleIdx * 13)));

    // Varied albedo
    let hue = hash;
    mat.albedo = vec3<f32>(
        0.6 + 0.3 * sin(hue * 6.28 + 0.0),
        0.5 + 0.3 * sin(hue * 6.28 + 2.09),
        0.5 + 0.3 * sin(hue * 6.28 + 4.18)
    );

    // Varied roughness (some particles shiny, some rough)
    mat.roughness = 0.2 + 0.6 * hash13(vec3<f32>(f32(particleIdx * 3), 0.0, 0.0));

    // Some particles more metallic
    mat.metallic = select(0.1, 0.8, hash13(vec3<f32>(f32(particleIdx * 5), 0.0, 0.0)) > 0.7);

    // Occasional emissive particles
    mat.emissive = select(0.0, 2.0, hash13(vec3<f32>(f32(particleIdx * 11), 0.0, 0.0)) > 0.95);

    return mat;
}

// ============================================
// Importance sampling for specular reflections
// ============================================

fn importanceSampleGGX(normal: vec3<f32>, roughness: f32, seed: vec3<f32>) -> vec3<f32> {
    let h1 = hash13(seed);
    let h2 = hash13(seed + vec3<f32>(41.234, 71.543, 23.876));

    let a = roughness * roughness;
    let phi = 2.0 * 3.14159 * h1;
    let cosTheta = sqrt((1.0 - h2) / (1.0 + (a * a - 1.0) * h2));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    let localDir = vec3<f32>(
        cos(phi) * sinTheta,
        sin(phi) * sinTheta,
        cosTheta
    );

    // Transform to world space
    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(normal.y) < 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);

    return normalize(tangent * localDir.x + bitangent * localDir.y + normal * localDir.z);
}

// ============================================
// Main Ray Tracing
// ============================================

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(outputTex);
    let pixelCoord = global_id.xy;

    if (pixelCoord.x >= texSize.x || pixelCoord.y >= texSize.y) {
        return;
    }

    // Generate primary ray
    let uv = (vec2<f32>(pixelCoord) + 0.5) / vec2<f32>(texSize);
    let ndc = uv * 2.0 - 1.0;
    let aspect = f32(texSize.x) / f32(texSize.y);

    let fovScale = tan(params.fov * 0.5);
    let rayDir = normalize(
        params.cameraForward +
        params.cameraRight * ndc.x * aspect * fovScale +
        params.cameraUp * ndc.y * fovScale
    );

    var ray: Ray;
    ray.origin = params.cameraPos;
    ray.direction = rayDir;

    // Trace primary ray
    let hit = traceBVH(ray);

    var color = vec3<f32>(0.0);

    if (hit.hit) {
        let viewDir = -rayDir;

        // Get material properties from particle
        let material = getMaterial(hit.particleIdx);

        // Add emissive contribution
        color += material.albedo * material.emissive;

        // Direct lighting with shadows
        color += calculateDirectLighting(hit, viewDir, material.albedo, material.roughness, material.metallic);

        // Path tracing: 1-bounce Global Illumination with importance sampling
        let seed = vec3<f32>(f32(pixelCoord.x), f32(pixelCoord.y), params.time);

        // Mix diffuse and specular sampling based on roughness
        let useDiffuse = hash13(seed + vec3<f32>(99.9, 0.0, 0.0)) > material.metallic;
        var bounceDir: vec3<f32>;

        if (useDiffuse) {
            // Diffuse bounce (cosine-weighted hemisphere)
            bounceDir = randomHemisphere(hit.normal, seed);
        } else {
            // Specular bounce (importance sampled GGX)
            let halfVector = importanceSampleGGX(hit.normal, material.roughness, seed);
            bounceDir = reflect(rayDir, halfVector);

            // Ensure bounce is above surface
            if (dot(bounceDir, hit.normal) < 0.0) {
                bounceDir = randomHemisphere(hit.normal, seed);
            }
        }

        var bounceRay: Ray;
        bounceRay.origin = hit.position + hit.normal * 0.001;
        bounceRay.direction = bounceDir;
        let bounceHit = traceBVH(bounceRay);

        if (bounceHit.hit) {
            // Get bounced surface material
            let bounceMaterial = getMaterial(bounceHit.particleIdx);

            // Indirect lighting contribution
            let NdotL = max(dot(hit.normal, bounceDir), 0.0);
            let brdf = material.albedo / 3.14159; // Lambertian BRDF
            let indirectLight = brdf * NdotL * 2.0; // Hemisphere integral approximation

            // Add emissive from bounced surface
            let bounceEmissive = bounceMaterial.albedo * bounceMaterial.emissive;

            // Combined indirect contribution
            color += (indirectLight * bounceMaterial.albedo + bounceEmissive) * 0.4;
        } else {
            // Bounce ray hit sky - add ambient contribution
            let NdotL = max(dot(hit.normal, bounceDir), 0.0);
            let skyColor = mix(vec3<f32>(0.03, 0.04, 0.08), vec3<f32>(0.06, 0.08, 0.15), bounceDir.y * 0.5 + 0.5);
            color += material.albedo * skyColor * NdotL * 0.3;
        }
    } else {
        // Sky/background gradient
        let t = 0.5 * (rayDir.y + 1.0);
        color = mix(vec3<f32>(0.02, 0.03, 0.07), vec3<f32>(0.05, 0.07, 0.12), t);
    }

    // Write output
    textureStore(outputTex, pixelCoord, vec4<f32>(color, 1.0));
}

/**
 * Assembled WGSL shader source strings.
 * Combines shared snippets with per-shader unique code.
 * Replaces runtime fetch() of .wgsl files.
 */

import {
  STRUCT_PARTICLE,
  STRUCT_BVH_NODE,
  STRUCT_SIM_PARAMS,
  STRUCT_LIGHT,
  STRUCT_RAY_TRACE_PARAMS,
  STRUCT_LBVH_PARAMS,
  STRUCT_TEMPORAL_PARAMS,
  FN_HASH13,
  FN_NOISE3D,
} from './snippets.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// Particle Simulation Compute Shader
// ═══════════════════════════════════════════════════════════════════════════════

export const particleSimShader: string = /* wgsl */`
${STRUCT_PARTICLE}
${STRUCT_SIM_PARAMS}

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(2) var<uniform> params: SimParams;

${FN_HASH13}
${FN_NOISE3D}

// ── Shape Functions ──────────────────────────────────────────────────────────

fn getShapeTarget(idx: u32, shapeId: u32) -> vec3<f32> {
    let hash = hash13(vec3<f32>(f32(idx) * 0.1));
    let t = f32(idx) / f32(params.particleCount);

    if (shapeId == 0u) {
        let angle = t * 3.14159 * 2.0;
        let height = (hash - 0.5) * 4.0;
        let radius = 2.0 + (hash - 0.5) * 0.5;
        return vec3<f32>(cos(angle) * radius, height, sin(angle) * radius);
    } else if (shapeId == 1u) {
        let phi = 3.14159 * hash;
        let theta = 2.0 * 3.14159 * t;
        let r = 3.0;
        return vec3<f32>(r * sin(phi) * cos(theta), r * cos(phi), r * sin(phi) * sin(theta));
    } else if (shapeId == 2u) {
        let angle1 = t * 3.14159 * 2.0;
        let angle2 = hash * 3.14159 * 2.0;
        let R = 2.5;
        let r = 1.0;
        return vec3<f32>((R + r * cos(angle2)) * cos(angle1), r * sin(angle2), (R + r * cos(angle2)) * sin(angle1));
    }

    return vec3<f32>(0.0);
}

// ── Force Calculations ───────────────────────────────────────────────────────

fn calculateForces(pos: vec3<f32>, vel: vec3<f32>, idx: u32) -> vec3<f32> {
    var acc = vec3<f32>(0.0);

    // Curl noise flow field
    let flowScale = 0.3;
    let flowSpeed = params.time * 0.2;
    let q = pos * flowScale + vec3<f32>(flowSpeed, 0.0, 0.0);
    let n1 = noise3d(q);
    let n2 = noise3d(q + vec3<f32>(123.4, 567.8, 901.2));
    let n3 = noise3d(q + vec3<f32>(234.5, 678.9, 012.3));
    let flow = vec3<f32>(n1, n2, n3) * 2.0 - 1.0;
    acc += flow * 0.8;

    acc.y -= 0.04;

    let targetA = getShapeTarget(idx, params.shapeA);
    let targetB = getShapeTarget(idx, params.shapeB);
    let targetPos = mix(targetA, targetB, params.morph);

    let toTarget = targetPos - pos;
    let distToTarget = length(toTarget);
    if (distToTarget > 0.01) {
        let springForce = normalize(toTarget) * distToTarget * params.shapeStrength;
        acc += springForce;
    }

    if (params.pointerActive > 0.5) {
        let toPointer = params.pointerPos - pos;
        let dist = length(toPointer);

        if (dist < params.pointerRadius && dist > 0.01) {
            let strength = params.pointerStrength * (1.0 - dist / params.pointerRadius);

            if (params.pointerMode == 0u) {
                acc += normalize(toPointer) * strength;
            } else if (params.pointerMode == 1u) {
                acc -= normalize(toPointer) * strength;
            } else if (params.pointerMode == 2u) {
                let tangent = cross(normalize(toPointer), vec3<f32>(0.0, 1.0, 0.0));
                acc += tangent * strength * 2.0;
            }
        }
    }

    acc += vec3<f32>(0.0, params.audioBass * 0.5, 0.0);
    acc.x += sin(params.time + pos.y) * params.audioMid * 0.3;
    acc.z += cos(params.time + pos.x) * params.audioMid * 0.3;

    acc -= vel * 0.15;

    return acc;
}

// ── Main ─────────────────────────────────────────────────────────────────────

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= params.particleCount) { return; }

    let particle = particlesIn[idx];
    var pos = particle.position;
    var vel = particle.velocity;

    let acc = calculateForces(pos, vel, idx);

    vel += acc * params.deltaTime * params.speedMultiplier;
    pos += vel * params.deltaTime * params.speedMultiplier;

    particlesOut[idx].position = pos;
    particlesOut[idx].radius = particle.radius;
    particlesOut[idx].velocity = vel;
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LBVH Build Compute Shader (Morton codes + Bitonic sort + Karras 2012)
// ═══════════════════════════════════════════════════════════════════════════════

export const bvhLbvhShader: string = /* wgsl */`
${STRUCT_PARTICLE}
${STRUCT_BVH_NODE}
${STRUCT_LBVH_PARAMS}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read_write> mortonKeys: array<u32>;
@group(0) @binding(3) var<storage, read_write> mortonVals: array<u32>;
@group(0) @binding(4) var<storage, read_write> atomicFlags: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> parentOf: array<i32>;

@group(1) @binding(0) var<uniform> params: LBVHParams;

const SCENE_MIN = vec3<f32>(-10.0, -10.0, -10.0);
const SCENE_EXTENT = vec3<f32>(20.0, 20.0, 20.0);

var<workgroup> localKeys: array<u32, 256>;
var<workgroup> localVals: array<u32, 256>;

fn expandBits(v: u32) -> u32 {
    var x = v & 0x3FFu;
    x = (x | (x << 16u)) & 0x30000FFu;
    x = (x | (x << 8u)) & 0x300F00Fu;
    x = (x | (x << 4u)) & 0x30C30C3u;
    x = (x | (x << 2u)) & 0x9249249u;
    return x;
}

fn morton3D(pos: vec3<u32>) -> u32 {
    return (expandBits(pos.x) << 2u) | (expandBits(pos.y) << 1u) | expandBits(pos.z);
}

@compute @workgroup_size(256)
fn computeMortonCodes(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.particleCount) { return; }

    let p = particles[idx].position;
    let normalized = clamp((p - SCENE_MIN) / SCENE_EXTENT, vec3<f32>(0.0), vec3<f32>(0.999));
    let quantized = vec3<u32>(normalized * 1024.0);

    mortonKeys[idx] = morton3D(quantized);
    mortonVals[idx] = idx;
}

@compute @workgroup_size(256)
fn bitonicSortLocal(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>) {
    let globalIdx = gid.x;
    let i = lid.x;

    if (globalIdx < params.particleCount) {
        localKeys[i] = mortonKeys[globalIdx];
        localVals[i] = mortonVals[globalIdx];
    } else {
        localKeys[i] = 0xFFFFFFFFu;
        localVals[i] = 0u;
    }
    workgroupBarrier();

    for (var stage = 0u; stage < 8u; stage++) {
        var step = stage;
        loop {
            let j = i ^ (1u << step);
            if (j > i && j < 256u) {
                let ascending = ((i >> (stage + 1u)) & 1u) == 0u;
                let swap = select(localKeys[i] < localKeys[j], localKeys[i] > localKeys[j], ascending);
                if (swap) {
                    let tk = localKeys[i]; localKeys[i] = localKeys[j]; localKeys[j] = tk;
                    let tv = localVals[i]; localVals[i] = localVals[j]; localVals[j] = tv;
                }
            }
            workgroupBarrier();
            if (step == 0u) { break; }
            step -= 1u;
        }
    }

    if (globalIdx < params.particleCount) {
        mortonKeys[globalIdx] = localKeys[i];
        mortonVals[globalIdx] = localVals[i];
    }
}

@compute @workgroup_size(256)
fn bitonicSortGlobal(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.particleCount) { return; }

    let j = i ^ (1u << params.sortStep);
    if (j <= i || j >= params.particleCount) { return; }

    let ascending = ((i >> (params.sortStage + 1u)) & 1u) == 0u;
    let ki = mortonKeys[i];
    let kj = mortonKeys[j];
    let shouldSwap = select(ki < kj, ki > kj, ascending);

    if (shouldSwap) {
        mortonKeys[i] = kj;
        mortonKeys[j] = ki;
        let vi = mortonVals[i];
        let vj = mortonVals[j];
        mortonVals[i] = vj;
        mortonVals[j] = vi;
    }
}

@compute @workgroup_size(256)
fn buildLeaves(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sortedIdx = gid.x;
    if (sortedIdx >= params.particleCount) { return; }

    let particleIdx = mortonVals[sortedIdx];
    let p = particles[particleIdx];
    let r = p.radius;

    let leafIdx = params.particleCount - 1u + sortedIdx;
    bvhNodes[leafIdx].min = p.position - vec3<f32>(r);
    bvhNodes[leafIdx].max = p.position + vec3<f32>(r);
    bvhNodes[leafIdx].leftChild = -i32(particleIdx) - 1;
    bvhNodes[leafIdx].rightChild = -1;

    atomicStore(&atomicFlags[leafIdx], 0u);
    if (sortedIdx < params.particleCount - 1u) {
        atomicStore(&atomicFlags[sortedIdx], 0u);
    }
}

fn delta(i: i32, j: i32) -> i32 {
    if (j < 0 || j >= i32(params.particleCount)) {
        return -1;
    }
    let ki = mortonKeys[u32(i)];
    let kj = mortonKeys[u32(j)];
    if (ki == kj) {
        return i32(32u + countLeadingZeros(u32(i) ^ u32(j)));
    }
    return i32(countLeadingZeros(ki ^ kj));
}

@compute @workgroup_size(256)
fn buildInternalNodes(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.particleCount - 1u) { return; }

    let i = i32(idx);
    let n = i32(params.particleCount);

    let d = select(-1i, 1i, delta(i, i + 1) >= delta(i, i - 1));

    let deltaMin = delta(i, i - d);
    var lMax = 2i;
    while (delta(i, i + lMax * d) > deltaMin) {
        lMax *= 2;
        if (lMax > n) { break; }
    }

    var l = 0i;
    var t = lMax >> 1;
    while (t >= 1) {
        if (delta(i, i + (l + t) * d) > deltaMin) {
            l += t;
        }
        t >>= 1;
    }
    let j = i + l * d;

    let first = min(i, j);
    let last = max(i, j);
    let deltaNode = delta(first, last);

    var split = first;
    var step = last - first;
    loop {
        step = (step + 1) / 2;
        let newSplit = split + step;
        if (newSplit < last && delta(first, newSplit) > deltaNode) {
            split = newSplit;
        }
        if (step <= 1) { break; }
    }

    let N = i32(params.particleCount);
    var leftChild: i32;
    if (first == split) {
        leftChild = split + N - 1;
    } else {
        leftChild = split;
    }

    var rightChild: i32;
    if (last == split + 1) {
        rightChild = split + 1 + N - 1;
    } else {
        rightChild = split + 1;
    }

    bvhNodes[idx].leftChild = leftChild;
    bvhNodes[idx].rightChild = rightChild;

    parentOf[u32(leftChild)] = i32(idx);
    parentOf[u32(rightChild)] = i32(idx);

    if (idx == 0u) {
        parentOf[0] = -1;
    }
}

@compute @workgroup_size(256)
fn computeNodeBounds(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sortedIdx = gid.x;
    if (sortedIdx >= params.particleCount) { return; }

    let leafIdx = params.particleCount - 1u + sortedIdx;
    var nodeIdx = parentOf[leafIdx];

    while (nodeIdx >= 0) {
        let old = atomicAdd(&atomicFlags[u32(nodeIdx)], 1u);
        if (old == 0u) { return; }

        let node = bvhNodes[u32(nodeIdx)];
        let leftNode = bvhNodes[u32(node.leftChild)];
        let rightNode = bvhNodes[u32(node.rightChild)];

        bvhNodes[u32(nodeIdx)].min = min(leftNode.min, rightNode.min);
        bvhNodes[u32(nodeIdx)].max = max(leftNode.max, rightNode.max);

        nodeIdx = parentOf[u32(nodeIdx)];
    }
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Ray Tracing Compute Shader
// ═══════════════════════════════════════════════════════════════════════════════

export const rayTraceShader: string = /* wgsl */`
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

${STRUCT_PARTICLE}
${STRUCT_BVH_NODE}
${STRUCT_LIGHT}
${STRUCT_RAY_TRACE_PARAMS}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> lights: array<Light>;
@group(0) @binding(3) var<uniform> params: RayTraceParams;
@group(0) @binding(4) var outputTex: texture_storage_2d<rgba16float, write>;

// ── Ray Intersection ─────────────────────────────────────────────────────────

fn raySphereIntersect(ray: Ray, center: vec3<f32>, radius: f32) -> f32 {
    let oc = ray.origin - center;
    let a = dot(ray.direction, ray.direction);
    let b = 2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - 4.0 * a * c;

    if (discriminant < 0.0) { return -1.0; }

    let sqrtD = sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2.0 * a);
    let t2 = (-b + sqrtD) / (2.0 * a);

    if (t1 > 0.001) { return t1; }
    else if (t2 > 0.001) { return t2; }

    return -1.0;
}

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

// ── BVH Traversal ────────────────────────────────────────────────────────────

const MAX_STACK_SIZE: u32 = 32u;

fn traceBVH(ray: Ray) -> Hit {
    var hit: Hit;
    hit.hit = false;
    hit.distance = 1e10;

    var stack: array<i32, MAX_STACK_SIZE>;
    var stackPtr = 0i;
    stack[0] = 0;

    while (stackPtr >= 0) {
        let nodeIdx = stack[stackPtr];
        stackPtr -= 1;

        if (nodeIdx < 0 || nodeIdx >= i32(arrayLength(&bvhNodes))) { continue; }

        let node = bvhNodes[nodeIdx];

        if (!rayAABBIntersect(ray, node.min, node.max)) { continue; }

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
        } else {
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

fn traceShadowRay(ray: Ray, maxDist: f32) -> bool {
    var stack: array<i32, MAX_STACK_SIZE>;
    var stackPtr = 0i;
    stack[0] = 0;

    while (stackPtr >= 0) {
        let nodeIdx = stack[stackPtr];
        stackPtr -= 1;

        if (nodeIdx < 0 || nodeIdx >= i32(arrayLength(&bvhNodes))) { continue; }

        let node = bvhNodes[nodeIdx];

        if (!rayAABBIntersect(ray, node.min, node.max)) { continue; }

        if (node.leftChild < 0) {
            let particleIdx = u32(-node.leftChild - 1);
            if (particleIdx < params.particleCount) {
                let particle = particles[particleIdx];
                let t = raySphereIntersect(ray, particle.position, particle.radius);

                if (t > 0.001 && t < maxDist) {
                    return true;
                }
            }
        } else {
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

    return false;
}

// ── Lighting ─────────────────────────────────────────────────────────────────

fn calculateDirectLighting(hit: Hit, viewDir: vec3<f32>, albedo: vec3<f32>, roughness: f32, metallic: f32) -> vec3<f32> {
    var lighting = vec3<f32>(0.0);
    lighting += albedo * 0.03;

    for (var i = 0u; i < params.lightCount; i++) {
        let light = lights[i];
        let lightDir = light.position - hit.position;
        let lightDist = length(lightDir);
        let L = normalize(lightDir);

        var shadowRay: Ray;
        shadowRay.origin = hit.position + hit.normal * 0.001;
        shadowRay.direction = L;

        let inShadow = traceShadowRay(shadowRay, lightDist);

        if (!inShadow) {
            let attenuation = 1.0 / (1.0 + lightDist * lightDist / (light.radius * light.radius));
            let NdotL = max(dot(hit.normal, L), 0.0);
            let diffuse = albedo * NdotL;

            let H = normalize(L + viewDir);
            let NdotH = max(dot(hit.normal, H), 0.0);
            let spec = pow(NdotH, (1.0 - roughness) * 128.0) * (1.0 - roughness);
            let specular = vec3<f32>(spec) * metallic;

            lighting += (diffuse + specular) * light.color * light.intensity * attenuation;
        }
    }

    return lighting;
}

// ── Sampling ─────────────────────────────────────────────────────────────────

${FN_HASH13}

fn randomHemisphere(normal: vec3<f32>, seed: vec3<f32>) -> vec3<f32> {
    let h1 = hash13(seed);
    let h2 = hash13(seed + vec3<f32>(12.9898, 78.233, 37.719));

    let phi = 2.0 * 3.14159 * h1;
    let cosTheta = sqrt(h2);
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    let localDir = vec3<f32>(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(normal.y) < 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);

    return normalize(tangent * localDir.x + bitangent * localDir.y + normal * localDir.z);
}

// ── Material ─────────────────────────────────────────────────────────────────

struct Material {
    albedo: vec3<f32>,
    roughness: f32,
    metallic: f32,
    emissive: f32,
}

fn getMaterial(particleIdx: u32) -> Material {
    var mat: Material;
    let hash = hash13(vec3<f32>(f32(particleIdx), f32(particleIdx * 7), f32(particleIdx * 13)));

    let hue = hash;
    mat.albedo = vec3<f32>(
        0.6 + 0.3 * sin(hue * 6.28 + 0.0),
        0.5 + 0.3 * sin(hue * 6.28 + 2.09),
        0.5 + 0.3 * sin(hue * 6.28 + 4.18)
    );

    mat.roughness = 0.2 + 0.6 * hash13(vec3<f32>(f32(particleIdx * 3), 0.0, 0.0));
    mat.metallic = select(0.1, 0.8, hash13(vec3<f32>(f32(particleIdx * 5), 0.0, 0.0)) > 0.7);
    mat.emissive = select(0.0, 2.0, hash13(vec3<f32>(f32(particleIdx * 11), 0.0, 0.0)) > 0.95);

    return mat;
}

fn importanceSampleGGX(normal: vec3<f32>, roughness: f32, seed: vec3<f32>) -> vec3<f32> {
    let h1 = hash13(seed);
    let h2 = hash13(seed + vec3<f32>(41.234, 71.543, 23.876));

    let a = roughness * roughness;
    let phi = 2.0 * 3.14159 * h1;
    let cosTheta = sqrt((1.0 - h2) / (1.0 + (a * a - 1.0) * h2));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    let localDir = vec3<f32>(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(normal.y) < 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);

    return normalize(tangent * localDir.x + bitangent * localDir.y + normal * localDir.z);
}

// ── Main ─────────────────────────────────────────────────────────────────────

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(outputTex);
    let pixelCoord = global_id.xy;

    if (pixelCoord.x >= texSize.x || pixelCoord.y >= texSize.y) { return; }

    let pixelSeed = vec3<f32>(f32(pixelCoord.x), f32(pixelCoord.y), params.time * 100.0 + f32(params.frameCount));
    let jitterX = hash13(pixelSeed) - 0.5;
    let jitterY = hash13(pixelSeed + vec3<f32>(57.13, 91.71, 0.0)) - 0.5;
    let uv = (vec2<f32>(pixelCoord) + 0.5 + vec2<f32>(jitterX, jitterY)) / vec2<f32>(texSize);
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

    let hit = traceBVH(ray);

    var color = vec3<f32>(0.0);

    if (hit.hit) {
        let viewDir = -rayDir;
        let material = getMaterial(hit.particleIdx);

        color += material.albedo * material.emissive;
        color += calculateDirectLighting(hit, viewDir, material.albedo, material.roughness, material.metallic);

        let seed = vec3<f32>(f32(pixelCoord.x), f32(pixelCoord.y), params.time);

        let useDiffuse = hash13(seed + vec3<f32>(99.9, 0.0, 0.0)) > material.metallic;
        var bounceDir: vec3<f32>;

        if (useDiffuse) {
            bounceDir = randomHemisphere(hit.normal, seed);
        } else {
            let halfVector = importanceSampleGGX(hit.normal, material.roughness, seed);
            bounceDir = reflect(rayDir, halfVector);

            if (dot(bounceDir, hit.normal) < 0.0) {
                bounceDir = randomHemisphere(hit.normal, seed);
            }
        }

        var bounceRay: Ray;
        bounceRay.origin = hit.position + hit.normal * 0.001;
        bounceRay.direction = bounceDir;
        let bounceHit = traceBVH(bounceRay);

        if (bounceHit.hit) {
            let bounceMaterial = getMaterial(bounceHit.particleIdx);
            let NdotL = max(dot(hit.normal, bounceDir), 0.0);
            let brdf = material.albedo / 3.14159;
            let indirectLight = brdf * NdotL * 2.0;
            let bounceEmissive = bounceMaterial.albedo * bounceMaterial.emissive;
            color += (indirectLight * bounceMaterial.albedo + bounceEmissive) * 0.4;
        } else {
            let NdotL = max(dot(hit.normal, bounceDir), 0.0);
            let skyColor = mix(vec3<f32>(0.03, 0.04, 0.08), vec3<f32>(0.06, 0.08, 0.15), bounceDir.y * 0.5 + 0.5);
            color += material.albedo * skyColor * NdotL * 0.3;
        }
    } else {
        let t = 0.5 * (rayDir.y + 1.0);
        color = mix(vec3<f32>(0.02, 0.03, 0.07), vec3<f32>(0.05, 0.07, 0.12), t);
    }

    textureStore(outputTex, pixelCoord, vec4<f32>(color, 1.0));
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Temporal Accumulation Compute Shader
// ═══════════════════════════════════════════════════════════════════════════════

export const temporalAccumulationShader: string = /* wgsl */`
${STRUCT_TEMPORAL_PARAMS}

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var historyFrame: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> params: TemporalParams;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(currentFrame);
    let coord = global_id.xy;

    if (coord.x >= texSize.x || coord.y >= texSize.y) { return; }

    let currentColor = textureLoad(currentFrame, coord, 0).rgb;
    let historyColor = textureLoad(historyFrame, coord, 0).rgb;

    var outputColor: vec3<f32>;

    if (params.reset == 1u || params.frameCount == 0u) {
        outputColor = currentColor;
    } else {
        let alpha = params.alpha;
        outputColor = mix(historyColor, currentColor, alpha);
    }

    textureStore(outputTex, coord, vec4<f32>(outputColor, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn progressive(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(currentFrame);
    let coord = global_id.xy;

    if (coord.x >= texSize.x || coord.y >= texSize.y) { return; }

    let currentColor = textureLoad(currentFrame, coord, 0).rgb;
    let historyColor = textureLoad(historyFrame, coord, 0).rgb;

    var outputColor: vec3<f32>;

    if (params.reset == 1u) {
        outputColor = currentColor;
    } else {
        let N = f32(params.frameCount);
        outputColor = (historyColor * N + currentColor) / (N + 1.0);
    }

    textureStore(outputTex, coord, vec4<f32>(outputColor, 1.0));
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Blit Shader — HDR tone mapping + gamma correction
// ═══════════════════════════════════════════════════════════════════════════════

export const blitShader: string = /* wgsl */`
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);
    output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, y);
    return output;
}

fn acesToneMapping(color: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn reinhardToneMapping(color: vec3<f32>) -> vec3<f32> {
    return color / (vec3<f32>(1.0) + color);
}

@group(0) @binding(0) var rayTracedTexture: texture_2d<f32>;
@group(0) @binding(1) var texSampler: sampler;

struct Uniforms {
    exposure: f32,
    gamma: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var hdrColor = textureSample(rayTracedTexture, texSampler, input.uv).rgb;
    hdrColor *= pow(2.0, uniforms.exposure);
    var color = acesToneMapping(hdrColor);
    color = pow(color, vec3<f32>(1.0 / uniforms.gamma));
    return vec4<f32>(color, 1.0);
}
`;

// ============================================
// BVH Construction Compute Shader
// Linear BVH (LBVH) for dynamic scenes
// ============================================

struct Particle {
    position: vec3<f32>,
    radius: f32,
    velocity: vec3<f32>,
    _pad: f32,
}

struct BVHNode {
    min: vec3<f32>,
    leftChild: i32,
    max: vec3<f32>,
    rightChild: i32,
}

struct AABB {
    min: vec3<f32>,
    _pad0: f32,
    max: vec3<f32>,
    _pad1: f32,
}

struct MortonCode {
    code: u32,
    index: u32,
    _pad0: u32,
    _pad1: u32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read_write> aabbs: array<AABB>;
@group(0) @binding(3) var<storage, read_write> mortonCodes: array<MortonCode>;
@group(0) @binding(4) var<uniform> particleCount: u32;

// ============================================
// Compute Scene AABB
// ============================================

@compute @workgroup_size(256)
fn computeAABBs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;

    if (idx >= particleCount) {
        return;
    }

    let particle = particles[idx];
    let r = particle.radius;

    aabbs[idx].min = particle.position - vec3<f32>(r);
    aabbs[idx].max = particle.position + vec3<f32>(r);
}

// ============================================
// Compute Morton Codes
// ============================================

fn expandBits(v: u32) -> u32 {
    var x = v & 0x3FFu;
    x = (x | (x << 16)) & 0x30000FFu;
    x = (x | (x << 8)) & 0x300F00Fu;
    x = (x | (x << 4)) & 0x30C30C3u;
    x = (x | (x << 2)) & 0x9249249u;
    return x;
}

fn morton3D(x: u32, y: u32, z: u32) -> u32 {
    return (expandBits(x) << 2) | (expandBits(y) << 1) | expandBits(z);
}

@compute @workgroup_size(256)
fn computeMortonCodes(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @group(1) @binding(0) var<uniform> sceneMin: vec3<f32>,
    @group(1) @binding(1) var<uniform> sceneMax: vec3<f32>
) {
    let idx = global_id.x;

    if (idx >= particleCount) {
        return;
    }

    let particle = particles[idx];
    let sceneSize = sceneMax - sceneMin;

    // Normalize position to [0, 1]
    let normalized = (particle.position - sceneMin) / sceneSize;

    // Convert to [0, 1023] for 10-bit Morton code
    let quantized = vec3<u32>(
        u32(clamp(normalized.x, 0.0, 0.999) * 1024.0),
        u32(clamp(normalized.y, 0.0, 0.999) * 1024.0),
        u32(clamp(normalized.z, 0.0, 0.999) * 1024.0)
    );

    mortonCodes[idx].code = morton3D(quantized.x, quantized.y, quantized.z);
    mortonCodes[idx].index = idx;
}

// ============================================
// Build BVH from sorted Morton codes
// ============================================

fn commonUpperBits(i: u32, j: u32) -> i32 {
    if (j < 0 || j >= particleCount) {
        return -1;
    }

    let code_i = mortonCodes[i].code;
    let code_j = mortonCodes[j].code;

    if (code_i == code_j) {
        return 32 + countLeadingZeros(i ^ j);
    }

    return countLeadingZeros(code_i ^ code_j);
}

fn findSplit(first: u32, last: u32) -> u32 {
    let firstCode = mortonCodes[first].code;
    let lastCode = mortonCodes[last].code;

    if (firstCode == lastCode) {
        return (first + last) >> 1u;
    }

    let commonPrefix = countLeadingZeros(firstCode ^ lastCode);

    var split = first;
    var step = last - first;

    loop {
        step = (step + 1u) >> 1u;
        if (step == 0u) {
            break;
        }

        let newSplit = split + step;

        if (newSplit < last) {
            let splitCode = mortonCodes[newSplit].code;
            let splitPrefix = countLeadingZeros(firstCode ^ splitCode);

            if (splitPrefix > commonPrefix) {
                split = newSplit;
            }
        }
    }

    return split;
}

@compute @workgroup_size(256)
fn buildBVH(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;

    if (idx >= particleCount - 1u) {
        return;
    }

    // Determine range
    let d = select(1i, -1i, commonUpperBits(idx, idx + 1u) > commonUpperBits(idx, idx - 1u));

    let delta_min = commonUpperBits(idx, idx - u32(d));
    var l_max = 2u;

    loop {
        if (commonUpperBits(idx, idx + u32(d) * l_max) <= delta_min) {
            break;
        }
        l_max *= 2u;
    }

    var l = 0u;
    for (var t = l_max >> 1u; t > 0u; t >>= 1u) {
        if (commonUpperBits(idx, idx + u32(d) * (l + t)) > delta_min) {
            l += t;
        }
    }

    let j = idx + u32(d) * l;

    // Find split position
    let gamma = findSplit(min(idx, j), max(idx, j));

    // Assign children
    let leftChild = select(gamma, i32(gamma + particleCount - 1u), gamma == min(idx, j));
    let rightChild = select(gamma + 1u, i32(gamma + 1u + particleCount - 1u), gamma + 1u == max(idx, j));

    bvhNodes[idx].leftChild = leftChild;
    bvhNodes[idx].rightChild = i32(rightChild);

    // Compute AABB (would need reduction/atomics for bottom-up)
    // For now, this is a placeholder - actual AABB computation needs another pass
}

// ============================================
// Compute Node AABBs (Bottom-up)
// ============================================

@compute @workgroup_size(256)
fn computeNodeAABBs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;

    if (idx >= particleCount - 1u) {
        return;
    }

    let node = bvhNodes[idx];

    var nodeMin = vec3<f32>(1e10);
    var nodeMax = vec3<f32>(-1e10);

    // If leaf
    if (node.leftChild < 0) {
        let particleIdx = u32(-node.leftChild - 1);
        nodeMin = aabbs[particleIdx].min;
        nodeMax = aabbs[particleIdx].max;
    } else {
        // Merge children AABBs
        let leftNode = bvhNodes[node.leftChild];
        let rightNode = bvhNodes[node.rightChild];

        nodeMin = min(leftNode.min, rightNode.min);
        nodeMax = max(leftNode.max, rightNode.max);
    }

    bvhNodes[idx].min = nodeMin;
    bvhNodes[idx].max = nodeMax;
}

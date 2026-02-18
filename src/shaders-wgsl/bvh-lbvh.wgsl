// LBVH Construction — Morton codes + Bitonic sort + Karras 2012

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

struct LBVHParams {
    particleCount: u32,
    sortStage: u32,
    sortStep: u32,
    _pad: u32,
}

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

// Morton code helpers
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

// 1. Compute Morton Codes
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

// 2. Bitonic Sort — Local (stages 0-7, 256 elements per workgroup)
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

// 3. Bitonic Sort — Global (one step per dispatch)
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

// 4. Build Leaf Nodes (from sorted order)
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

// 5. Build Internal Nodes (Karras 2012)
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

    // Determine direction
    let d = select(-1i, 1i, delta(i, i + 1) >= delta(i, i - 1));

    // Upper bound for range length
    let deltaMin = delta(i, i - d);
    var lMax = 2i;
    while (delta(i, i + lMax * d) > deltaMin) {
        lMax *= 2;
        if (lMax > n) { break; }
    }

    // Binary search for other end
    var l = 0i;
    var t = lMax >> 1;
    while (t >= 1) {
        if (delta(i, i + (l + t) * d) > deltaMin) {
            l += t;
        }
        t >>= 1;
    }
    let j = i + l * d;

    // Find split position
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

    // Assign children
    let N = i32(params.particleCount);
    var leftChild: i32;
    if (first == split) {
        leftChild = split + N - 1; // leaf
    } else {
        leftChild = split; // internal
    }

    var rightChild: i32;
    if (last == split + 1) {
        rightChild = split + 1 + N - 1; // leaf
    } else {
        rightChild = split + 1; // internal
    }

    bvhNodes[idx].leftChild = leftChild;
    bvhNodes[idx].rightChild = rightChild;

    parentOf[u32(leftChild)] = i32(idx);
    parentOf[u32(rightChild)] = i32(idx);

    if (idx == 0u) {
        parentOf[0] = -1;
    }
}

// 6. Bottom-up AABB Propagation
@compute @workgroup_size(256)
fn computeNodeBounds(@builtin(global_invocation_id) gid: vec3<u32>) {
    let sortedIdx = gid.x;
    if (sortedIdx >= params.particleCount) { return; }

    let leafIdx = params.particleCount - 1u + sortedIdx;
    var nodeIdx = parentOf[leafIdx];

    while (nodeIdx >= 0) {
        let old = atomicAdd(&atomicFlags[u32(nodeIdx)], 1u);
        if (old == 0u) { return; } // first child, wait

        let node = bvhNodes[u32(nodeIdx)];
        let leftNode = bvhNodes[u32(node.leftChild)];
        let rightNode = bvhNodes[u32(node.rightChild)];

        bvhNodes[u32(nodeIdx)].min = min(leftNode.min, rightNode.min);
        bvhNodes[u32(nodeIdx)].max = max(leftNode.max, rightNode.max);

        nodeIdx = parentOf[u32(nodeIdx)];
    }
}

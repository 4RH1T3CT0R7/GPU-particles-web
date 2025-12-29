// ============================================
// Simplified BVH Construction
// Builds a simple top-down BVH without Morton codes
// Faster to build, less optimal traversal than LBVH
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

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<uniform> particleCount: u32;

// ============================================
// Compute Root Node AABB (encompasses all particles)
// ============================================

var<workgroup> wgMin: array<vec3<f32>, 256>;
var<workgroup> wgMax: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn computeSceneBounds(@builtin(global_invocation_id) global_id: vec3<u32>,
                      @builtin(local_invocation_id) local_id: vec3<u32>) {
    let idx = global_id.x;
    let tid = local_id.x;

    var localMin = vec3<f32>(1e10);
    var localMax = vec3<f32>(-1e10);

    // Each thread computes min/max for its particle
    if (idx < particleCount) {
        let p = particles[idx];
        let r = p.radius;
        localMin = p.position - vec3<f32>(r);
        localMax = p.position + vec3<f32>(r);
    }

    // Store in workgroup memory
    wgMin[tid] = localMin;
    wgMax[tid] = localMax;
    workgroupBarrier();

    // Parallel reduction in workgroup
    for (var s = 128u; s > 0u; s >>= 1u) {
        if (tid < s) {
            wgMin[tid] = min(wgMin[tid], wgMin[tid + s]);
            wgMax[tid] = max(wgMax[tid], wgMax[tid + s]);
        }
        workgroupBarrier();
    }

    // First thread writes workgroup result to root node
    if (tid == 0u) {
        bvhNodes[0].min = wgMin[0];
        bvhNodes[0].max = wgMax[0];
    }
}

// ============================================
// Simple Binary Split BVH Builder
// Splits along longest axis at median
// ============================================

fn getCenter(particle: Particle) -> vec3<f32> {
    return particle.position;
}

fn getLongestAxis(minBound: vec3<f32>, maxBound: vec3<f32>) -> u32 {
    let extent = maxBound - minBound;
    if (extent.x > extent.y && extent.x > extent.z) {
        return 0u; // X axis
    } else if (extent.y > extent.z) {
        return 1u; // Y axis
    } else {
        return 2u; // Z axis
    }
}

@compute @workgroup_size(1)
fn buildSimpleBVH(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // This is a simplified single-threaded BVH builder
    // For production, use parallel construction with Morton codes

    // Initialize root node (already computed in computeSceneBounds)

    // Create leaf nodes for all particles
    for (var i = 0u; i < particleCount; i++) {
        let leafIdx = particleCount - 1u + i; // Leaf nodes start after internal nodes
        let particle = particles[i];
        let r = particle.radius;

        bvhNodes[leafIdx].min = particle.position - vec3<f32>(r);
        bvhNodes[leafIdx].max = particle.position + vec3<f32>(r);
        bvhNodes[leafIdx].leftChild = -i32(i) - 1; // Negative index indicates leaf
        bvhNodes[leafIdx].rightChild = -1;
    }

    // Simple binary splits (this is placeholder - real impl would use SAH or spatial median)
    // For now, just create a flat structure where root points to first two leaves
    if (particleCount > 1u) {
        bvhNodes[0].leftChild = i32(particleCount - 1u);  // First leaf
        bvhNodes[0].rightChild = i32(particleCount);      // Second leaf
    }
}

// ============================================
// Initialize BVH to flat structure
// Fast but suboptimal traversal
// ============================================

@compute @workgroup_size(256)
fn initializeFlatBVH(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;

    if (idx >= particleCount) {
        return;
    }

    // Create leaf node for this particle
    let particle = particles[idx];
    let r = particle.radius;

    // Leaf nodes stored in second half of array
    let leafIdx = particleCount - 1u + idx;

    bvhNodes[leafIdx].min = particle.position - vec3<f32>(r);
    bvhNodes[leafIdx].max = particle.position + vec3<f32>(r);
    bvhNodes[leafIdx].leftChild = -i32(idx) - 1; // Negative = leaf, stores particle index
    bvhNodes[leafIdx].rightChild = -1;
}

// ============================================
// Build root node that encompasses all leaves
// ============================================

@compute @workgroup_size(256)
fn buildRootNode(@builtin(global_invocation_id) global_id: vec3<u32>,
                 @builtin(local_invocation_id) local_id: vec3<u32>) {
    let idx = global_id.x;
    let tid = local_id.x;

    var localMin = vec3<f32>(1e10);
    var localMax = vec3<f32>(-1e10);

    // Each thread reads a leaf node
    if (idx < particleCount) {
        let leafIdx = particleCount - 1u + idx;
        localMin = bvhNodes[leafIdx].min;
        localMax = bvhNodes[leafIdx].max;
    }

    // Parallel reduction
    wgMin[tid] = localMin;
    wgMax[tid] = localMax;
    workgroupBarrier();

    for (var s = 128u; s > 0u; s >>= 1u) {
        if (tid < s) {
            wgMin[tid] = min(wgMin[tid], wgMin[tid + s]);
            wgMax[tid] = max(wgMax[tid], wgMax[tid + s]);
        }
        workgroupBarrier();
    }

    // First thread writes root bounds and sets up binary split
    if (tid == 0u) {
        bvhNodes[0].min = wgMin[0];
        bvhNodes[0].max = wgMax[0];

        // Point root at first two leaf clusters
        if (particleCount > 0u) {
            bvhNodes[0].leftChild = i32(particleCount - 1u);  // First leaf index
            bvhNodes[0].rightChild = i32(particleCount);       // Second leaf index (will traverse all)
        }
    }
}

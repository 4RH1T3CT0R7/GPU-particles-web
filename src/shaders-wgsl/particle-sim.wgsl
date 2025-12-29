// ============================================
// Particle Simulation Compute Shader
// ============================================

struct Particle {
    position: vec3<f32>,
    _pad0: f32,
    velocity: vec3<f32>,
    _pad1: f32,
}

struct SimParams {
    deltaTime: f32,
    time: f32,
    particleCount: u32,
    speedMultiplier: f32,

    shapeA: u32,
    shapeB: u32,
    morph: f32,
    shapeStrength: f32,

    pointerPos: vec3<f32>,
    pointerStrength: f32,

    pointerRadius: f32,
    pointerMode: u32,
    pointerActive: f32,
    pointerPress: f32,

    audioBass: f32,
    audioMid: f32,
    audioTreble: f32,
    audioEnergy: f32,
}

@group(0) @binding(0) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(2) var<uniform> params: SimParams;

// Include common functions
// Note: In actual implementation, these would be included from common.wgsl
// For now, we'll define minimal versions here

fn hash13(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

fn noise3d(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let ff = f * f * (3.0 - 2.0 * f);

    let a = hash13(i);
    let b = hash13(i + vec3<f32>(1.0, 0.0, 0.0));
    let c = hash13(i + vec3<f32>(0.0, 1.0, 0.0));
    let d = hash13(i + vec3<f32>(1.0, 1.0, 0.0));
    let e = hash13(i + vec3<f32>(0.0, 0.0, 1.0));
    let f1 = hash13(i + vec3<f32>(1.0, 0.0, 1.0));
    let g = hash13(i + vec3<f32>(0.0, 1.0, 1.0));
    let h = hash13(i + vec3<f32>(1.0, 1.0, 1.0));

    let x0 = mix(a, b, ff.x);
    let x1 = mix(c, d, ff.x);
    let x2 = mix(e, f1, ff.x);
    let x3 = mix(g, h, ff.x);

    let y0 = mix(x0, x1, ff.y);
    let y1 = mix(x2, x3, ff.y);

    return mix(y0, y1, ff.z);
}

// ============================================
// Shape Functions
// ============================================

fn getShapeTarget(idx: u32, shapeId: u32) -> vec3<f32> {
    let hash = hash13(vec3<f32>(f32(idx) * 0.1));
    let t = f32(idx) / f32(params.particleCount);

    // Shape 0: Cube
    if (shapeId == 0u) {
        let angle = t * 3.14159 * 2.0;
        let height = (hash - 0.5) * 4.0;
        let radius = 2.0 + (hash - 0.5) * 0.5;
        return vec3<f32>(
            cos(angle) * radius,
            height,
            sin(angle) * radius
        );
    }

    // Shape 1: Sphere
    else if (shapeId == 1u) {
        let phi = 3.14159 * hash;
        let theta = 2.0 * 3.14159 * t;
        let r = 3.0;
        return vec3<f32>(
            r * sin(phi) * cos(theta),
            r * cos(phi),
            r * sin(phi) * sin(theta)
        );
    }

    // Shape 2: Torus
    else if (shapeId == 2u) {
        let angle1 = t * 3.14159 * 2.0;
        let angle2 = hash * 3.14159 * 2.0;
        let R = 2.5;
        let r = 1.0;
        return vec3<f32>(
            (R + r * cos(angle2)) * cos(angle1),
            r * sin(angle2),
            (R + r * cos(angle2)) * sin(angle1)
        );
    }

    // Default: Sphere
    return vec3<f32>(0.0);
}

// ============================================
// Force Calculations
// ============================================

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

    // Gravity
    acc.y -= 0.04;

    // Shape attraction
    let targetA = getShapeTarget(idx, params.shapeA);
    let targetB = getShapeTarget(idx, params.shapeB);
    let target = mix(targetA, targetB, params.morph);

    let toTarget = target - pos;
    let distToTarget = length(toTarget);
    if (distToTarget > 0.01) {
        let springForce = normalize(toTarget) * distToTarget * params.shapeStrength;
        acc += springForce;
    }

    // Pointer interaction
    if (params.pointerActive > 0.5) {
        let toPointer = params.pointerPos - pos;
        let dist = length(toPointer);

        if (dist < params.pointerRadius && dist > 0.01) {
            let strength = params.pointerStrength * (1.0 - dist / params.pointerRadius);

            // Mode 0: Attract
            if (params.pointerMode == 0u) {
                acc += normalize(toPointer) * strength;
            }
            // Mode 1: Repel
            else if (params.pointerMode == 1u) {
                acc -= normalize(toPointer) * strength;
            }
            // Mode 2: Vortex
            else if (params.pointerMode == 2u) {
                let tangent = cross(normalize(toPointer), vec3<f32>(0.0, 1.0, 0.0));
                acc += tangent * strength * 2.0;
            }
        }
    }

    // Audio reactivity
    acc += vec3<f32>(0.0, params.audioBass * 0.5, 0.0);
    acc.x += sin(params.time + pos.y) * params.audioMid * 0.3;
    acc.z += cos(params.time + pos.x) * params.audioMid * 0.3;

    // Damping
    acc -= vel * 0.15;

    return acc;
}

// ============================================
// Main Compute Shader
// ============================================

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;

    if (idx >= params.particleCount) {
        return;
    }

    let particle = particlesIn[idx];
    var pos = particle.position;
    var vel = particle.velocity;

    // Calculate forces
    let acc = calculateForces(pos, vel, idx);

    // Integrate
    vel += acc * params.deltaTime * params.speedMultiplier;
    pos += vel * params.deltaTime * params.speedMultiplier;

    // Write output
    particlesOut[idx].position = pos;
    particlesOut[idx].velocity = vel;
}

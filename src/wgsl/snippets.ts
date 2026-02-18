/**
 * Shared WGSL struct and function definitions.
 * Single source of truth — assembled into complete shaders by shaders.ts.
 */

// ─── Structs ──────────────────────────────────────────────────────────────────

export const STRUCT_PARTICLE = /* wgsl */`
struct Particle {
    position: vec3<f32>,
    radius: f32,
    velocity: vec3<f32>,
    _pad: f32,
}`;

export const STRUCT_BVH_NODE = /* wgsl */`
struct BVHNode {
    min: vec3<f32>,
    leftChild: i32,
    max: vec3<f32>,
    rightChild: i32,
}`;

export const STRUCT_SIM_PARAMS = /* wgsl */`
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
}`;

export const STRUCT_LIGHT = /* wgsl */`
struct Light {
    position: vec3<f32>,
    _pad0: f32,
    color: vec3<f32>,
    intensity: f32,
    radius: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}`;

export const STRUCT_RAY_TRACE_PARAMS = /* wgsl */`
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
}`;

export const STRUCT_LBVH_PARAMS = /* wgsl */`
struct LBVHParams {
    particleCount: u32,
    sortStage: u32,
    sortStep: u32,
    _pad: u32,
}`;

export const STRUCT_TEMPORAL_PARAMS = /* wgsl */`
struct TemporalParams {
    alpha: f32,
    frameCount: u32,
    reset: u32,
    _pad: u32,
}`;

// ─── Functions ────────────────────────────────────────────────────────────────

export const FN_PCG = /* wgsl */`
fn pcg(state: ptr<function, u32>) -> u32 {
    let s = *state;
    *state = s * 747796405u + 2891336453u;
    let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (word >> 22u) ^ word;
}

fn pcgFloat(state: ptr<function, u32>) -> f32 {
    return f32(pcg(state)) / 4294967295.0;
}

fn pcgSeed(pixel: vec2<u32>, frame: u32) -> u32 {
    var s = (pixel.x * 1973u + pixel.y * 9277u + frame * 26699u) | 1u;
    // Extra scramble pass to break linear correlation
    s = s * 747796405u + 2891336453u;
    let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (word >> 22u) ^ word;
}`;

export const FN_HASH13 = /* wgsl */`
fn hash13(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}`;

export const FN_NOISE3D = /* wgsl */`
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
}`;

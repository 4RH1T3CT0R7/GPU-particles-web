// ============================================
// Common WGSL Functions
// ============================================

// Constants
const PI: f32 = 3.14159265359;
const TWO_PI: f32 = 6.28318530718;
const HALF_PI: f32 = 1.57079632679;
const INV_PI: f32 = 0.31830988618;
const EPSILON: f32 = 0.00001;

// ============================================
// Hash Functions
// ============================================

fn hash11(p: f32) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(vec3<f32>(p3), vec3<f32>(p3, p3, p3) + 33.33);
    return fract((p3 + p3 + p3) * p3);
}

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash13(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    let n = sin(dot(p, vec2<f32>(41.0, 289.0)));
    return fract(vec2<f32>(262144.0, 32768.0) * n);
}

fn hash33(p: vec3<f32>) -> vec3<f32> {
    var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}

// ============================================
// Noise Functions
// ============================================

fn noise2d(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);

    let a = hash12(i);
    let b = hash12(i + vec2<f32>(1.0, 0.0));
    let c = hash12(i + vec2<f32>(0.0, 1.0));
    let d = hash12(i + vec2<f32>(1.0, 1.0));

    let u = f * f * (3.0 - 2.0 * f);

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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
// Curl Noise (2D)
// ============================================

fn curl2d(p: vec2<f32>) -> vec2<f32> {
    let e = 0.01;
    let n1 = noise2d(p + vec2<f32>(0.0, e));
    let n2 = noise2d(p - vec2<f32>(0.0, e));
    let n3 = noise2d(p + vec2<f32>(e, 0.0));
    let n4 = noise2d(p - vec2<f32>(e, 0.0));
    let dx = (n1 - n2) / (2.0 * e);
    let dy = (n3 - n4) / (2.0 * e);
    return vec2<f32>(dy, -dx);
}

// ============================================
// Vector Math Utilities
// ============================================

fn rotate2D(v: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(
        v.x * c - v.y * s,
        v.x * s + v.y * c
    );
}

fn rotate3D(v: vec3<f32>, axis: vec3<f32>, angle: f32) -> vec3<f32> {
    let c = cos(angle);
    let s = sin(angle);
    let t = 1.0 - c;
    let n = normalize(axis);

    return vec3<f32>(
        (t * n.x * n.x + c) * v.x + (t * n.x * n.y - s * n.z) * v.y + (t * n.x * n.z + s * n.y) * v.z,
        (t * n.x * n.y + s * n.z) * v.x + (t * n.y * n.y + c) * v.y + (t * n.y * n.z - s * n.x) * v.z,
        (t * n.x * n.z - s * n.y) * v.x + (t * n.y * n.z + s * n.x) * v.y + (t * n.z * n.z + c) * v.z
    );
}

// ============================================
// Color Space Conversions
// ============================================

fn linearToSRGB(linear: vec3<f32>) -> vec3<f32> {
    return pow(linear, vec3<f32>(1.0 / 2.2));
}

fn sRGBToLinear(srgb: vec3<f32>) -> vec3<f32> {
    return pow(srgb, vec3<f32>(2.2));
}

// ============================================
// Luminance
// ============================================

fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// ============================================
// Saturate (clamp to 0-1)
// ============================================

fn saturate(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn saturateVec3(x: vec3<f32>) -> vec3<f32> {
    return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));
}

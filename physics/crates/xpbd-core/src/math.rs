/// GLSL-compatible fract: returns the fractional part of x (x - floor(x)).
/// Unlike `f32::fract()` which can return negative values for negative inputs,
/// this always returns a value in [0, 1).
#[inline]
pub fn fract(x: f32) -> f32 {
    x - x.floor()
}

/// Hash float to \[0,1) -- port of GLSL `hash11`.
#[inline]
pub fn hash11(p: f32) -> f32 {
    let mut p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    fract(p)
}

/// Hash vec2 to \[0,1) -- port of GLSL `hash12`.
///
/// GLSL source: `vec3 p3 = fract(vec3(p.xyx) * 0.1031);`
/// `p.xyx` means (x, y, x).
#[inline]
pub fn hash12(x: f32, y: f32) -> f32 {
    // vec3(p.xyx) => (x, y, x)
    let mut p3x = fract(x * 0.1031);
    let mut p3y = fract(y * 0.1031);
    let mut p3z = fract(x * 0.1031); // .xyx pattern: z = x

    // p3 += dot(p3, p3.yzx + 33.33)
    // dot(p3, p3.yzx + 33.33) = p3.x*(p3.y+33.33) + p3.y*(p3.z+33.33) + p3.z*(p3.x+33.33)
    let dot_val =
        p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
    p3x += dot_val;
    p3y += dot_val;
    p3z += dot_val;

    fract((p3x + p3y) * p3z)
}

/// Hash vec2 to vec2 in \[0,1) -- port of GLSL `hash22`.
///
/// GLSL source:
/// ```glsl
/// float n = sin(dot(p, vec2(41, 289)));
/// return fract(vec2(262144.0, 32768.0) * n);
/// ```
#[inline]
pub fn hash22(x: f32, y: f32) -> (f32, f32) {
    let n = (x * 41.0 + y * 289.0).sin();
    (fract(262144.0 * n), fract(32768.0 * n))
}

/// 2D value noise with smooth interpolation -- port of GLSL `noise`.
///
/// Returns a value in \[0,1\].
#[inline]
pub fn noise(x: f32, y: f32) -> f32 {
    let ix = x.floor();
    let iy = y.floor();
    let fx = x - ix;
    let fy = y - iy;

    let a = hash12(ix, iy);
    let b = hash12(ix + 1.0, iy);
    let c = hash12(ix, iy + 1.0);
    let d = hash12(ix + 1.0, iy + 1.0);

    // Smoothstep-style interpolation: u = f*f*(3.0 - 2.0*f)
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);

    // mix(mix(a,b,u.x), mix(c,d,u.x), u.y)
    lerp(lerp(a, b, ux), lerp(c, d, ux), uy)
}

/// Curl noise via finite differences -- port of GLSL `curl`.
///
/// Returns a 2D divergence-free vector field derived from `noise`.
#[inline]
pub fn curl(x: f32, y: f32) -> (f32, f32) {
    let e = 0.01_f32;
    let n1 = noise(x, y + e);
    let n2 = noise(x, y - e);
    let n3 = noise(x + e, y);
    let n4 = noise(x - e, y);
    let dx = (n1 - n2) / (2.0 * e);
    let dy = (n3 - n4) / (2.0 * e);
    (dy, -dx)
}

/// 4-octave fractal Brownian motion -- port of GLSL `fbm`.
#[inline]
pub fn fbm(x: f32, y: f32) -> f32 {
    let mut amp = 0.5_f32;
    let mut f = 0.0_f32;
    let mut px = x;
    let mut py = y;
    for _ in 0..4 {
        f += amp * noise(px, py);
        px *= 2.7;
        py *= 2.7;
        amp *= 0.55;
    }
    f
}

/// Smooth easing function -- port of GLSL `easeInOutCubic`.
#[inline]
pub fn ease_in_out_cubic(t: f32) -> f32 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        let u = -2.0 * t + 2.0;
        1.0 - u * u * u / 2.0
    }
}

/// Linear interpolation -- equivalent to GLSL `mix(a, b, t)`.
#[inline]
pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a * (1.0 - t) + b * t
}

/// Smooth interpolation -- port of GLSL `smoothstep`.
///
/// When `edge0 == edge1` (degenerate range), returns 0.0 if `x < edge0`,
/// otherwise 1.0, avoiding division by zero.
#[inline]
pub fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if (edge1 - edge0).abs() < 1e-10 {
        return if x < edge0 { 0.0 } else { 1.0 };
    }
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Hash float to [0,1] - port of GLSL hash11
pub fn hash11(p: f32) -> f32 {
    let mut p = (p * 0.1031).fract();
    p *= p + 33.33;
    p *= p + p;
    p.fract()
}

/// Hash vec2 to [0,1] - port of GLSL hash12
pub fn hash12(x: f32, y: f32) -> f32 {
    let p3x = (x * 0.1031).fract();
    let p3y = (x * 0.1031).fract(); // .xyx pattern: z = x
    let p3z = (y * 0.1031).fract();
    let dot_val = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
    let p3x = p3x + dot_val;
    let p3y = p3y + dot_val;
    let p3z = p3z + dot_val;
    ((p3x + p3y) * p3z).fract()
}

/// Smooth interpolation - port of GLSL smoothstep
pub fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

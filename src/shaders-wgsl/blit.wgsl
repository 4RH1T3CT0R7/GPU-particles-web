// ============================================
// Blit Shader - Copy ray traced output to canvas
// With HDR tone mapping
// ============================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Full-screen triangle
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);

    output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, y);

    return output;
}

// ============================================
// Tone Mapping
// ============================================

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

// ============================================
// Fragment Shader
// ============================================

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
    // Sample HDR color
    var hdrColor = textureSample(rayTracedTexture, texSampler, input.uv).rgb;

    // Apply exposure
    hdrColor *= pow(2.0, uniforms.exposure);

    // Tone mapping
    var color = acesToneMapping(hdrColor);

    // Gamma correction
    color = pow(color, vec3<f32>(1.0 / uniforms.gamma));

    return vec4<f32>(color, 1.0);
}

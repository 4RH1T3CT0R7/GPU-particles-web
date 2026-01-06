// ============================================
// Temporal Accumulation for Path Tracing
// Reduces noise by blending with previous frames
// ============================================

struct TemporalParams {
    alpha: f32,           // Blend factor (typically 0.05-0.1)
    frameCount: u32,      // Total frames accumulated
    reset: u32,           // 1 = reset accumulation (camera moved)
    _pad: u32,
}

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var historyFrame: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> params: TemporalParams;

// ============================================
// Main Temporal Accumulation
// ============================================

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(currentFrame);
    let coord = global_id.xy;

    if (coord.x >= texSize.x || coord.y >= texSize.y) {
        return;
    }

    // Load current frame
    let currentColor = textureLoad(currentFrame, coord, 0).rgb;

    // Load history
    let historyColor = textureLoad(historyFrame, coord, 0).rgb;

    var outputColor: vec3<f32>;

    if (params.reset == 1u || params.frameCount == 0u) {
        // Reset accumulation - use only current frame
        outputColor = currentColor;
    } else {
        // Exponential moving average
        // More samples = smoother but slower to adapt
        let alpha = params.alpha;
        outputColor = mix(historyColor, currentColor, alpha);

        // Optional: Variance-based blending (adaptive alpha)
        // Could detect changes and increase alpha dynamically
    }

    // Write to output
    textureStore(outputTex, coord, vec4<f32>(outputColor, 1.0));
}

// ============================================
// Alternative: Progressive accumulation
// ============================================

@compute @workgroup_size(8, 8, 1)
fn progressive(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texSize = textureDimensions(currentFrame);
    let coord = global_id.xy;

    if (coord.x >= texSize.x || coord.y >= texSize.y) {
        return;
    }

    let currentColor = textureLoad(currentFrame, coord, 0).rgb;
    let historyColor = textureLoad(historyFrame, coord, 0).rgb;

    var outputColor: vec3<f32>;

    if (params.reset == 1u) {
        outputColor = currentColor;
    } else {
        // Progressive: (history * N + current) / (N + 1)
        let N = f32(params.frameCount);
        outputColor = (historyColor * N + currentColor) / (N + 1.0);
    }

    textureStore(outputTex, coord, vec4<f32>(outputColor, 1.0));
}

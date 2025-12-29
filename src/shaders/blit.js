/**
 * Blit shader for final screen compositing with HDR tone mapping
 */

export const blitFS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_exposure;
uniform float u_bloomStrength;
in vec2 v_uv;
out vec4 o_col;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// ============================================
// ACES Tone Mapping (Narkowicz 2015)
// ============================================
vec3 acesToneMapping(vec3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

// ============================================
// Reinhard Tone Mapping
// ============================================
vec3 reinhardToneMapping(vec3 color) {
    return color / (1.0 + color);
}

// ============================================
// Filmic Tone Mapping (Uncharted 2)
// ============================================
vec3 uncharted2ToneMapping(vec3 color) {
    const float A = 0.15;
    const float B = 0.50;
    const float C = 0.10;
    const float D = 0.20;
    const float E = 0.02;
    const float F = 0.30;
    return ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
}

// ============================================
// Exposure adjustment
// ============================================
vec3 applyExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
}

void main(){
  vec2 uv = v_uv;
  vec2 texel = 1.0 / u_resolution;

  // ====================================
  // Sample HDR color
  // ====================================
  vec3 hdrColor = texture(u_tex, uv).rgb;

  // ====================================
  // Enhanced Bloom with threshold
  // ====================================
  vec3 bloom = vec3(0.0);
  float weight = 0.0;

  // Threshold for bright areas (HDR values > 1.0)
  float brightThreshold = 0.8;

  for(int x=-3; x<=3; x++){
    for(int y=-3; y<=3; y++){
      vec2 off = vec2(float(x), float(y)) * texel * 1.8;
      float w = exp(-0.4 * float(x*x + y*y));
      vec3 sample = texture(u_tex, uv + off).rgb;

      // Extract bright areas for bloom
      float brightness = max(max(sample.r, sample.g), sample.b);
      float contribution = max(0.0, brightness - brightThreshold);

      bloom += sample * w * (1.0 + contribution);
      weight += w;
    }
  }
  bloom /= weight;

  // Mix bloom with base
  vec3 col = hdrColor + bloom * u_bloomStrength;

  // ====================================
  // Apply Exposure
  // ====================================
  col = applyExposure(col, u_exposure);

  // ====================================
  // Tone Mapping (ACES)
  // ====================================
  col = acesToneMapping(col);

  // ====================================
  // Vignette
  // ====================================
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float vig = smoothstep(1.3, 0.4, length(p));
  col *= vig;

  // ====================================
  // Background Gradient (LDR)
  // ====================================
  vec3 gradient = mix(vec3(0.02, 0.03, 0.07), vec3(0.05, 0.07, 0.12), uv.y);
  float radial = 1.0 - length(uv - 0.5) * 1.2;
  gradient += max(0.0, radial) * vec3(0.03, 0.02, 0.05);

  // ====================================
  // Gamma Correction (sRGB)
  // ====================================
  col = pow(col, vec3(1.0 / 2.2));

  // ====================================
  // Film Grain
  // ====================================
  float grain = hash(uv * u_time) * 0.01 - 0.005;
  col += gradient * 0.5 + grain;

  o_col = vec4(col, 1.0);
}
`;

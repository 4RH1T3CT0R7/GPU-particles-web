/**
 * Blit shader for final screen compositing with HDR tone mapping
 */

export const blitFS: string = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform sampler2D u_bloom;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_exposure;
uniform float u_bloomStrength;
in vec2 v_uv;
out vec4 o_col;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

vec3 acesToneMapping(vec3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 applyExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
}

void main(){
  vec2 uv = v_uv;

  vec3 hdrColor = texture(u_tex, uv).rgb;

  // Sample pre-computed bloom (separable, quarter resolution)
  vec3 bloom = texture(u_bloom, uv).rgb;

  vec3 col = hdrColor + bloom * u_bloomStrength;

  col = applyExposure(col, u_exposure);
  col = acesToneMapping(col);

  // Vignette
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float vig = smoothstep(1.3, 0.4, length(p));
  col *= vig;

  // Background gradient — near-black with faint blue tint
  vec3 bgBot = vec3(0.001, 0.001, 0.004);
  vec3 bgTop = vec3(0.002, 0.004, 0.010);
  vec3 gradient = mix(bgBot, bgTop, uv.y);
  // Very subtle colored radial accents
  float r1 = 1.0 - smoothstep(0.0, 0.30, length(uv - vec2(0.18, 0.80)));
  float r2 = 1.0 - smoothstep(0.0, 0.32, length(uv - vec2(0.82, 0.76)));
  float r3 = 1.0 - smoothstep(0.0, 0.32, length(uv - vec2(0.50, 0.30)));
  gradient += r1 * vec3(0.003, 0.008, 0.008);
  gradient += r2 * vec3(0.007, 0.004, 0.007);
  gradient += r3 * vec3(0.002, 0.004, 0.007);
  col += gradient;

  // Gamma
  col = pow(col, vec3(1.0 / 2.2));

  // Grain (applied in sRGB space for perceptual uniformity)
  float grain = hash(uv * u_time) * 0.01 - 0.005;
  col += grain;

  o_col = vec4(col, 1.0);
}
`;

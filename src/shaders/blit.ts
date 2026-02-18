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

  // Background gradient (added before gamma so it gets correct sRGB encoding)
  vec3 gradient = mix(vec3(0.02, 0.03, 0.07), vec3(0.05, 0.07, 0.12), uv.y);
  float radial = 1.0 - length(uv - 0.5) * 1.2;
  gradient += max(0.0, radial) * vec3(0.03, 0.02, 0.05);
  col += gradient * 0.6;

  // Gamma
  col = pow(col, vec3(1.0 / 2.2));

  // Grain (applied in sRGB space for perceptual uniformity)
  float grain = hash(uv * u_time) * 0.01 - 0.005;
  col += grain;

  o_col = vec4(col, 1.0);
}
`;

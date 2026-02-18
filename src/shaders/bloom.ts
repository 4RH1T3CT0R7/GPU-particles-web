/**
 * Separable bloom shader (horizontal + vertical passes)
 * Used at 1/4 resolution for performance
 *
 * Pass 1 (horizontal): u_threshold > 0 extracts bright areas and blurs horizontally
 * Pass 2 (vertical): u_threshold = 0 just blurs vertically (no extraction)
 */

export const bloomFS: string = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_direction; // (1/w, 0) for H pass, (0, 1/h) for V pass
uniform float u_threshold; // > 0 for bright extraction (H pass), 0 for plain blur (V pass)
in vec2 v_uv;
out vec4 o_col;

void main() {
  vec3 bloom = vec3(0.0);
  float weights[4] = float[](0.2270, 0.1945, 0.1216, 0.0541);
  bool extract = u_threshold > 0.0;

  vec3 center = texture(u_tex, v_uv).rgb;
  float factor = extract ? max(0.0, max(max(center.r, center.g), center.b) - u_threshold) : 1.0;
  bloom += center * factor * weights[0];

  for (int i = 1; i < 4; i++) {
    vec2 off = u_direction * float(i) * 2.0;
    vec3 s0 = texture(u_tex, v_uv + off).rgb;
    vec3 s1 = texture(u_tex, v_uv - off).rgb;
    float f0 = extract ? max(0.0, max(max(s0.r, s0.g), s0.b) - u_threshold) : 1.0;
    float f1 = extract ? max(0.0, max(max(s1.r, s1.g), s1.b) - u_threshold) : 1.0;
    bloom += s0 * f0 * weights[i];
    bloom += s1 * f1 * weights[i];
  }

  o_col = vec4(bloom, 1.0);
}
`;

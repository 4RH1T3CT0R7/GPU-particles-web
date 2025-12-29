/**
 * Blit shader for final screen compositing
 */

export const blitFS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_time;
in vec2 v_uv;
out vec4 o_col;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main(){
  vec2 uv = v_uv;
  vec2 texel = 1.0 / u_resolution;
  vec3 base = texture(u_tex, uv).rgb;

  // Фоновый градиент
  vec3 gradient = mix(vec3(0.03, 0.04, 0.09), vec3(0.06, 0.09, 0.15), uv.y);
  float radial = 1.0 - length(uv - 0.5) * 1.2;
  gradient += max(0.0, radial) * vec3(0.04, 0.03, 0.06);

  // Bloom
  vec3 bloom = vec3(0.0);
  float weight = 0.0;
  for(int x=-3; x<=3; x++){
    for(int y=-3; y<=3; y++){
      vec2 off = vec2(float(x), float(y)) * texel * 1.8;
      float w = exp(-0.4 * float(x*x + y*y));
      bloom += texture(u_tex, uv + off).rgb * w;
      weight += w;
    }
  }
  bloom /= weight;

  // Комбинирование
  vec3 col = mix(base, bloom, 0.45);

  // Vignette
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float vig = smoothstep(1.3, 0.4, length(p));
  col *= vig;

  // Гамма
  col = pow(col, vec3(0.95));

  // Шум и фон
  float grain = hash(uv * u_time) * 0.01 - 0.005;
  col += gradient * 0.6 + grain;

  o_col = vec4(col, 1.0);
}
`;

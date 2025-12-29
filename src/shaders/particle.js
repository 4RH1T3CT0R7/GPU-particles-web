/**
 * Particle rendering shaders
 */

import { commonNoise } from './common.js';

export const particleVS = `#version 300 es
precision highp float;
layout(location=0) in float a_idx;
uniform sampler2D u_pos;
uniform vec2 u_texSize;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_time;
out float v_depth;
out float v_hash;
out float v_energy;
out vec3 v_world;
${commonNoise}

vec2 idxToUV(float idx){
  float x = mod(idx, u_texSize.x);
  float y = floor(idx / u_texSize.x);
  return (vec2(x, y) + 0.5) / u_texSize;
}

void main(){
  vec2 uv = idxToUV(a_idx);
  vec3 pos = texture(u_pos, uv).xyz;
  v_world = pos;
  v_hash = hash12(uv * 173.0);
  v_energy = clamp(length(pos) * 0.04 + hash11(v_hash * 97.0) * 0.6, 0.0, 1.2);

  vec4 viewPos = u_view * vec4(pos, 1.0);
  v_depth = -viewPos.z;
  gl_Position = u_proj * viewPos;

  float size = mix(1.6, 4.6, v_energy);
  size *= 140.0 / (80.0 + v_depth * 36.0);
  size *= clamp(256.0 / u_texSize.x, 0.6, 1.6);
  gl_PointSize = size;
}
`;

export const particleFS = `#version 300 es
precision highp float;
in float v_depth;
in float v_hash;
in float v_energy;
in vec3 v_world;
uniform vec3 u_colors[6];
uniform int u_colorCount;
uniform vec3 u_lightPos;
uniform float u_time;
out vec4 o_col;

vec3 paletteSample(float h){
  float bands = float(max(1, u_colorCount));
  h = clamp(h, 0.0, 0.9999);
  float scaled = h * bands;
  int i0 = int(floor(scaled));
  int i1 = min(i0 + 1, int(bands) - 1);
  float t = fract(scaled);
  vec3 c0 = u_colors[i0];
  vec3 c1 = u_colors[i1];
  return mix(c0, c1, t);
}

void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;

  float alpha = smoothstep(1.0, 0.0, r);

  // Fresnel для ореола
  float fresnel = pow(1.0 - clamp(dot(normalize(vec3(p, 0.4)), vec3(0,0,1)), 0.0, 1.0), 2.0);

  // Мерцание
  float sparkle = smoothstep(0.35, 0.0, r) * (0.5 + 0.5 * sin(u_time * 6.0 + v_hash * 50.0));
  float pulse = 0.6 + 0.4 * sin(u_time * 1.5 + v_energy * 3.0 + v_hash * 9.0);

  // Базовый цвет из палитры - усиливаем яркость
  vec3 base = paletteSample(v_hash) * 1.4;

  // Второй цвет для вариации
  vec3 alt = paletteSample(fract(v_hash + 0.5)) * 1.4;

  // Смешиваем цвета с пульсацией
  vec3 color = mix(base, alt, 0.25 * pulse);
  color *= 0.85 + 0.25 * pulse;

  // Rim glow
  color += alt * fresnel * 0.3;

  // Освещение
  vec3 lightDir = normalize(u_lightPos - v_world);
  float light = 0.7 + 0.3 * max(0.0, lightDir.y);

  float depthFade = clamp(2.0 / (1.0 + 0.02 * v_depth * v_depth), 0.4, 1.0);
  float energyGlow = 0.85 + 0.35 * v_energy;

  // Свечение ядра
  float core = exp(-r * 3.0);
  float halo = exp(-r * 1.5);

  color *= light * energyGlow;
  color *= alpha + core * 0.35 + sparkle * 0.2;
  color += base * halo * 0.15;

  // Мягкий туман (уменьшен эффект)
  vec3 fogColor = vec3(0.01, 0.015, 0.035);
  float fog = clamp(exp(-v_depth * 0.06), 0.35, 1.0);
  color = mix(fogColor, color, fog);

  o_col = vec4(color * depthFade, alpha * 0.9);
}
`;

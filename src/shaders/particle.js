/**
 * Particle rendering shaders
 */

import { commonNoise } from './common.js';
import { pbrFunctions } from './pbr.js';

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
uniform vec3 u_cameraPos;
uniform float u_time;
uniform float u_roughness;
uniform float u_metallic;
uniform float u_pbrStrength;

// Multiple light sources (max 8)
uniform vec3 u_lightPositions[8];
uniform vec3 u_lightColors[8];
uniform float u_lightIntensities[8];
uniform float u_lightRadii[8];
uniform int u_lightCount;

out vec4 o_col;

${pbrFunctions}

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

  // ====================================
  // Particle Normal (spherical billboard)
  // ====================================
  vec3 normal = normalize(vec3(p, sqrt(max(0.0, 1.0 - r))));

  // ====================================
  // View Direction
  // ====================================
  vec3 viewDir = normalize(u_cameraPos - v_world);

  // ====================================
  // Animated Effects (preserved from original)
  // ====================================
  float sparkle = smoothstep(0.35, 0.0, r) * (0.5 + 0.5 * sin(u_time * 6.0 + v_hash * 50.0));
  float pulse = 0.6 + 0.4 * sin(u_time * 1.5 + v_energy * 3.0 + v_hash * 9.0);

  // ====================================
  // Material Properties (PBR)
  // ====================================
  // Базовый цвет (albedo) из палитры
  vec3 base = paletteSample(v_hash) * 1.4;
  vec3 alt = paletteSample(fract(v_hash + 0.5)) * 1.4;
  vec3 albedo = mix(base, alt, 0.25 * pulse);

  // Динамические материальные параметры на основе энергии и хеша
  float roughness = mix(u_roughness, u_roughness * 0.3, v_energy);
  roughness = clamp(roughness + v_hash * 0.2 - 0.1, 0.05, 0.95);

  float metallic = mix(u_metallic, u_metallic * 1.2, v_hash);
  metallic = clamp(metallic, 0.0, 1.0);

  float ao = 1.0; // Ambient occlusion (пока без расчета)

  // ====================================
  // PBR Lighting Calculation (Multiple Lights)
  // ====================================
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDir);
  vec3 pbrColor = vec3(0.0);

  // Calculate F0 for all lights
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  // Ambient lighting
  vec3 ambient = vec3(0.03, 0.035, 0.04) * albedo * ao;
  pbrColor += ambient;

  // Calculate lighting from each light source
  for (int i = 0; i < u_lightCount && i < 8; i++) {
    vec3 L = normalize(u_lightPositions[i] - v_world);
    float distance = length(u_lightPositions[i] - v_world);

    // Attenuation with configurable radius
    float attenuation = 1.0 / (1.0 + distance * distance / (u_lightRadii[i] * u_lightRadii[i]));
    attenuation = clamp(attenuation, 0.0, 1.0);

    vec3 radiance = u_lightColors[i] * u_lightIntensities[i] * attenuation;

    // BRDF
    vec3 brdf = cookTorranceBRDF(L, V, N, albedo, roughness, metallic);

    pbrColor += brdf * radiance;
  }

  // ====================================
  // Enhanced Fresnel (rim lighting)
  // ====================================
  float fresnel = enhancedFresnel(normal, viewDir, 3.0, 1.0, 0.0);
  vec3 rimColor = alt * fresnel * 0.4;

  // ====================================
  // Artistic Effects (core, halo, sparkle)
  // ====================================
  float energyGlow = 0.85 + 0.35 * v_energy;
  float core = exp(-r * 3.0);
  float halo = exp(-r * 1.5);

  // Смешиваем PBR и стилизацию
  vec3 color = mix(albedo * energyGlow, pbrColor, u_pbrStrength);

  // Добавляем художественные эффекты
  color += rimColor;
  color *= alpha + core * 0.35 + sparkle * 0.2;
  color += base * halo * 0.15;

  // ====================================
  // Atmospheric Effects
  // ====================================
  float depthFade = clamp(2.0 / (1.0 + 0.02 * v_depth * v_depth), 0.4, 1.0);

  // Туман
  vec3 fogColor = vec3(0.01, 0.015, 0.035);
  float fog = clamp(exp(-v_depth * 0.06), 0.35, 1.0);
  color = mix(fogColor, color, fog);

  o_col = vec4(color * depthFade, alpha * 0.9);
}
`;

/**
 * Initialization shader for particle system
 */

import { commonNoise } from './common.ts';

export const initFS: string = `#version 300 es
precision highp float;
uniform float u_seed;
uniform float u_pattern;
layout(location=0) out vec4 o_pos;
layout(location=1) out vec4 o_vel;
in vec2 v_uv;
${commonNoise}

void main(){
  float h = hash12(v_uv * 311.0 + u_seed);
  float angle = h * 6.28318530718;
  float radius = pow(hash11(h * 97.0), 1.4) * 0.8 + noise(v_uv * 15.0) * 0.12;

  vec3 pos;
  vec3 vel;

  if (u_pattern > 0.5) {
    // Разбросанный фрактальный узор: кольца + вихри
    float swirlBand = 0.35 + 0.65 * noise(v_uv * 9.0 + u_seed);
    float arms = floor(hash11(h * 43.0) * 5.0) + 2.0;
    float armAngle = angle * arms;
    float r = mix(0.25, 0.95, pow(hash11(h * 17.0), 0.6)) * swirlBand;
    pos = vec3(
      cos(armAngle) * r,
      sin(armAngle * 0.35) * (0.35 + noise(v_uv * 5.0 + u_seed) * 0.3),
      sin(armAngle) * r
    );
    vec2 swirl = curl(v_uv * 7.5 + u_seed * 0.21) * 1.4;
    pos.xy += swirl * 0.6;
    vel = vec3(-swirl.y, swirl.x, curl(v_uv * 5.0 + u_seed * 0.13).x * 0.55);
  } else {
    pos = vec3(
      cos(angle) * radius,
      (hash11(h * 41.0) - 0.5) * 0.6,
      sin(angle) * radius
    );

    vec2 swirl = curl(v_uv * 6.0 + u_seed * 0.37) * 0.8;
    vel = vec3(swirl, (hash11(h * 13.0) - 0.5) * 0.35);
  }

  o_pos = vec4(pos, 1.0);
  o_vel = vec4(vel, 1.0);
}
`;

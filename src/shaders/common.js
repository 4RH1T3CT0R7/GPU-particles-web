/**
 * Common shader code and GLSL fragments
 */

export const simVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = (a_pos*0.5+0.5); gl_Position = vec4(a_pos,0.0,1.0); }
`;

export const commonNoise = `
// Hash & noise helpers
float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ float n = sin(dot(p, vec2(41, 289))); return fract(vec2(262144.0, 32768.0) * n); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1,0));
  float c = hash12(i + vec2(0,1));
  float d = hash12(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
vec2 curl(vec2 p){
  float e = 0.01;
  float n1 = noise(p + vec2(0.0, e));
  float n2 = noise(p - vec2(0.0, e));
  float n3 = noise(p + vec2(e, 0.0));
  float n4 = noise(p - vec2(e, 0.0));
  float dx = (n1 - n2) / (2.0*e);
  float dy = (n3 - n4) / (2.0*e);
  return vec2(dy, -dx);
}
`;

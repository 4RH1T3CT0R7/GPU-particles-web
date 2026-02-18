/**
 * Main particle simulation shader
 * Contains all physics, shape attraction, pointer interaction, and audio reactivity
 */

import { commonNoise } from './common.ts';
import { shapesGLSL } from './shapes.ts';

export const simFS: string = `#version 300 es
precision highp float;
uniform sampler2D u_pos;
uniform sampler2D u_vel;
uniform float u_dt;
uniform float u_time;
uniform float u_speedMultiplier;
uniform int u_shapeA;
uniform int u_shapeB;
uniform float u_morph; // 0..1
uniform float u_shapeStrength;
uniform vec2 u_simSize;
uniform vec3 u_pointerPos;
uniform float u_pointerStrength;
uniform float u_pointerRadius;
uniform int u_pointerMode;
uniform float u_pointerActive;
uniform float u_pointerPress;
uniform float u_pointerPulse;
uniform vec3 u_viewDir;
uniform vec4 u_fractalSeeds[2];
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioTreble;
uniform float u_audioEnergy;
uniform mat3 u_rotMatA;
uniform mat3 u_rotMatB;
layout(location=0) out vec4 o_pos;
layout(location=1) out vec4 o_vel;
in vec2 v_uv;
${commonNoise}
${shapesGLSL}

float easeInOutCubic(float t){
  return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0;
}

float fbm(vec2 p){
  float amp = 0.5;
  float f = 0.0;
  for(int i=0;i<4;i++){
    f += amp * noise(p);
    p *= 2.7;
    amp *= 0.55;
  }
  return f;
}

void main(){
  vec2 uv = v_uv;
  vec2 id = uv;
  vec4 posData = texture(u_pos, uv);
  vec3 pos = posData.xyz;
  vec3 vel = texture(u_vel, uv).xyz;

  float idHash = hash12(id);
  float layerHash = hash12(id*23.7);

  // ==== PARTICLE PHYSICS ====
  float structure = smoothstep(0.1, 0.9, u_shapeStrength);
  float calmFactor = smoothstep(0.5, 1.0, u_shapeStrength);

  // Curl noise for organic movement
  vec2 curlLarge = curl(pos.xy * 0.4 + u_time * 0.1) * 0.7;
  vec2 curlMid   = curl(pos.xy * 1.0 + pos.z * 0.3 - u_time * 0.12) * 0.5;
  vec2 curlFine  = curl(pos.xy * 2.5 + u_time * 0.2 + idHash*3.0) * 0.25;
  float curlZ = noise(pos.xy * 1.5 + u_time * 0.15) - 0.5;

  vec2 swirl = curlLarge + curlMid + curlFine;

  // Vortex
  vec2 vortexCenter = vec2(sin(u_time*0.08), cos(u_time*0.1))*0.4;
  vec2 rel = pos.xy - vortexCenter;
  float r2 = max(0.15, dot(rel, rel));
  vec2 vortex = vec2(-rel.y, rel.x) / r2 * 0.35;

  vec2 baseFlow = swirl * 0.55 + vortex * 0.35;
  vec2 dampedFlow = mix(baseFlow, swirl * 0.25, calmFactor);

  vec3 flow = vec3(dampedFlow, curlZ * 0.4);
  flow.z += sin(u_time*0.25 + pos.x*1.2 + pos.y*0.8) * 0.35;

  vec3 acc = flow * mix(0.35, 0.55, 1.0 - structure);
  acc.y -= 0.04; // gravity

  float velMag = length(vel);
  acc -= vel * velMag * 0.018;

  float drag = mix(0.93, 0.965, calmFactor);
  vel *= drag;

  // ==== SHAPE ATTRACTION ====
  vec3 targetA = targetFor(u_shapeA, id, u_time*0.55, 0);
  vec3 targetB = targetFor(u_shapeB, id, u_time*0.58 + 2.5, 1);
  vec3 desired = mix(targetA, targetB, easeInOutCubic(u_morph));

  float affinity = smoothstep(0.03, 0.9, idHash);
  float shapeWeight = u_shapeStrength * affinity;
  vec3 toShape = desired - pos;
  float dist = max(0.005, length(toShape));
  vec3 dirToShape = toShape / dist;

  float springStrength = 15.0 + 10.0 * calmFactor;
  float dampingFactor = exp(-dist * 0.4);
  vec3 shapeForce = toShape * springStrength * shapeWeight * dampingFactor;

  float closeRange = smoothstep(0.5, 0.0, dist);
  shapeForce += dirToShape * 6.0 * shapeWeight * closeRange;

  float nearTarget = smoothstep(0.15, 0.0, dist);
  shapeForce += dirToShape * 3.0 * shapeWeight * nearTarget;
  vel *= mix(1.0, 0.85, nearTarget * shapeWeight);

  float cohesion = smoothstep(0.0, 0.55, shapeWeight);
  acc = mix(acc, shapeForce * 2.2, cohesion * 0.92);
  acc += shapeForce * 0.6;
  vel *= mix(0.96, 0.87, cohesion * calmFactor);

  // ==== POINTER INTERACTION ====
  if (u_pointerActive > 0.5) {
    vec3 toPointer = u_pointerPos - pos;
    float distPointer = length(toPointer);
    float radius = max(0.15, u_pointerRadius);
    float falloff = exp(-pow(distPointer / radius, 1.25));
    float pressBoost = mix(0.6, 1.0, u_pointerPress);
    float base = u_pointerStrength * pressBoost * falloff * 0.5;
    vec3 dirP = toPointer / max(distPointer, 0.001);
    float jitter = hash11(idHash * 91.0);

    float pulseWave = 0.65 + 0.35 * sin(u_time * 3.5 + jitter * 7.0);

    if (u_pointerMode == 0) {
      // Attract
      acc += dirP * base * 1.5;
      vel += dirP * base * 0.45;
    } else if (u_pointerMode == 1) {
      // Repel
      acc -= dirP * base * 4.5;
      acc += vec3(dirP.y, -dirP.x, 0.3) * base * 2.8;
      vel -= dirP * base * 1.2;
      vel *= 0.97;
    } else if (u_pointerMode == 2 || u_pointerMode == 3) {
      // Vortex
      float spin = (u_pointerMode == 2 ? -1.0 : 1.0);
      vec3 tangent = vec3(dirP.y * spin, -dirP.x * spin, dirP.z * 0.35 * spin);
      float spiralBoost = 1.2 + pulseWave * 0.8;
      acc += tangent * base * (2.5 * spiralBoost);
      acc += dirP * base * (0.8 + 0.6 * pulseWave);
      vel = mix(vel, vel + tangent * base * 0.6, 0.35 + 0.2 * pulseWave);
    } else if (u_pointerMode == 4) {
      // Pulse
      float pulsePhase = u_time * 5.5 + jitter * 12.0;
      float carrier = 0.7 + 0.6 * sin(pulsePhase);
      float burst = smoothstep(0.0, 1.0, sin(pulsePhase * 0.6));
      float strongBurst = pow(burst, 0.5);
      float pulse = 1.0 + carrier + (u_pointerPulse > 0.5 ? strongBurst * 3.5 : carrier * 0.8);
      vec3 swirl = normalize(vec3(-dirP.y, dirP.x, dirP.z * 0.5));
      acc -= dirP * base * (2.5 + strongBurst * 4.5);
      acc += swirl * base * (2.2 + strongBurst * 3.8);
      float wave = sin(distPointer * 8.0 - u_time * 6.0) * strongBurst;
      acc += dirP * base * wave * 2.5;
      vel = mix(vel, vel - dirP * base * 1.5 + swirl * base * 1.2, 0.6 * pulse);
    } else if (u_pointerMode == 6) {
      // QUASAR: accretion disk + jets
      vec3 r = pos - u_pointerPos;
      float rLen = max(0.01, length(r));
      vec3 axis = vec3(0.0, 1.0, 0.0);

      // Cylindrical coordinates
      float h = dot(r, axis);
      float absH = abs(h);
      float hSign = sign(h + 0.0001);
      vec3 toAxis = r - axis * h;
      float rho = length(toAxis);
      vec3 rhoDir = rho > 0.01 ? toAxis / rho : vec3(1.0, 0.0, 0.0);
      vec3 phi = normalize(cross(axis, rhoDir));

      float q = u_pointerStrength * pressBoost * 0.5;

      // Sizes
      float diskR = radius * 1.5;
      float coreR = radius * 0.12;
      float diskThick = radius * 0.25;

      // Zones
      float inDiskPlane = exp(-absH * absH / (diskThick * diskThick));
      float inCore = exp(-rLen * rLen / (coreR * coreR));

      // Jet - narrows
      float jetRadius = radius * 0.5 / (1.0 + absH * 2.0);
      float inJetCone = exp(-rho * rho / (jetRadius * jetRadius));
      float inJet = inJetCone * (1.0 - inDiskPlane);

      // === 1. THICK TORUS (volumetric disk) ===

      // Moderate flattening (thick torus!)
      float flattenForce = 12.0 * (1.0 - inJetCone * 0.95);
      acc -= axis * hSign * q * flattenForce;

      // Strong rotation
      float orbitalForce = 1.8 / (0.08 + rho * rho);
      acc += phi * q * orbitalForce * 20.0 * (1.0 - inJet);

      // Accretion to center
      float accretionForce = 0.35 / sqrt(0.08 + rho);
      acc -= rhoDir * q * accretionForce * inDiskPlane;

      // Turbulence for volume
      float noiseVal = sin(rho * 4.0 + u_time) * cos(h * 5.0 - u_time * 0.8);
      acc += vec3(noiseVal * 0.5, noiseVal * 0.4, noiseVal * 0.5) * q * inDiskPlane;

      // Moderate viscosity
      vel *= mix(1.0, 0.985, inDiskPlane * (1.0 - inJet));

      // === 2. SUPER-DOMINANT JETS ===

      // EXTREME ejection from core
      float coreEject = 80.0 * inCore;
      acc += axis * hSign * q * coreEject;

      // POWERFUL jet lift
      float jetLift = 60.0 * inJetCone;
      acc += axis * hSign * q * jetLift;

      // Strong collimation
      float collimatePower = 35.0 * (1.0 + absH * 3.5);
      float edgeDist = smoothstep(jetRadius * 0.2, jetRadius, rho);
      acc -= rhoDir * q * collimatePower * inJetCone * edgeDist;

      // Rotation in jet
      acc += phi * q * 10.0 * inJetCone;

      // === 3. BOUNDARIES ===
      float boundR = smoothstep(diskR * 0.9, diskR, rho);
      float boundH = smoothstep(diskR, diskR * 1.5, absH);
      acc -= rhoDir * q * 14.0 * boundR;
      acc -= axis * hSign * q * 10.0 * boundH;

      // Attraction to center
      acc -= normalize(r) * q * 0.6 / (0.4 + rLen);

      // Moderate stabilization
      vel *= 0.992;
      float speed = length(vel);
      if (speed > 3.5) vel = vel / speed * 3.5;
    } else if (u_pointerMode == 5) {
      // Magnetic flow - powerful arc field lines
      vec3 axis = normalize(u_viewDir * 0.7 + vec3(0.0, 1.0, 0.5));
      vec3 r = pos - u_pointerPos;
      float rLen = max(0.06, length(r));
      float r2 = rLen * rLen;
      float r3 = r2 * rLen;
      float r5 = r2 * r3 + 1e-5;

      // Dipole magnetic field (enhanced)
      vec3 dipole = (3.0 * r * dot(axis, r) / r5) - (axis / max(1e-3, r3));
      dipole = clamp(dipole, -vec3(20.0), vec3(20.0));

      // Field lines rotate around axis (guard against zero cross product → NaN)
      vec3 swirlRaw = cross(dipole, axis) + 0.5 * cross(dirP, axis);
      float swirlLen = length(swirlRaw);
      vec3 swirlDir = swirlLen > 0.001 ? swirlRaw / swirlLen : vec3(dirP.y, -dirP.x, 0.0);

      // Stronger falloff for closer particles
      float fluxFalloff = 1.0 / (1.0 + pow(rLen / (radius * 1.5), 1.5));
      float magneticStrength = pow(fluxFalloff, 0.7);

      // Very strong magnetic forces
      acc += dipole * base * (4.5 * magneticStrength);
      // Fast rotation around field lines
      acc += swirlDir * base * (5.0 * magneticStrength);

      // Polar repulsion/attraction
      float polarAlignment = dot(normalize(r), axis);
      acc += axis * base * (2.5 * sign(polarAlignment) * magneticStrength);

      // Spiral movement along field lines
      float spiralPhase = atan(r.y, r.x) + u_time * 2.0;
      vec3 spiralForce = vec3(cos(spiralPhase), sin(spiralPhase), 0.0);
      acc += spiralForce * base * (1.8 * magneticStrength);

      vel = mix(vel, vel + dipole * 1.2 + swirlDir * 1.5, 0.7 * magneticStrength);
    }
  }

  // ==== BOUNDARY ====
  float roamRadius = 4.5;
  float distCenter = length(pos);
  if (distCenter > roamRadius){
    acc -= pos / distCenter * (distCenter - roamRadius) * 0.6;
  }

  // ==== AUDIO REACTIVITY ====
  bool isEqualizerMode = (u_shapeA == 12 || u_shapeB == 12);

  if (isEqualizerMode) {
    float audioBoost = 1.0 + u_audioEnergy * 1.2;
    acc *= audioBoost;

    float bassForce = u_audioBass * 4.5;
    vec3 outward = normalize(pos - desired + vec3(0.001));
    acc += outward * bassForce;
    vel += outward * u_audioBass * 0.8;

    float midAngle = u_audioMid * 3.14159 + u_time;
    vec2 midSwirl = vec2(cos(midAngle), sin(midAngle));
    acc += vec3(midSwirl * u_audioMid * 3.2, 0.0);
    vec3 midTangent = vec3(-midSwirl.y, midSwirl.x, sin(u_time * 2.0) * 0.5);
    acc += midTangent * u_audioMid * 2.0;

    acc.y += u_audioTreble * 3.8;
    acc += vec3(0.0, 0.0, sin(u_time * 5.0 + idHash * 6.28) * u_audioTreble * 2.5);
    vec3 sparkle = vec3(
      sin(u_time * 7.0 + idHash * 12.56),
      cos(u_time * 8.0 + layerHash * 9.42),
      sin(u_time * 6.0 + idHash * 15.7)
    ) * u_audioTreble * 1.8;
    acc += sparkle;
  }

  // ==== FREE FLIGHT MODE ====
  float isFreeFlightMode = 1.0 - step(0.05, u_shapeStrength);

  if (isFreeFlightMode > 0.5) {
    vec3 turbulence1 = vec3(
      sin(u_time * 1.2 + pos.y * 3.0 + idHash * 6.28),
      cos(u_time * 0.9 + pos.x * 2.5 + layerHash * 4.71),
      sin(u_time * 1.1 + pos.z * 3.2 + idHash * 3.14)
    ) * 2.8;

    vec3 turbulence2 = vec3(
      cos(u_time * 1.8 + pos.z * 2.2 - layerHash * 5.0),
      sin(u_time * 1.5 + pos.y * 2.0 + idHash * 7.5),
      cos(u_time * 1.3 + pos.x * 2.5 - layerHash * 2.8)
    ) * 2.2;

    float spiralAngle1 = u_time * 0.8 + length(pos) * 2.5;
    float spiralAngle2 = u_time * 1.2 - length(pos) * 1.8;
    vec3 spiralFlow1 = vec3(
      cos(spiralAngle1) * pos.y - sin(spiralAngle1) * pos.z,
      sin(spiralAngle1) * pos.x + cos(spiralAngle1) * pos.z,
      cos(spiralAngle1) * pos.x - sin(spiralAngle1) * pos.y
    ) * 1.8;
    vec3 spiralFlow2 = vec3(
      -sin(spiralAngle2) * pos.z,
      cos(spiralAngle2) * pos.x,
      sin(spiralAngle2) * pos.y
    ) * 1.5;

    vec2 curlFlow1_2d = curl(pos.xy * 2.2 + u_time * 0.5);
    vec2 curlFlow2_2d = curl(pos.yz * 1.8 - u_time * 0.4 + vec2(5.7, 3.2));
    vec2 curlFlow3_2d = curl(pos.xz * 2.5 + u_time * 0.3 + vec2(2.1, 8.4));
    vec3 curlFlow1 = vec3(curlFlow1_2d, curlFlow2_2d.x) * 3.5;
    vec3 curlFlow2 = vec3(curlFlow3_2d.x, curlFlow1_2d.y, curlFlow2_2d.y) * 2.8;

    float vertWave = sin(u_time * 2.0 + pos.x * 2.5 + pos.z * 2.0) * 1.5;
    float horizWave = cos(u_time * 1.8 + pos.y * 2.2) * 1.2;

    acc += turbulence1 * 0.7;
    acc += turbulence2 * 0.65;
    acc += spiralFlow1 * 0.9;
    acc += spiralFlow2 * 0.75;
    acc += curlFlow1 * 1.0;
    acc += curlFlow2 * 0.85;
    acc.y += vertWave;
    acc.x += horizWave;

    vec3 randomDrift = vec3(
      noise(id * 18.3 + u_time * 0.6),
      noise(id * 27.7 - u_time * 0.5),
      noise(id * 35.1 + u_time * 0.7)
    ) * 2.2 - 1.1;
    acc += randomDrift;

    vec2 toCenter = -pos.xy;
    float distToCenter = max(0.5, length(toCenter));
    vec2 vortexForce = vec2(-toCenter.y, toCenter.x) / distToCenter;
    acc += vec3(vortexForce * 1.5, sin(u_time + pos.z) * 0.8);
  }

  // Integration
  float simDt = u_dt * u_speedMultiplier;
  vel += acc * simDt;
  vel *= mix(1.0, 0.915, step(0.0001, u_speedMultiplier));
  float speed = length(vel);
  if (speed > 18.0) vel = vel / speed * 18.0;

  pos += vel * simDt;
  o_pos = vec4(pos, 1.0);
  o_vel = vec4(vel, 1.0);
}
`;

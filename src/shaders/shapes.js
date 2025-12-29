/**
 * Shape generation GLSL code
 */

export const shapesGLSL = `
// 3D shape generators
vec3 shape_cube(float t, float s){
  // Map to cube surface
  float face = floor(t * 6.0);
  float u = fract(t * 6.0);
  float v = s;
  vec3 p;
  if (face < 1.0) p = vec3(u*2.0-1.0, v*2.0-1.0, 1.0); // front
  else if (face < 2.0) p = vec3(u*2.0-1.0, v*2.0-1.0, -1.0); // back
  else if (face < 3.0) p = vec3(1.0, u*2.0-1.0, v*2.0-1.0); // right
  else if (face < 4.0) p = vec3(-1.0, u*2.0-1.0, v*2.0-1.0); // left
  else if (face < 5.0) p = vec3(u*2.0-1.0, 1.0, v*2.0-1.0); // top
  else p = vec3(u*2.0-1.0, -1.0, v*2.0-1.0); // bottom
  return p * 0.6;
}

vec3 shape_sphere(float t, float s){
  float theta = t * 6.28318530718;
  float phi = acos(2.0 * s - 1.0);
  return vec3(
    sin(phi) * cos(theta),
    sin(phi) * sin(theta),
    cos(phi)
  ) * 0.7;
}

vec3 shape_torus(float t, float s){
  float R = 0.6; // major radius
  float r = 0.25; // minor radius
  float theta = t * 6.28318530718;
  float phi = s * 6.28318530718;
  return vec3(
    (R + r * cos(phi)) * cos(theta),
    (R + r * cos(phi)) * sin(theta),
    r * sin(phi)
  );
}

vec3 shape_helix(float t, float s){
  float totalTurns = 5.0;
  float angle = s * 6.28318530718 * totalTurns;
  float height = (s * 2.0 - 1.0) * 1.4;
  float radius = 0.3 + s * 0.5;
  float wave = 0.08 * sin(angle * 2.0 + t * 6.28);
  return vec3(
    (radius + wave) * cos(angle),
    height,
    (radius + wave) * sin(angle)
  );
}

vec3 shape_octahedron(float t, float s){
  float face = floor(t * 8.0);
  float u = fract(t * 8.0);
  float v = s;

  vec3 v0, v1, v2;

  if (face < 1.0) {
    v0 = vec3(1,0,0); v1 = vec3(0,0,1); v2 = vec3(0,1,0);
  } else if (face < 2.0) {
    v0 = vec3(0,0,1); v1 = vec3(-1,0,0); v2 = vec3(0,1,0);
  } else if (face < 3.0) {
    v0 = vec3(-1,0,0); v1 = vec3(0,0,-1); v2 = vec3(0,1,0);
  } else if (face < 4.0) {
    v0 = vec3(0,0,-1); v1 = vec3(1,0,0); v2 = vec3(0,1,0);
  } else if (face < 5.0) {
    v0 = vec3(1,0,0); v1 = vec3(0,0,-1); v2 = vec3(0,-1,0);
  } else if (face < 6.0) {
    v0 = vec3(0,0,-1); v1 = vec3(-1,0,0); v2 = vec3(0,-1,0);
  } else if (face < 7.0) {
    v0 = vec3(-1,0,0); v1 = vec3(0,0,1); v2 = vec3(0,-1,0);
  } else {
    v0 = vec3(0,0,1); v1 = vec3(1,0,0); v2 = vec3(0,-1,0);
  }

  float sqrtV = sqrt(v);
  vec3 p = v0 * (1.0 - sqrtV) + mix(v1, v2, u) * sqrtV;

  return normalize(p) * 0.75;
}

vec3 shape_wave(float t, float s){
  float x = (t - 0.5) * 2.0;
  float y = sin(t * 6.28318530718 * 3.0) * 0.5;
  float z = cos(t * 6.28318530718) * (s - 0.5);
  return vec3(x * 0.5, y, z) * 0.7;
}

vec3 shape_ribbon(float t, float s){
  float angle = t * 6.28318530718;
  float stripWidth = 0.4;
  float w = (s - 0.5) * stripWidth;
  float R = 0.8;
  float twist = angle * 0.5;
  float thickness = 0.05;
  float sLocal = fract(s * 3.0);
  float layer = (sLocal - 0.5) * thickness;

  float baseX = R * cos(angle);
  float baseY = 0.0;
  float baseZ = R * sin(angle);

  float offsetX = w * cos(twist) * cos(angle);
  float offsetY = w * sin(twist);
  float offsetZ = w * cos(twist) * sin(angle);

  float thickX = layer * sin(twist) * cos(angle);
  float thickY = layer * cos(twist);
  float thickZ = layer * sin(twist) * sin(angle);

  float x = baseX + offsetX + thickX;
  float y = baseY + offsetY + thickY;
  float z = baseZ + offsetZ + thickZ;

  float waveAmp = 0.03;
  y += sin(angle * 4.0) * waveAmp * (1.0 - abs(w) / stripWidth);

  return vec3(x, y, z) * 0.9;
}

vec3 shape_icosahedron(float t, float s){
  float angle = t * 6.28318530718;
  float rings = floor(s * 5.0);
  float ringT = fract(s * 5.0);
  float r = 0.6 * sin(rings * 0.628);
  return vec3(
    r * cos(angle),
    (s - 0.5) * 1.4,
    r * sin(angle)
  );
}

vec3 shape_equalizer(float t, float s, float bass, float mid, float treble, float time){
  float numBars = 16.0;
  float barWidth = 3.0 / numBars;
  float gapRatio = 0.15;

  float xRange = 3.0;
  float xBase = (t - 0.5) * xRange;

  float barIndex = floor((t * numBars));
  float barCenter = (barIndex + 0.5) / numBars;
  float localT = fract(t * numBars);

  float inBar = smoothstep(0.0, gapRatio, localT) * smoothstep(1.0, 1.0 - gapRatio, localT);
  float barEdge = pow(inBar, 0.5);

  float x = ((barCenter - 0.5) * xRange);

  float zRange = 1.8;
  float z = (s - 0.5) * zRange;

  float depthEdge = smoothstep(0.0, 0.1, s) * smoothstep(1.0, 0.9, s);

  float totalEnergy = bass + mid + treble;
  bool hasAudio = totalEnergy > 0.01;

  float barPhase = barIndex * 0.7 + time;
  float demoWave1 = 0.5 + 0.5 * sin(time * 2.0 + barIndex * 0.5);
  float demoWave2 = 0.5 + 0.5 * sin(time * 2.5 + barIndex * 0.8 + 2.0);
  float demoWave3 = 0.5 + 0.5 * sin(time * 3.0 + barIndex * 1.2 + 4.0);

  float useBass = hasAudio ? bass * 3.5 : demoWave1;
  float useMid = hasAudio ? mid * 3.2 : demoWave2;
  float useTreble = hasAudio ? treble * 2.8 : demoWave3;

  float normBar = barIndex / (numBars - 1.0);

  float bassZone = smoothstep(0.45, 0.0, normBar);
  float midZone = 1.0 - abs(normBar - 0.5) * 3.0;
  midZone = max(0.0, midZone);
  float trebleZone = smoothstep(0.55, 1.0, normBar);

  float totalZone = bassZone + midZone + trebleZone;
  if (totalZone > 0.01) {
    bassZone /= totalZone;
    midZone /= totalZone;
    trebleZone /= totalZone;
  }

  float barHeight = (useBass * bassZone + useMid * midZone + useTreble * trebleZone) * 0.85;

  float baseY = -0.9;
  float columnHeight = barHeight * 2.0;
  float heightFactor = s;

  float maxY = baseY + columnHeight;
  float y = baseY + heightFactor * columnHeight;

  float topConcentration = smoothstep(0.6, 1.0, heightFactor);

  float edgeFactor = abs(localT - 0.5) * 2.0;
  float onEdge = smoothstep(0.7, 0.95, edgeFactor);

  float gridLines = 5.0;
  float gridY = fract(heightFactor * gridLines);
  float onGridLine = smoothstep(0.1, 0.0, gridY) + smoothstep(0.9, 1.0, gridY);
  onGridLine *= 0.3;

  float xOffset = (localT - 0.5) * barWidth * 0.9;
  x += xOffset;

  float frontBack = abs(s - 0.5) * 2.0;
  float onFrontBack = smoothstep(0.8, 1.0, frontBack);

  float contourStrength = max(onEdge, onFrontBack) * barEdge * depthEdge;

  float wobble = sin(time * 2.0 + barIndex * 1.5) * 0.02 * barEdge;
  y += wobble;

  float topPulse = sin(time * 4.0 + barIndex * 0.8) * 0.05 * topConcentration;
  y += topPulse;

  return vec3(x, y, z);
}

// 2D shape generators
vec2 shape_superformula(float t, float m, float n1, float n2, float n3){
  float a = 1.0, b = 1.0;
  float r = pow(pow(abs(cos(m*t/4.0)/a), n2) + pow(abs(sin(m*t/4.0)/b), n3), -1.0/n1);
  return r * vec2(cos(t), sin(t));
}
vec2 shape_rose(float t, float k){ float r = cos(k*t); return r*vec2(cos(t), sin(t)); }
vec2 shape_polygon(float t, float n){ float a = 6.28318530718/n; float k = floor(t/a); float ang = (k + 0.5)*a; return vec2(cos(ang), sin(ang)); }

// helper rotation
vec3 applyRotations(vec3 p, float time){
  float ax = time * 0.21;
  float ay = time * 0.17;
  float az = time * 0.13;
  mat3 rotX = mat3(
    1.0, 0.0, 0.0,
    0.0, cos(ax), -sin(ax),
    0.0, sin(ax), cos(ax)
  );
  mat3 rotY = mat3(
    cos(ay), 0.0, sin(ay),
    0.0, 1.0, 0.0,
    -sin(ay), 0.0, cos(ay)
  );
  mat3 rotZ = mat3(
    cos(az), -sin(az), 0.0,
    sin(az), cos(az), 0.0,
    0.0, 0.0, 1.0
  );
  return rotZ * rotY * rotX * p;
}

mat2 rot2(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// Main shape dispatcher function
vec3 targetFor(int shapeId, vec2 id, float time, int slot){
  float t = id.x;
  float s = id.y;
  vec3 pos;

  if (shapeId == 0) {
    // Cube
    pos = shape_cube(t, s);
  } else if (shapeId == 1) {
    // Sphere
    pos = shape_sphere(t, s);
  } else if (shapeId == 2) {
    // Torus
    pos = shape_torus(t, s);
  } else if (shapeId == 3) {
    // Helix
    pos = shape_helix(t, s);
  } else if (shapeId == 4) {
    // Octahedron
    pos = shape_octahedron(t, s);
  } else if (shapeId == 5) {
    // Superformula
    float angle = t * 6.28318530718;
    float m = 6.0 + sin(time * 0.3) * 2.0;
    float n1 = 2.0 + sin(time * 0.4) * 1.0;
    float n2 = 18.0 + sin(time * 0.5) * 8.0;
    float n3 = 18.0 + cos(time * 0.6) * 8.0;
    vec2 p2d = shape_superformula(angle, m, n1, n2, n3);
    float z = (s - 0.5) * 0.8;
    pos = vec3(p2d * 0.7, z);
  } else if (shapeId == 6) {
    // Rose
    float angle = t * 6.28318530718;
    float k = 3.0 + sin(time * 0.25) * 2.0;
    vec2 p2d = shape_rose(angle, k);
    float z = (s - 0.5) * 0.8;
    pos = vec3(p2d * 0.8, z);
  } else if (shapeId == 7) {
    // Wave
    pos = shape_wave(t, s);
  } else if (shapeId == 8) {
    // Ribbon
    pos = shape_ribbon(t, s);
  } else if (shapeId == 9) {
    // Icosahedron
    pos = shape_icosahedron(t, s);
  } else if (shapeId == 10) {
    // Polygon
    float angle = t * 6.28318530718;
    float n = 5.0 + sin(time * 0.2) * 2.0;
    vec2 p2d = shape_polygon(angle, n);
    float z = (s - 0.5) * 0.8;
    pos = vec3(p2d * 0.7, z);
  } else if (shapeId == 11) {
    // Fractal - return a placeholder that will be overridden
    // The actual fractal shape is computed inline in simulation.js
    pos = vec3(0.0);
  } else if (shapeId == 12) {
    // Equalizer - will use audio data from simulation context
    // For now return basic shape, audio reactivity is in simulation.js
    pos = shape_equalizer(t, s, 0.0, 0.0, 0.0, time);
  } else {
    // Default to sphere
    pos = shape_sphere(t, s);
  }

  // Apply gentle rotation for most shapes
  if (shapeId != 12 && shapeId != 11) {
    pos = applyRotations(pos, time);
  }

  return pos;
}
`;

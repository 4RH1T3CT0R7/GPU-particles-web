/*
  GPU Particle Shapes — WebGL2
  Thousands of particles morphing between shapes with trails, glow, and mouse turbulence.
  Open index.html in a modern browser (WebGL2 required).
*/

(function () {
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const SIM_SIZE = 256; // 256x256 = 65,536 частиц - НАМНОГО БОЛЬШЕ!

  // Canvas & GL setup
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) {
    alert('WebGL2 not supported');
    return;
  }
  console.log('✓ WebGL2 инициализирован');

  // Extensions (ensure float color attachments are supported)
  const extColorFloat = gl.getExtension('EXT_color_buffer_float');
  if (!extColorFloat) {
    alert('EXT_color_buffer_float not supported');
    return;
  }

  // GPU limits (avoid creating buffers larger than the hardware can handle)
  const MAX_TEX_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const MAX_RB_SIZE = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const MAX_RT_SIZE = Math.min(MAX_TEX_SIZE, MAX_RB_SIZE);
  const MAX_VIEWPORT = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

  // Utils
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log + '\n--- SOURCE ---\n' + src);
    }
    return sh;
  };
  const link = (vsSrc, fsSrc, xfbVaryings) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    if (xfbVaryings) gl.transformFeedbackVaryings(prog, xfbVaryings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(log);
    }
    return prog;
  };
  const createTex = (w, h, opts = {}) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const {
      internalFormat = gl.RGBA32F,
      srcFormat = gl.RGBA,
      type = gl.FLOAT,
      min = gl.NEAREST,
      mag = gl.NEAREST,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      data = null,
    } = opts;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, srcFormat, type, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  };
  const createFBO = (attachments) => {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const bufs = [];
    attachments.forEach((tex, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      bufs.push(gl.COLOR_ATTACHMENT0 + i);
    });
    gl.drawBuffers(bufs);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('FBO incomplete: ' + status.toString(16));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  };
  const quadVAO = (() => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // full-screen triangle strip (2 triangles)
    const verts = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  })();
  const drawQuad = () => {
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  };

  // Shaders
  const simVS = `#version 300 es
  precision highp float;
  layout(location=0) in vec2 a_pos;
  out vec2 v_uv;
  void main(){ v_uv = (a_pos*0.5+0.5); gl_Position = vec4(a_pos,0.0,1.0); }
  `;

  const commonNoise = `
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

  const shapesGLSL = `
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
    float angle = t * 6.28318530718 * 4.0; // 4 turns
    float height = (s * 2.0 - 1.0) * 1.2;
    float radius = 0.5;
    return vec3(
      radius * cos(angle),
      height,
      radius * sin(angle)
    );
  }

  vec3 shape_octahedron(float t, float s){
    // 8 треугольных граней
    float face = floor(t * 8.0);
    float u = fract(t * 8.0);
    float v = s;
    vec3 p;
    if (face < 1.0) p = mix(vec3(1,0,0), vec3(0,1,0), u) * (1.0-v) + vec3(0,0,1)*v;
    else if (face < 2.0) p = mix(vec3(0,1,0), vec3(-1,0,0), u) * (1.0-v) + vec3(0,0,1)*v;
    else if (face < 3.0) p = mix(vec3(-1,0,0), vec3(0,-1,0), u) * (1.0-v) + vec3(0,0,1)*v;
    else if (face < 4.0) p = mix(vec3(0,-1,0), vec3(1,0,0), u) * (1.0-v) + vec3(0,0,1)*v;
    else if (face < 5.0) p = mix(vec3(1,0,0), vec3(0,1,0), u) * (1.0-v) + vec3(0,0,-1)*v;
    else if (face < 6.0) p = mix(vec3(0,1,0), vec3(-1,0,0), u) * (1.0-v) + vec3(0,0,-1)*v;
    else if (face < 7.0) p = mix(vec3(-1,0,0), vec3(0,-1,0), u) * (1.0-v) + vec3(0,0,-1)*v;
    else p = mix(vec3(0,-1,0), vec3(1,0,0), u) * (1.0-v) + vec3(0,0,-1)*v;
    return normalize(p) * 0.7;
  }

  vec3 shape_wave(float t, float s){
    // Волна 3D
    float x = (t - 0.5) * 2.0;
    float y = sin(t * 6.28318530718 * 3.0) * 0.5;
    float z = cos(t * 6.28318530718) * (s - 0.5);
    return vec3(x * 0.5, y, z) * 0.7;
  }

  vec3 shape_ribbon(float t, float s){
    // Лента/спираль
    float angle = t * 6.28318530718 * 2.0;
    float radius = 0.5 + s * 0.2;
    return vec3(
      radius * cos(angle),
      (s - 0.5) * 1.0,
      radius * sin(angle)
    );
  }

  vec3 shape_icosahedron(float t, float s){
    // Икосаэдр (примерно)
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

  // 2D shape generators (kept for variety)
  vec2 shape_superformula(float t, float m, float n1, float n2, float n3){
    float a = 1.0, b = 1.0;
    float r = pow(pow(abs(cos(m*t/4.0)/a), n2) + pow(abs(sin(m*t/4.0)/b), n3), -1.0/n1);
    return r * vec2(cos(t), sin(t));
  }
  vec2 shape_rose(float t, float k){ float r = cos(k*t); return r*vec2(cos(t), sin(t)); }
  vec2 shape_polygon(float t, float n){ float a = 6.28318530718/n; float k = floor(t/a); float ang = (k + 0.5)*a; return vec2(cos(ang), sin(ang)); }
  // helper rotation to keep shapes alive in 3D
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

  // Map id uv->[0,1]^2 into target on chosen shape, with radial fill using s
  vec3 targetFor(int sid, vec2 id, float time){
    float s = fract(id.x + id.y*1.618 + noise(id*17.0)); // [0,1]
    float angle = (id.x + noise(id*3.1))*6.28318530718;
    vec3 p;

    if (sid==0){ // rotating cube
      vec3 p3 = shape_cube(angle / 6.28318530718, s);
      p = applyRotations(p3, time);
    } else if (sid==1){ // sphere
      vec3 p3 = shape_sphere(angle / 6.28318530718, s);
      p = applyRotations(p3, time*0.8);
    } else if (sid==2){ // torus
      vec3 p3 = shape_torus(angle / 6.28318530718, s);
      p = applyRotations(p3, time*1.1);
    } else if (sid==3){ // helix
      vec3 p3 = shape_helix(angle / 6.28318530718, s);
      p = applyRotations(p3, time*0.6);
    } else if (sid==4){ // octahedron
      vec3 p3 = shape_octahedron(angle / 6.28318530718, s);
      p = applyRotations(p3, time*0.9);
    } else if (sid==5){ // superformula (2D -> 3D sheet)
      float m = 6.0 + 2.0*sin(time*0.2);
      float n1 = 0.3 + 0.2*sin(time*0.13);
      float n2 = 1.7 + 0.7*sin(time*0.17);
      float n3 = 1.7 + 0.7*cos(time*0.11);
      vec2 p2 = shape_superformula(angle, m, n1, n2, n3)*(0.3 + 0.7*sqrt(s));
      p = applyRotations(vec3(p2, (noise(id*9.0)-0.5)*0.6), time*0.7);
    } else if (sid==6){ // rose
      float k = 5.0 + floor(mod(time*0.15, 3.0));
      vec2 p2 = shape_rose(angle, k)*(0.3 + 0.7*sqrt(s));
      p = applyRotations(vec3(p2, (noise(id*7.3)-0.5)*0.8), time*0.5);
    } else if (sid==7){ // wave
      vec3 p3 = shape_wave(s, angle / 6.28318530718);
      p = applyRotations(p3, time*0.9);
    } else if (sid==8){ // ribbon
      vec3 p3 = shape_ribbon(angle / 6.28318530718, s);
      p = applyRotations(p3, time*1.0);
    } else if (sid==9){ // icosahedron
      vec3 p3 = shape_icosahedron(angle / 6.28318530718, s);
      p = applyRotations(p3, time*0.75);
    } else { // polygon/star
      float n = 5.0 + floor(mod(time*0.2, 4.0));
      vec2 p2 = shape_polygon(angle, n)*(0.5 + 0.5*sqrt(s));
      p = applyRotations(vec3(p2, (noise(id*4.7)-0.5)*0.4), time*0.4);
    }
    return p;
  }
  `;

  const simFS = `#version 300 es
  precision highp float;
  uniform sampler2D u_pos;
  uniform sampler2D u_vel;
  uniform float u_dt;
  uniform float u_time;
  uniform int u_shapeA;
  uniform int u_shapeB;
  uniform float u_morph; // 0..1
  uniform float u_shapeStrength;
  uniform vec2 u_simSize;
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
    vec2 id = uv; // id on [0,1]^2
    vec4 posData = texture(u_pos, uv);
    vec3 pos = posData.xyz; // 3D позиция
    vec3 vel = texture(u_vel, uv).xyz; // 3D скорость

    float idHash = hash12(id);
    float layerHash = hash12(id*23.7);

    // ==== БАЗОВАЯ ШТОРМОВАЯ ФИЗИКА ====
    vec2 curlLarge = curl(pos.xy * 0.6 + u_time * 0.12);
    vec2 curlMid   = curl(pos.xy * 1.5 - u_time * 0.18);
    vec2 curlFine  = curl(pos.xy * 4.5 + u_time * 0.35 + idHash*6.0);
    vec2 curlCascade = vec2(0.0);
    float amp = 1.2;
    float freq = 0.9;
    for(int i=0;i<4;i++){
      curlCascade += curl(pos.xy * freq + u_time * (0.14 + float(i)*0.07) + layerHash*3.1) * amp;
      freq *= 1.8;
      amp *= 0.6;
    }
    vec2 swirl = (curlLarge * 1.4 + curlMid * 0.8 + curlFine * 0.5 + curlCascade * 0.5);

    vec2 vortexCenter = vec2(sin(u_time*0.17), cos(u_time*0.21))*0.8;
    vec2 rel = pos.xy - vortexCenter;
    float r2 = max(0.08, dot(rel, rel));
    vec2 vortex = vec2(-rel.y, rel.x) / r2 * 0.9;

    vec2 gust = curl(pos.xy * 3.5 + idHash*10.0 + u_time*0.6) * 1.4;
    vec2 wind = normalize(vec2(1.0, 0.3)) * (0.2 + 0.4*sin(u_time*0.6 + idHash*5.0));
    vec2 shimmer = normalize(curl(pos.xy * 6.0 + u_time*0.9 + layerHash*2.4));

    vec3 flow = vec3(swirl + vortex + gust + wind + shimmer*0.4, 0.0);
    float liftNoise = fbm(pos.xy * 0.8 + u_time * 0.2 + layerHash*1.7);
    flow.z = sin(u_time*0.4 + pos.x*2.0 + pos.y*1.3) * 0.6 + sin(u_time*0.7 + layerHash*6.28)*0.3 + liftNoise*0.8;

    vec3 acc = flow * 1.35;
    acc.y -= 0.35; // лёгкая гравитация
    acc *= 1.0 + 0.3*sin(u_time*0.25 + idHash*6.0);
    acc += normalize(vec3(swirl, 0.15)) * 0.15; // легкая закрутка в 3D

    // Дополнительная буря: песчаные слои, сдвиг по высоте и трение
    float altitude = clamp(pos.y * 0.35 + 0.5, 0.0, 1.0);
    vec2 shear = vec2(1.2, 0.0) * mix(1.6, 0.5, altitude); // нижние слои быстрее
    vec2 duneFlow = vec2(
      sin(pos.y * 2.1 + u_time * 0.35 + layerHash * 3.7),
      cos(pos.x * 1.7 - u_time * 0.28 + idHash * 4.1)
    ) * 0.45;
    acc.xy += shear * 0.08 + duneFlow * 0.2;
    acc += vec3(curlCascade * 0.35, 0.0);
    acc += vec3(0.0, 0.25 * fbm(pos.yx * 1.3 + u_time * 0.35), 0.0);

    // Зернистое трение: частицы замедляются ближе к земле и при больших скоростях
    float ground = -1.35;
    float groundProximity = smoothstep(0.0, 1.2, pos.y - ground);
    float drag = mix(0.85, 0.92, groundProximity);
    vel.xy *= drag;
    vel.z *= mix(0.9, 0.97, groundProximity);
    acc.y += smoothstep(0.0, 0.8, -(pos.y - ground)) * 0.35; // подъёмный поток над «поверхностью»

    // ==== ПРИТЯЖЕНИЕ К ФИГУРАМ ====
    vec3 targetA = targetFor(u_shapeA, id, u_time*0.6);
    vec3 targetB = targetFor(u_shapeB, id, u_time*0.63 + 2.7);
    vec3 desired = mix(targetA, targetB, easeInOutCubic(u_morph));

    float affinity = smoothstep(0.15, 0.95, idHash);
    float shapeWeight = u_shapeStrength * affinity;
    vec3 toShape = desired - pos;
    float dist = length(toShape);
    vec3 shapeForce = toShape * (0.8 * shapeWeight) / (1.0 + dist*dist*0.5);
    acc += shapeForce;

    // ==== СОХРАНЯЕМ ОБЛАКО ====
    float roamRadius = 4.5;
    float distCenter = length(pos);
    if (distCenter > roamRadius){
      acc -= pos / distCenter * (distCenter - roamRadius) * 0.6;
    }

    // Интеграция
    vel += acc * u_dt;
    vel *= 0.915;
    float speed = length(vel);
    if (speed > 18.0) vel = vel / speed * 18.0;

    pos += vel * u_dt;
    o_pos = vec4(pos, 1.0);
    o_vel = vec4(vel, 1.0);
  }
  `;
  const initFS = `#version 300 es
  precision highp float;
  uniform float u_seed;
  layout(location=0) out vec4 o_pos;
  layout(location=1) out vec4 o_vel;
  in vec2 v_uv;
  ${commonNoise}

  void main(){
    float h = hash12(v_uv * 311.0 + u_seed);
    float angle = h * 6.28318530718;
    float radius = pow(hash11(h * 97.0), 1.4) * 0.8 + noise(v_uv * 15.0) * 0.12;
    vec3 pos = vec3(
      cos(angle) * radius,
      (hash11(h * 41.0) - 0.5) * 0.6,
      sin(angle) * radius
    );

    vec2 swirl = curl(v_uv * 6.0 + u_seed * 0.37) * 0.8;
    vec3 vel = vec3(swirl, (hash11(h * 13.0) - 0.5) * 0.35);

    o_pos = vec4(pos, 1.0);
    o_vel = vec4(vel, 1.0);
  }
  `;

  const particleVS = `#version 300 es
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

    float size = mix(1.3, 3.8, v_energy);
    size *= 120.0 / (80.0 + v_depth * 45.0);
    gl_PointSize = size;
  }
  `;

  const particleFS = `#version 300 es
  precision highp float;
  in float v_depth;
  in float v_hash;
  in float v_energy;
  in vec3 v_world;
  uniform vec3 u_colorA;
  uniform vec3 u_colorB;
  uniform vec3 u_lightPos;
  uniform float u_time;
  out vec4 o_col;

  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;

    float alpha = smoothstep(1.0, 0.0, r);
    float fresnel = pow(1.0 - clamp(dot(normalize(vec3(p, 0.35)), vec3(0,0,1)), 0.0, 1.0), 2.0);
    float sparkle = smoothstep(0.35, 0.0, r) * (0.55 + 0.45 * sin(u_time * 7.0 + v_hash * 60.0));
    float pulse = 0.35 + 0.65 * sin(u_time * 1.7 + v_energy * 3.5 + v_hash * 11.0);
    vec3 base = mix(u_colorA, u_colorB, fract(v_hash + u_time * 0.08));
    vec3 iridescent = mix(base, vec3(1.2, 0.95, 0.75), 0.45 * pulse);
    vec3 rim = mix(vec3(0.2, 0.35, 0.9), vec3(0.9, 0.2, 0.8), v_energy) * fresnel;
    vec3 lightDir = normalize(u_lightPos - v_world);
    float light = clamp(0.4 + 0.6 * (0.35 + 0.65 * lightDir.y), 0.35, 1.3);
    float depthFade = clamp(1.9 / (1.0 + 0.03 * v_depth * v_depth), 0.1, 1.0);
    float energyGlow = 0.45 + 0.75 * v_energy;
    float core = exp(-r * 3.5);
    float halo = exp(-r * 1.25);

    vec3 color = iridescent * light;
    color += rim * 0.6;
    color *= (energyGlow * alpha + sparkle * 0.18 + core * 0.5);
    color += iridescent * halo * 0.15;

    o_col = vec4(color * depthFade, alpha * 0.9);
  }
  `;
  const blitFS = `#version 300 es
  precision highp float;
  uniform sampler2D u_tex;
  uniform vec2 u_resolution;
  uniform float u_time;
  in vec2 v_uv;
  out vec4 o_col;

  void main(){
    vec2 uv = v_uv;
    vec2 texel = 1.0 / u_resolution;
    vec3 base = texture(u_tex, uv).rgb;

    // Bloom через однопроходный gather blur
    vec3 bloom = vec3(0.0);
    float weight = 0.0;
    for(int x=-3; x<=3; x++){
      for(int y=-3; y<=3; y++){
        vec2 off = vec2(float(x), float(y)) * texel * 1.6;
        float w = exp(-0.4 * float(x*x + y*y));
        bloom += texture(u_tex, uv + off).rgb * w;
        weight += w;
      }
    }
    bloom /= max(0.0001, weight);

    // Хроматические завихрения вокруг ярких зон
    vec2 swirl = (uv - 0.5) * mat2(cos(u_time*0.07), -sin(u_time*0.07), sin(u_time*0.07), cos(u_time*0.07));
    vec3 ray = vec3(
      texture(u_tex, uv + swirl * 0.006).r,
      texture(u_tex, uv - swirl * 0.004).g,
      texture(u_tex, uv + swirl * 0.003).b
    );

    vec3 col = mix(base, bloom, 0.55);
    col += ray * 0.35;

    // Subtle vignette для плавного края сцены
    vec2 p = uv*2.0-1.0;
    p.x *= u_resolution.x/u_resolution.y;
    float vig = smoothstep(1.15, 0.25, length(p));
    col *= vig;

    // Лёгкая пульсация яркости, чтобы подчеркнуть пыль
    col *= 0.94 + 0.06 * sin(u_time * 0.7 + uv.x * 2.5 + uv.y * 1.5);
    col = pow(col, vec3(0.95));

    o_col = vec4(col, 1.0);
  }
  `;

  // Programs
  const progSim = link(simVS, simFS);
  const progInit = link(simVS, initFS);
  const progParticles = link(particleVS, particleFS);
  const progPresent = link(simVS, blitFS);

  // Simulation textures & FBOs
  const texSize = SIM_SIZE;
  const makeSimTex = () => createTex(texSize, texSize, { internalFormat: gl.RGBA32F, srcFormat: gl.RGBA, type: gl.FLOAT });
  const posTex = [makeSimTex(), makeSimTex()];
  const velTex = [makeSimTex(), makeSimTex()];
  const simFBO = [createFBO([posTex[1], velTex[1]], texSize, texSize), createFBO([posTex[0], velTex[0]], texSize, texSize)];
  let simRead = 0; // read from index

  // Trail buffers -> простой render target
  let renderTex = null;
  let renderFBO = null;
  let renderW = 1, renderH = 1;

  const makeRenderTarget = (w, h) => {
    return createTex(w, h, {
      internalFormat: gl.RGBA8,
      srcFormat: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.LINEAR,
      mag: gl.LINEAR
    });
  };

  // Particles index buffer (0..N-1)
  const N = texSize * texSize;
  const idxData = new Float32Array(N);
  for (let i = 0; i < N; i++) idxData[i] = i;
  const idxVAO = gl.createVertexArray();
  gl.bindVertexArray(idxVAO);
  const idxVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, idxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, idxData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Init sim textures via init pass
  gl.viewport(0, 0, texSize, texSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER, simFBO[simRead]);
  gl.useProgram(progInit);
  gl.bindVertexArray(quadVAO);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.uniform1f(gl.getUniformLocation(progInit, 'u_seed'), Math.random()*1000);
  drawQuad();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // After init, read from the textures we just wrote into
  simRead = 1;

  // 3D камера и матрицы
  let camera = {
    angle: { x: 0.5, y: 0.5 },
    distance: 3.5,
    targetDistance: 3.5, // целевое расстояние для плавного zoom
    pos: [0, 0, 3.5],
    target: [0, 0, 0]
  };


  const mat4perspective = (fov, aspect, near, far) => {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,2*far*near*nf,0
    ]);
  };

  // LookAt матрица для правильного позиционирования камеры
  const mat4lookAt = (eye, target, up) => {
    const forward = [
      target[0] - eye[0],
      target[1] - eye[1],
      target[2] - eye[2]
    ];
    const len = Math.sqrt(forward[0]*forward[0] + forward[1]*forward[1] + forward[2]*forward[2]);
    forward[0] /= len; forward[1] /= len; forward[2] /= len;

    const right = [
      up[1] * forward[2] - up[2] * forward[1],
      up[2] * forward[0] - up[0] * forward[2],
      up[0] * forward[1] - up[1] * forward[0]
    ];
    const rlen = Math.sqrt(right[0]*right[0] + right[1]*right[1] + right[2]*right[2]);
    right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

    const newUp = [
      forward[1] * right[2] - forward[2] * right[1],
      forward[2] * right[0] - forward[0] * right[2],
      forward[0] * right[1] - forward[1] * right[0]
    ];

    return new Float32Array([
      right[0], newUp[0], -forward[0], 0,
      right[1], newUp[1], -forward[1], 0,
      right[2], newUp[2], -forward[2], 0,
      -( right[0]*eye[0] + right[1]*eye[1] + right[2]*eye[2] ),
      -( newUp[0]*eye[0] + newUp[1]*eye[1] + newUp[2]*eye[2] ),
      forward[0]*eye[0] + forward[1]*eye[1] + forward[2]*eye[2],
      1
    ]);
  };

  const updateCameraMatrix = () => {
    const cx = Math.cos(camera.angle.x);
    const sx = Math.sin(camera.angle.x);
    const cy = Math.cos(camera.angle.y);
    const sy = Math.sin(camera.angle.y);

    camera.pos[0] = sy * cx * camera.distance;
    camera.pos[1] = sx * camera.distance;
    camera.pos[2] = cy * cx * camera.distance;
  };

  // Mouse handling - вращение камеры при зажатой кнопке
  let mouse = { x: 0, y: 0, down: 0, lastX: 0, lastY: 0 };

  const updateMouse = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ( (e.clientX - rect.left) / rect.width );
    const y = ( (e.clientY - rect.top) / rect.height );

    if (mouse.down) {
      // Вращение камеры при зажатой кнопке
      const dx = (x - mouse.lastX) * Math.PI * 1.5;
      const dy = (y - mouse.lastY) * Math.PI * 1.5;
      camera.angle.y += dx;
      camera.angle.x += dy;
      // Ограничиваем угол X чтобы не перевернуть камеру
      camera.angle.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, camera.angle.x));
      updateCameraMatrix();
      mouse.lastX = x;
      mouse.lastY = y;
    }

    mouse.x = x;
    mouse.y = y;
  };

  window.addEventListener('mousemove', updateMouse);
  window.addEventListener('touchmove', (e)=>{
    if(!e.touches[0]) return;
    updateMouse(e.touches[0]);
  });
  window.addEventListener('mousedown', (e)=> {
    mouse.down = 1;
    const rect = canvas.getBoundingClientRect();
    mouse.lastX = (e.clientX - rect.left) / rect.width;
    mouse.lastY = (e.clientY - rect.top) / rect.height;
  });
  window.addEventListener('mouseup', ()=> mouse.down = 0);
  window.addEventListener('touchstart', (e)=> {
    mouse.down = 1;
    if(!e.touches[0]) return;
    const rect = canvas.getBoundingClientRect();
    mouse.lastX = (e.touches[0].clientX - rect.left) / rect.width;
    mouse.lastY = (e.touches[0].clientY - rect.top) / rect.height;
  }, {passive:true});
  window.addEventListener('touchend', ()=> mouse.down = 0);

  // Zoom при прокрутке колеса мыши - ПЛАВНЫЙ
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomSpeed = 0.15;
    const direction = e.deltaY > 0 ? 1 : -1;
    camera.targetDistance += direction * zoomSpeed;
    camera.targetDistance = Math.max(1.0, Math.min(12, camera.targetDistance));
  }, {passive: false});

  // Resize
  const size = { w: 0, h: 0 };
  function resize(){
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);
    if (w === size.w && h === size.h) return;
    size.w = w; size.h = h;
    const targetW = Math.max(1, Math.floor(w * DPR));
    const targetH = Math.max(1, Math.floor(h * DPR));
    const maxW = Math.min(MAX_RT_SIZE, MAX_VIEWPORT[0]);
    const maxH = Math.min(MAX_RT_SIZE, MAX_VIEWPORT[1]);
    const clampedW = Math.min(targetW, maxW);
    const clampedH = Math.min(targetH, maxH);
    if (clampedW !== targetW || clampedH !== targetH) {
      console.warn('Canvas scaled down to fit GPU limits', { targetW, targetH, clampedW, clampedH, maxRT: MAX_RT_SIZE });
    }
    canvas.width = clampedW;
    canvas.height = clampedH;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    // Создаём render target
    if (renderTex) {
      gl.deleteTexture(renderTex);
      gl.deleteFramebuffer(renderFBO);
    }
    renderW = clampedW;
    renderH = clampedH;
    renderTex = makeRenderTarget(renderW, renderH);
    renderFBO = createFBO([renderTex], renderW, renderH);

    // Очистка
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderFBO);
    gl.viewport(0, 0, renderW, renderH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  window.addEventListener('resize', resize);
  resize();

  // Helper to set sampler at unit
  const bindTex = (prog, name, tex, unit, target=gl.TEXTURE_2D) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  };

  // Shape schedule
  let shapeA = 0, shapeB = 1;
  let morph = 0.0;
  let nextSwitch = 5.0; // Start first transition after 5s
  let transitionSpeed = 12.0;
  let customTransition = 12.0;
  let controlMode = 'preset'; // 'preset' or 'custom'
  let isMorphing = false;
  let shapeMode = 'shapes';
  let targetShapeStrength = 1.0;
  let shapeStrength = 1.0;
  let autoMorph = true;


  const SHAPE_NAMES = [
    'Cube', 'Sphere', 'Torus', 'Helix', 'Octahedron',
    'Superformula', 'Rose', 'Wave', 'Ribbon', 'Icosahedron', 'Polygon'
  ];

  // МНОЖЕСТВЕННЫЕ ЦВЕТОВЫЕ ПАЛИТРЫ
  const colorPalettes = [
    { a: [0.35, 0.78, 1.2], b: [1.15, 0.42, 1.1] },     // Сияющий Синий-Фиолетовый
    { a: [0.12, 1.15, 0.82], b: [1.05, 0.42, 0.8] },    // Лазурный-Пурпур
    { a: [1.15, 0.48, 0.08], b: [0.25, 0.95, 1.15] },   // Оранжево-Голубой неон
    { a: [1.05, 0.25, 0.6], b: [0.25, 1.05, 1.1] },     // Розовый-Циан глянцевый
    { a: [0.4, 1.05, 0.2], b: [0.95, 0.25, 1.1] },      // Лайм-Фиолетовый
    { a: [1.05, 0.92, 0.25], b: [0.32, 0.55, 1.2] },    // Золотисто-Синий
    { a: [0.0, 1.15, 0.95], b: [1.15, 0.2, 0.8] },      // Аквамарин-Пурпур
    { a: [0.85, 0.55, 0.2], b: [0.15, 0.95, 1.15] },    // Медно-Небесный
  ];
  let currentPaletteIndex = 0;

  function scheduleShapes(dt, t) {
    if (shapeMode === 'free') {
      morph = 0.0;
      isMorphing = false;
      return;
    }

    if (!autoMorph) {
      morph = 0.0;
      shapeB = shapeA;
      isMorphing = false;
      return;
    }

    const duration = controlMode === 'custom' ? customTransition : transitionSpeed;

    if (t > nextSwitch) {
      shapeA = shapeB;
      shapeB = (shapeB + 1) % SHAPE_NAMES.length;
      morph = 0.0;
      isMorphing = true;
      nextSwitch = t + duration + 2.0;
      currentPaletteIndex = (currentPaletteIndex + 1) % colorPalettes.length;
      console.log(`Auto-morph: ${SHAPE_NAMES[shapeA]} -> ${SHAPE_NAMES[shapeB]}`);
      updateShapeButtons();
    }

    if (isMorphing) {
      morph += dt / duration;
      if (morph >= 1.0) {
        morph = 1.0;
        isMorphing = false;
        nextSwitch = t + duration;
      }
    }
  }

  // Colors - космические оттенки
  // Colors - будут динамичными
  let colorA = new Float32Array(3);
  let colorB = new Float32Array(3);

  // Render loop
  let last = performance.now();
  console.log('✓ Render loop инициализирован');

  function frame(now) {
    const t = now * 0.001;
    let dt = Math.min(0.033, (now - last) * 0.001);
    last = now;
    scheduleShapes(dt, t);
    shapeStrength += (targetShapeStrength - shapeStrength) * 0.08;

    // ПЛАВНЫЙ ZOOM - интерполяция к целевому расстоянию
    camera.distance += (camera.targetDistance - camera.distance) * 0.1; // плавно
    updateCameraMatrix();

    // Обновляем цвета из текущей палитры
    const palette = colorPalettes[currentPaletteIndex];
    // Переливание цветов в зависимости от морфа
    const colorMix = 0.5 + 0.5 * Math.sin(t * 0.5 + morph * 3.14159); // плавное переливание
    colorA[0] = palette.a[0] + (palette.b[0] - palette.a[0]) * colorMix * 0.3;
    colorA[1] = palette.a[1] + (palette.b[1] - palette.a[1]) * colorMix * 0.3;
    colorA[2] = palette.a[2] + (palette.b[2] - palette.a[2]) * colorMix * 0.3;
    colorB[0] = palette.b[0] + (palette.a[0] - palette.b[0]) * colorMix * 0.2;
    colorB[1] = palette.b[1] + (palette.a[1] - palette.b[1]) * colorMix * 0.2;
    colorB[2] = palette.b[2] + (palette.a[2] - palette.b[2]) * colorMix * 0.2;

    // SIMULATION PASS
    gl.useProgram(progSim);
    gl.viewport(0, 0, texSize, texSize);
    const read = simRead;
    const writeFBO = simFBO[read];
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    bindTex(progSim, 'u_pos', posTex[read], 0);
    bindTex(progSim, 'u_vel', velTex[read], 1);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_time'), t);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeA'), shapeA);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeB'), shapeB);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_morph'), morph);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_shapeStrength'), shapeStrength);
    gl.uniform2f(gl.getUniformLocation(progSim, 'u_simSize'), texSize, texSize);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    simRead = 1 - simRead;

    // RENDER PASS
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderFBO);
    gl.viewport(0, 0, renderW, renderH);
    gl.clearColor(0.01, 0.02, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(progParticles);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(idxVAO);
    bindTex(progParticles, 'u_pos', posTex[simRead], 0);
    gl.uniform2f(gl.getUniformLocation(progParticles, 'u_texSize'), texSize, texSize);
    gl.uniform1f(gl.getUniformLocation(progParticles, 'u_time'), t);
    gl.uniform3fv(gl.getUniformLocation(progParticles, 'u_colorA'), colorA);
    gl.uniform3fv(gl.getUniformLocation(progParticles, 'u_colorB'), colorB);

    const aspect = canvas.width / canvas.height;
    const proj = mat4perspective(Math.PI / 4, aspect, 0.1, 100);
    const view = mat4lookAt(camera.pos, camera.target, [0, 1, 0]);

    gl.uniformMatrix4fv(gl.getUniformLocation(progParticles, 'u_proj'), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(progParticles, 'u_view'), false, view);

    const lightPos = [Math.sin(t * 0.3) * 2, 1.5, Math.cos(t * 0.3) * 2];
    gl.uniform3f(gl.getUniformLocation(progParticles, 'u_lightPos'), lightPos[0], lightPos[1], lightPos[2]);

    gl.drawArrays(gl.POINTS, 0, N);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // PRESENT PASS
    gl.useProgram(progPresent);
    gl.viewport(0, 0, canvas.width, canvas.height);
    bindTex(progPresent, 'u_tex', renderTex, 0);
    gl.uniform2f(gl.getUniformLocation(progPresent, 'u_resolution'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(progPresent, 'u_time'), t);
    drawQuad();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // UI Initialization
  console.log('✓ Инициализация UI...');
  const shapeButtonsContainer = document.getElementById('shapeButtons');
  const speedControl = document.getElementById('speedControl');
  const autoToggle = document.getElementById('autoToggle');

  // Ручной выбор фигуры включает режим фигур
  function selectShape(idx) {
    shapeMode = 'shapes';
    targetShapeStrength = 1.0;
    shapeA = idx;
    shapeB = autoMorph ? (idx + 1) % SHAPE_NAMES.length : idx;
    morph = 0.0;
    isMorphing = autoMorph;
    nextSwitch = performance.now() * 0.001 + transitionSpeed;

    console.log(`✓ Manual shape selection: ${SHAPE_NAMES[idx]}`);
    updateShapeButtons();
    updateModeButtons();
  }

  function updateShapeButtons() {
    document.querySelectorAll('#shapeButtons button').forEach((btn, i) => {
      btn.classList.toggle('active', i === shapeA);
    });
  }

  const modeShapesBtn = document.getElementById('mode-shapes');
  const modeFreeBtn = document.getElementById('mode-free');

  function updateModeButtons() {
    modeShapesBtn.classList.toggle('active', shapeMode === 'shapes');
    modeFreeBtn.classList.toggle('active', shapeMode === 'free');
  }

  SHAPE_NAMES.forEach((name, index) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.id = `shape-${index}`;
    btn.onclick = () => {
      console.log(`🔘 Клик на кнопку ${index}: ${name}`);
      selectShape(index);
    };
    shapeButtonsContainer.appendChild(btn);
  });


  const manualSpeedInput = document.getElementById('manualSpeed');
  const manualMorphValue = document.getElementById('speedValue');
  manualMorphValue.textContent = `${manualSpeedInput.value}s`;

  speedControl.addEventListener('change', (e) => {
    const manualGroup = document.getElementById('manualSpeedGroup');
    if (e.target.value === 'manual') {
      controlMode = 'custom';
      manualGroup.style.display = 'block';
      transitionSpeed = customTransition = parseFloat(manualSpeedInput.value);
    } else {
      controlMode = 'preset';
      manualGroup.style.display = 'none';
      if (e.target.value === 'slow') transitionSpeed = 20.0;
      else if (e.target.value === 'fast') transitionSpeed = 6.0;
      else transitionSpeed = 12.0;
    }
    nextSwitch = performance.now() * 0.001 + transitionSpeed;
  });

  manualSpeedInput.addEventListener('input', (e) => {
    customTransition = parseFloat(e.target.value);
    manualMorphValue.textContent = `${customTransition.toFixed(1)}s`;
    if (controlMode === 'custom') {
      transitionSpeed = customTransition;
      nextSwitch = performance.now() * 0.001 + transitionSpeed;
    }
  });

  autoToggle.addEventListener('change', (e) => {
    autoMorph = e.target.checked;
    if (!autoMorph) {
      shapeB = shapeA;
      morph = 0.0;
      isMorphing = false;
    } else {
      shapeB = (shapeA + 1) % SHAPE_NAMES.length;
      nextSwitch = performance.now() * 0.001 + transitionSpeed;
      isMorphing = true;
    }
  });

  modeShapesBtn.addEventListener('click', () => {
    shapeMode = 'shapes';
    targetShapeStrength = 1.0;
    if (!isMorphing) nextSwitch = performance.now() * 0.001 + transitionSpeed;
    updateModeButtons();
  });

  modeFreeBtn.addEventListener('click', () => {
    shapeMode = 'free';
    targetShapeStrength = 0.0;
    updateModeButtons();
  });

  // Скрываем регулятор при загрузке
  document.getElementById('manualSpeedGroup').style.display = 'none';

  updateShapeButtons();
  updateModeButtons();
  console.log('✓ UI инициализирован успешно!');
})();

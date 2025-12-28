/*
  GPU Particle Shapes — WebGL2
  Thousands of particles morphing between shapes with trails, glow, and mouse turbulence.
  Open index.html in a modern browser (WebGL2 required).
*/

(function () {
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let simSize = 256; // 256x256 = 65,536 частиц по умолчанию

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

  // Эквалайзер - столбцы визуализации частот
  vec3 shape_equalizer(float t, float s, float bass, float mid, float treble, float time){
    // Создаём сетку из столбцов 8x8
    float cols = 8.0;
    float colX = floor(t * cols) / cols;
    float colZ = floor(s * cols) / cols;
    float localT = fract(t * cols);
    float localS = fract(s * cols);

    // Позиция частицы внутри столбца
    float x = (colX - 0.5 + localT / cols) * 2.2;
    float z = (colZ - 0.5 + localS / cols) * 2.2;

    // Определяем к какой частоте относится столбец (по X)
    float freqBand = colX * cols;
    float bandHeight = 0.0;

    // Бас - левые столбцы (0-2)
    if (freqBand < 2.5) {
      bandHeight = bass * 1.8;
    }
    // Середина - центральные столбцы (3-5)
    else if (freqBand < 5.5) {
      bandHeight = mid * 1.5;
    }
    // Высокие - правые столбцы (6-7)
    else {
      bandHeight = treble * 1.2;
    }

    // Добавляем вариации по Z для глубины
    float zVariation = 0.85 + 0.15 * sin(colZ * 12.0 + time * 0.5);
    bandHeight *= zVariation;

    // Высота частицы внутри столбца
    float particleInBar = localS;

    // Частица видна только если она ниже высоты столбца
    float barTop = bandHeight;
    float y = -0.8 + particleInBar * 1.6;

    // Если частица выше столбца - прижимаем к верхушке
    if (particleInBar > barTop) {
      y = -0.8 + barTop * 1.6;
    }

    return vec3(x, y, z);
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
  mat2 rot2(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }

  vec3 fractalFlow(vec2 id, float time, vec4 seed){
    vec2 p = id * 2.0 - 1.0;

    // Мандельброт-подобная итерация
    vec2 c = p * 1.5 + vec2(-0.5, 0.0);
    vec2 z = vec2(0.0);
    float iter = 0.0;
    float maxIter = 12.0;

    for(int i = 0; i < 12; i++) {
      if (dot(z, z) > 4.0) break;
      z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
      iter += 1.0;
    }

    // Нормализуем результат итерации
    float fractalVal = iter / maxIter;

    // Создаём 3D позицию на основе фрактала
    float angle = time * 0.3 + seed.w;
    float radius = 0.3 + fractalVal * 0.7;

    // Спиральная форма с фрактальной модуляцией
    float spiralAngle = p.x * 6.28318 * 2.0 + time * 0.5;
    float height = p.y * 1.2;

    vec3 pos = vec3(
      cos(spiralAngle) * radius * (0.5 + 0.5 * fractalVal),
      height + sin(fractalVal * 6.28318 + time) * 0.3,
      sin(spiralAngle) * radius * (0.5 + 0.5 * fractalVal)
    );

    // Добавляем фрактальные ветви
    float branch = sin(fractalVal * 12.0 + seed.x * 3.0 + time * 0.8) * 0.25;
    pos.xy += vec2(cos(angle), sin(angle)) * branch;

    return pos * 0.85;
  }

  vec3 targetFor(int sid, vec2 id, float time, int seedSlot){
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
    } else if (sid==11){ // фрактальный режим
      vec4 seed = u_fractalSeeds[seedSlot];
      vec3 f = fractalFlow(id, time, seed);
      float shells = 0.4 + 0.35 * sin(time * 0.43 + seed.w);
      p = applyRotations(f * (0.9 + shells), time * 0.45 + seed.w);
      p.xy += curl(id * 8.5 + seed.xy * 2.7 + time * 0.35) * 0.22;
      p.z += sin(angle * 0.6 + seed.z + time * 0.35) * 0.25;
    } else if (sid==12){ // эквалайзер - плоскость с волнами от аудио
      p = shape_equalizer(id.x, id.y, u_audioBass, u_audioMid, u_audioTreble, time);
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

    // ==== УЛУЧШЕННАЯ ФИЗИКА ЧАСТИЦ ====
    float structure = smoothstep(0.1, 0.95, u_shapeStrength);
    float calmFactor = smoothstep(0.55, 1.05, u_shapeStrength);

    // Мягкие завихрения - уменьшена интенсивность для плавности
    vec2 curlLarge = curl(pos.xy * 0.5 + u_time * 0.12) * 0.6;
    vec2 curlMid   = curl(pos.xy * 1.2 - u_time * 0.15) * 0.4;
    vec2 curlFine  = curl(pos.xy * 3.0 + u_time * 0.25 + idHash*4.0) * 0.2;

    vec2 swirl = curlLarge + curlMid + curlFine;

    // Один плавный вихрь
    vec2 vortexCenter = vec2(sin(u_time*0.1), cos(u_time*0.12))*0.3;
    vec2 rel = pos.xy - vortexCenter;
    float r2 = max(0.2, dot(rel, rel));
    vec2 vortex = vec2(-rel.y, rel.x) / r2 * 0.3;

    // Мягкий поток
    vec2 baseFlow = swirl * 0.5 + vortex * 0.3;
    vec2 dampedFlow = mix(baseFlow, swirl * 0.2, calmFactor);

    vec3 flow = vec3(dampedFlow, 0.0);
    flow.z = sin(u_time*0.3 + pos.x*1.5 + pos.y*1.0) * 0.3;

    vec3 acc = flow * mix(0.3, 0.5, 1.0 - structure);
    acc.y -= 0.05; // минимальная гравитация

    // Минимальное демпфирование скорости
    float velMag = length(vel);
    acc -= vel * velMag * 0.02;

    // Плавное трение
    float drag = mix(0.94, 0.97, calmFactor);
    vel *= drag;

    // ==== ПРИТЯЖЕНИЕ К ФИГУРАМ ====
    vec3 targetA = targetFor(u_shapeA, id, u_time*0.6, 0);
    vec3 targetB = targetFor(u_shapeB, id, u_time*0.63 + 2.7, 1);
    vec3 desired = mix(targetA, targetB, easeInOutCubic(u_morph));

    float affinity = smoothstep(0.05, 0.85, idHash);
    float shapeWeight = u_shapeStrength * affinity;
    vec3 toShape = desired - pos;
    float dist = max(0.01, length(toShape));

    // Упрощённое и более сильное притяжение к фигурам
    float springStrength = 12.0 + 8.0 * calmFactor;
    float dampingFactor = exp(-dist * 0.5);
    vec3 shapeForce = toShape * springStrength * shapeWeight * dampingFactor;
    // Добавляем прямое притяжение для близких частиц
    shapeForce += normalize(toShape) * 5.0 * shapeWeight * smoothstep(0.4, 0.0, dist);

    float cohesion = smoothstep(0.0, 0.6, shapeWeight);
    // При высоком shapeWeight заменяем физику на притяжение к фигуре
    acc = mix(acc, shapeForce * 2.0, cohesion * 0.95);
    acc += shapeForce * 0.5;
    // Демпфирование для стабильной формы
    vel *= mix(0.97, 0.88, cohesion * calmFactor);

    // ==== АКТИВНЫЙ КУРСОР (уменьшенная сила) ====
    if (u_pointerActive > 0.5) {
      vec3 toPointer = u_pointerPos - pos;
      float distPointer = length(toPointer);
      float radius = max(0.12, u_pointerRadius);
      float falloff = exp(-pow(distPointer / radius, 1.35));
      float pressBoost = mix(0.5, 1.0, u_pointerPress);
      float base = u_pointerStrength * pressBoost * falloff * 0.4; // глобальное снижение силы
      vec3 dirP = toPointer / max(distPointer, 0.001);
      float jitter = hash11(idHash * 91.0);

      float pulseWave = 0.65 + 0.35 * sin(u_time * 3.5 + jitter * 7.0);
      if (u_pointerMode == 0) {
        // Притяжение/захват (уменьшено)
        acc += dirP * base * 0.8;
        vel += dirP * base * 0.25;
      } else if (u_pointerMode == 1) {
        // Отталкивание и разгон (уменьшено)
        acc -= dirP * base * 1.1;
        acc += vec3(dirP.y, -dirP.x, 0.2) * base * 0.9;
        vel *= 0.985;
      } else if (u_pointerMode == 2 || u_pointerMode == 3) {
        // Вихревой закрут в обе стороны (уменьшено)
        float spin = (u_pointerMode == 2 ? -1.0 : 1.0);
        vec3 tangent = vec3(dirP.y * spin, -dirP.x * spin, dirP.z * 0.35 * spin);
        float spiralBoost = 1.2 + pulseWave * 0.8;
        acc += tangent * base * (1.8 * spiralBoost);
        acc += dirP * base * (0.5 + 0.4 * pulseWave);
        vel = mix(vel, vel + tangent * base * 0.4, 0.25 + 0.15 * pulseWave);
      } else if (u_pointerMode == 4) {
        // Импульсные всплески (уменьшено)
        float pulsePhase = u_time * 4.2 + jitter * 9.0;
        float carrier = 0.55 + 0.45 * sin(pulsePhase);
        float burst = smoothstep(-0.1, 0.9, sin(pulsePhase * 0.7 + 1.2));
        float pulse = 0.6 + carrier + (u_pointerPulse > 0.5 ? burst * 1.0 : carrier * 0.25);
        vec3 swirl = normalize(vec3(-dirP.y, dirP.x, dirP.z * 0.4));
        acc -= dirP * base * (1.0 + burst * 0.7);
        acc += swirl * base * (0.8 + burst * 1.0);
        vel = mix(vel, vel - dirP * base * 0.5 + swirl * base * 0.35, 0.3 * pulse);
      } else if (u_pointerMode == 6) {
        // Квазар: аккреционный диск + двусторонние струи (уменьшено)
        vec3 axis = normalize(u_viewDir * 0.45 + vec3(0.0, 1.0, 0.35));
        vec3 r = pos - u_pointerPos;
        float rLen = max(0.06, length(r));
        vec3 radial = r / rLen;
        float axial = clamp(dot(radial, axis), -1.0, 1.0);
        vec3 diskDir = normalize(radial - axis * axial + 0.0001);
        vec3 swirlDir = normalize(cross(axis, diskDir));
        float diskWeight = exp(-pow(abs(axial), 0.7));
        float jetWeight = smoothstep(0.35, 0.95, abs(axial));
        float funnel = 1.4 / (1.0 + pow(rLen / radius, 1.4));

        acc -= radial * base * (0.5 * diskWeight);
        acc += axis * base * (1.1 * jetWeight * sign(axial));
        acc += swirlDir * base * (1.4 * diskWeight + 0.5 * jetWeight);
        acc += diskDir * base * (0.7 * diskWeight * funnel);
        vel = mix(vel, vel + swirlDir * 0.5 + axis * jetWeight * 0.6, 0.25 * falloff);
      } else {
        // Магнитные дуги с лёгким свирлом (уменьшено)
        vec3 axis = normalize(u_viewDir * 0.6 + vec3(0.0, 1.0, 0.4));
        vec3 r = pos - u_pointerPos;
        float rLen = max(0.08, length(r));
        float r2 = rLen * rLen;
        float r5 = r2 * r2 * rLen + 1e-5;
        vec3 dipole = (3.0 * r * dot(axis, r) / r5) - (axis / max(1e-3, r2 * rLen));
        dipole = clamp(dipole, -vec3(8.0), vec3(8.0));
        vec3 swirlDir = normalize(cross(dipole, axis) + 0.35 * cross(dirP, axis));
        float fluxFalloff = 1.0 / (1.0 + pow(rLen / (radius * 1.2), 2.0));
        float repel = 0.4 + 0.5 * (1.0 - fluxFalloff);
        acc += dipole * base * (0.8 * fluxFalloff);
        acc += swirlDir * base * (1.3 * fluxFalloff);
        acc -= dirP * base * repel;
        vel = mix(vel, vel - dirP * base * 0.35 + dipole * 0.25, 0.3 * falloff);
      }
    }

    // ==== СОХРАНЯЕМ ОБЛАКО ====
    float roamRadius = 4.5;
    float distCenter = length(pos);
    if (distCenter > roamRadius){
      acc -= pos / distCenter * (distCenter - roamRadius) * 0.6;
    }

    // ==== AUDIO REACTIVITY (усиленная) ====
    float audioBoost = 1.0 + u_audioEnergy * 1.2;
    acc *= audioBoost;

    // Bass adds outward pulsing force (усилено)
    float bassForce = u_audioBass * 4.5;
    vec3 outward = normalize(pos - desired) + vec3(0.001);
    acc += outward * bassForce;
    // Дополнительная пульсация для басов
    vel += outward * u_audioBass * 0.8;

    // Mid frequencies add swirling motion (усилено)
    float midAngle = u_audioMid * 3.14159 + u_time;
    vec2 midSwirl = vec2(cos(midAngle), sin(midAngle));
    acc += vec3(midSwirl * u_audioMid * 3.2, 0.0);
    // Добавляем вращательный момент
    vec3 midTangent = vec3(-midSwirl.y, midSwirl.x, sin(u_time * 2.0) * 0.5);
    acc += midTangent * u_audioMid * 2.0;

    // Treble adds vertical lift and sparkle (усилено)
    acc.y += u_audioTreble * 3.8;
    acc += vec3(0.0, 0.0, sin(u_time * 5.0 + idHash * 6.28) * u_audioTreble * 2.5);
    // Дополнительные искорки для высоких частот
    vec3 sparkle = vec3(
      sin(u_time * 7.0 + idHash * 12.56),
      cos(u_time * 8.0 + layerHash * 9.42),
      sin(u_time * 6.0 + idHash * 15.7)
    ) * u_audioTreble * 1.8;
    acc += sparkle;

    // Интеграция
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
  const initFS = `#version 300 es
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

    float size = mix(1.6, 4.6, v_energy);
    size *= 140.0 / (80.0 + v_depth * 36.0);
    size *= clamp(256.0 / u_texSize.x, 0.6, 1.6);
    gl_PointSize = size;
  }
  `;

  const particleFS = `#version 300 es
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
    float idx = floor(h * bands);
    float t = fract(h * bands);
    int i0 = int(clamp(idx, 0.0, bands-1.0));
    int i1 = int(mod(idx + 1.0, bands));
    vec3 c0 = u_colors[i0] * 1.4; // Усиливаем насыщенность
    vec3 c1 = u_colors[i1] * 1.4;
    vec3 result = mix(c0, c1, smoothstep(0.0, 1.0, t));
    // Увеличиваем контраст цветов
    return pow(result, vec3(0.85));
  }

  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;

    float alpha = smoothstep(1.0, 0.0, r);
    float fresnel = pow(1.0 - clamp(dot(normalize(vec3(p, 0.35)), vec3(0,0,1)), 0.0, 1.0), 2.0);
    float sparkle = smoothstep(0.35, 0.0, r) * (0.55 + 0.45 * sin(u_time * 7.0 + v_hash * 60.0));
    float pulse = 0.35 + 0.65 * sin(u_time * 1.7 + v_energy * 3.5 + v_hash * 11.0);

    // Более насыщенный базовый цвет из палитры
    vec3 base = paletteSample(fract(v_hash * 0.7 + v_energy * 0.3 + u_time * 0.05));

    // Меньше разбавления белым, больше сохранения цвета палитры
    vec3 iridescent = mix(base, base * 1.3 + vec3(0.15), 0.25 * pulse);

    // Цветной rim на основе палитры
    vec3 rimColor = paletteSample(fract(v_hash + 0.5));
    vec3 rim = rimColor * fresnel * 0.8;

    vec3 lightDir = normalize(u_lightPos - v_world);
    float light = clamp(0.5 + 0.5 * (0.4 + 0.6 * lightDir.y), 0.45, 1.2);
    float depthFade = clamp(1.9 / (1.0 + 0.025 * v_depth * v_depth), 0.15, 1.0);
    float energyGlow = 0.5 + 0.7 * v_energy;
    float core = exp(-r * 3.5);
    float halo = exp(-r * 1.25);

    vec3 color = iridescent * light;
    color += rim;
    color *= (energyGlow * alpha + sparkle * 0.2 + core * 0.6);
    color += base * halo * 0.25; // Цветное гало

    // Меньше тумана для сохранения цвета
    vec3 fogColor = vec3(0.02, 0.03, 0.06);
    float fog = clamp(exp(-v_depth * 0.15), 0.1, 1.0);
    float volumetric = exp(-r * 2.2) * 0.2;
    color = mix(fogColor, color, fog);
    color += base * volumetric * 0.3; // Цветной объём

    float tone = 1.0 / (1.0 + dot(color, vec3(0.5)));
    color *= tone * 1.5;

    o_col = vec4(color * depthFade, alpha * 0.95);
  }
  `;
  const blitFS = `#version 300 es
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

    vec3 gradient = mix(vec3(0.025, 0.04, 0.08), vec3(0.08, 0.11, 0.16), smoothstep(-0.2, 1.0, uv.y));
    float radial = smoothstep(0.0, 1.0, 1.0 - length(uv - 0.5) * 1.4);
    gradient += radial * vec3(0.06, 0.04, 0.08);

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

    vec2 dir = normalize((uv - 0.5) + 0.001);
    float streak = 0.0;
    float streakWeight = 0.0;
    for(int i=1; i<=4; i++){
      float s = float(i) * 0.018;
      float w = exp(-float(i) * 0.8);
      streak += texture(u_tex, uv - dir * s).r * w;
      streakWeight += w;
    }
    streak /= max(0.0001, streakWeight);
    col += vec3(streak * 0.35);

    // Subtle vignette для плавного края сцены
    vec2 p = uv*2.0-1.0;
    p.x *= u_resolution.x/u_resolution.y;
    float vig = smoothstep(1.15, 0.25, length(p));
    col *= vig;

    // Лёгкая пульсация яркости, чтобы подчеркнуть пыль
    col *= 0.94 + 0.06 * sin(u_time * 0.7 + uv.x * 2.5 + uv.y * 1.5);
    col = pow(col, vec3(0.95));
    float grain = hash(uv * u_time) * 0.015 - 0.0075;
    col += gradient * 0.75 + grain;

    o_col = vec4(col, 1.0);
  }
  `;

  // Programs
  const progSim = link(simVS, simFS);
  const progInit = link(simVS, initFS);
  const progParticles = link(particleVS, particleFS);
  const progPresent = link(simVS, blitFS);

  // Simulation textures & FBOs
  let texSize = simSize;
  let posTex = [];
  let velTex = [];
  let simFBO = [];
  let simRead = 0; // read from index
  let idxVAO = null;
  let idxVBO = null;
  let N = 0;

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

  const destroySimResources = () => {
    posTex.forEach((t) => gl.deleteTexture(t));
    velTex.forEach((t) => gl.deleteTexture(t));
    simFBO.forEach((f) => gl.deleteFramebuffer(f));
    if (idxVBO) gl.deleteBuffer(idxVBO);
    if (idxVAO) gl.deleteVertexArray(idxVAO);
    posTex = [];
    velTex = [];
    simFBO = [];
    idxVAO = null;
    idxVBO = null;
  };

  const makeSimTex = () => createTex(texSize, texSize, { internalFormat: gl.RGBA32F, srcFormat: gl.RGBA, type: gl.FLOAT });

  const initSimulation = (size) => {
    destroySimResources();
    simSize = size;
    texSize = size;
    N = texSize * texSize;

    posTex = [makeSimTex(), makeSimTex()];
    velTex = [makeSimTex(), makeSimTex()];
    simFBO = [createFBO([posTex[1], velTex[1]], texSize, texSize), createFBO([posTex[0], velTex[0]], texSize, texSize)];
    simRead = 0;

    // Particles index buffer (0..N-1)
    const idxData = new Float32Array(N);
    for (let i = 0; i < N; i++) idxData[i] = i;
    idxVAO = gl.createVertexArray();
    gl.bindVertexArray(idxVAO);
    idxVBO = gl.createBuffer();
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
    gl.uniform1f(gl.getUniformLocation(progInit, 'u_pattern'), 0.0);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // After init, read from the textures we just wrote into
    simRead = 1;
  };

  const reinitializeParticles = (pattern = 0.0) => {
    gl.viewport(0, 0, texSize, texSize);
    gl.useProgram(progInit);
    gl.bindVertexArray(quadVAO);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, simFBO[i]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.uniform1f(gl.getUniformLocation(progInit, 'u_seed'), Math.random() * 1000);
      gl.uniform1f(gl.getUniformLocation(progInit, 'u_pattern'), pattern);
      drawQuad();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    simRead = 0;
  };

  initSimulation(simSize);

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

  // Mouse handling - левый клик для курсора, правый для вращения
  let mouse = { x: 0, y: 0, leftDown: false, rightDown: false, lastX: 0, lastY: 0 };

  const updateMouse = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ( (e.clientX - rect.left) / rect.width );
    const y = ( (e.clientY - rect.top) / rect.height );

    if (mouse.rightDown) {
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
  const isUIEvent = (e) => e.target && e.target.closest && e.target.closest('#controls');

  window.addEventListener('mousedown', (e)=> {
    if (isUIEvent(e)) return;
    if (e.button === 0) {
      mouse.leftDown = true;
    }
    if (e.button === 2) {
      mouse.rightDown = true;
      const rect = canvas.getBoundingClientRect();
      mouse.lastX = (e.clientX - rect.left) / rect.width;
      mouse.lastY = (e.clientY - rect.top) / rect.height;
    }
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mouseup', (e)=> {
    if (e.button === 0) mouse.leftDown = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  window.addEventListener('mouseleave', () => {
    mouse.leftDown = false;
    mouse.rightDown = false;
  });
  window.addEventListener('touchstart', (e)=> {
    if (isUIEvent(e)) return;
    mouse.leftDown = true;
    if(!e.touches[0]) return;
    const rect = canvas.getBoundingClientRect();
    mouse.lastX = (e.touches[0].clientX - rect.left) / rect.width;
    mouse.lastY = (e.touches[0].clientY - rect.top) / rect.height;
  }, {passive:true});
  window.addEventListener('touchend', ()=> {
    mouse.leftDown = false;
    mouse.rightDown = false;
  });

  // Zoom при прокрутке колеса мыши - ПЛАВНЫЙ
  window.addEventListener('wheel', (e) => {
    if (e.target.closest('#controls')) return;
    e.preventDefault();
    const zoomSpeed = 0.15;
    const direction = e.deltaY > 0 ? 1 : -1;
    camera.targetDistance += direction * zoomSpeed;
    camera.targetDistance = Math.max(1.0, Math.min(12, camera.targetDistance));
  }, {passive: false});

  const pointerState = {
    active: true,
    mode: 'attract',
    strength: 1.1,
    radius: 1.0,
    pulse: true,
  };

  const POINTER_MODES = ['attract', 'repel', 'vortex-left', 'vortex-right', 'pulse', 'magnet', 'quasar'];

  // ==== AUDIO REACTIVITY ====
  let audioContext = null;
  let audioAnalyser = null;
  let audioDataArray = null;
  let audioSource = null;
  let audioEnabled = false;
  let audioReactivityEnabled = false;
  let audioSensitivity = {
    bass: 1.0,
    mid: 1.0,
    treble: 1.0
  };
  let audioState = {
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    smoothBass: 0,
    smoothMid: 0,
    smoothTreble: 0,
    smoothEnergy: 0
  };

  const initAudio = async (stream) => {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 512;
      audioAnalyser.smoothingTimeConstant = 0.7;

      const bufferLength = audioAnalyser.frequencyBinCount;
      audioDataArray = new Uint8Array(bufferLength);

      if (stream) {
        // Microphone input
        audioSource = audioContext.createMediaStreamSource(stream);
      } else {
        // File input will be handled separately
        return;
      }

      audioSource.connect(audioAnalyser);
      audioEnabled = true;
      console.log('✓ Audio initialized');
    } catch (err) {
      console.error('Audio initialization failed:', err);
      audioEnabled = false;
    }
  };

  const initAudioFromFile = (audioElement) => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 512;
    audioAnalyser.smoothingTimeConstant = 0.7;

    const bufferLength = audioAnalyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);

    if (audioSource) {
      audioSource.disconnect();
    }

    audioSource = audioContext.createMediaElementSource(audioElement);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);
    audioEnabled = true;
    console.log('✓ Audio from file initialized');
  };

  const updateAudioAnalysis = () => {
    if (!audioEnabled || !audioReactivityEnabled || !audioAnalyser || !audioDataArray) {
      audioState.smoothBass += (0 - audioState.smoothBass) * 0.1;
      audioState.smoothMid += (0 - audioState.smoothMid) * 0.1;
      audioState.smoothTreble += (0 - audioState.smoothTreble) * 0.1;
      audioState.smoothEnergy += (0 - audioState.smoothEnergy) * 0.1;
      return;
    }

    audioAnalyser.getByteFrequencyData(audioDataArray);

    const bassEnd = Math.floor(audioDataArray.length * 0.1);
    const midEnd = Math.floor(audioDataArray.length * 0.4);

    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < bassEnd; i++) bass += audioDataArray[i];
    for (let i = bassEnd; i < midEnd; i++) mid += audioDataArray[i];
    for (let i = midEnd; i < audioDataArray.length; i++) treble += audioDataArray[i];

    bass /= (bassEnd * 255);
    mid /= ((midEnd - bassEnd) * 255);
    treble /= ((audioDataArray.length - midEnd) * 255);

    // Apply sensitivity multipliers
    bass *= audioSensitivity.bass;
    mid *= audioSensitivity.mid;
    treble *= audioSensitivity.treble;

    // Clamp values to 0-1 range
    bass = Math.min(1.0, bass);
    mid = Math.min(1.0, mid);
    treble = Math.min(1.0, treble);

    const energy = (bass + mid + treble) / 3;

    const smoothing = 0.15;
    audioState.smoothBass += (bass - audioState.smoothBass) * smoothing;
    audioState.smoothMid += (mid - audioState.smoothMid) * smoothing;
    audioState.smoothTreble += (treble - audioState.smoothTreble) * smoothing;
    audioState.smoothEnergy += (energy - audioState.smoothEnergy) * smoothing;
  };
  const pointerWorld = [0, 0, 0];
  const viewDir = [0, 0, -1];

  const computePointerWorld = () => {
    const nx = mouse.x * 2 - 1;
    const ny = 1 - mouse.y * 2;
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4;
    const depth = Math.max(0.35, camera.distance * 0.55);

    const forward = [
      -camera.pos[0] / camera.distance,
      -camera.pos[1] / camera.distance,
      -camera.pos[2] / camera.distance,
    ];
    viewDir[0] = forward[0];
    viewDir[1] = forward[1];
    viewDir[2] = forward[2];

    const right = [
      forward[2],
      0,
      -forward[0],
    ];
    const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

    let up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const ulen = Math.hypot(up[0], up[1], up[2]) || 1;
    up = up.map((v) => v / ulen);

    const zoomScale = 1.0 + (camera.distance - 1.0) * 0.14;
    const scale = Math.tan(fov / 2) * depth * (1.2 + zoomScale * 0.4);
    pointerWorld[0] = camera.target[0] + forward[0] * depth + (right[0] * nx * aspect + up[0] * ny) * scale;
    pointerWorld[1] = camera.target[1] + forward[1] * depth + (right[1] * nx * aspect + up[1] * ny) * scale;
    pointerWorld[2] = camera.target[2] + forward[2] * depth + (right[2] * nx * aspect + up[2] * ny) * scale;
  };

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
  let transitionSpeed = 15.0;
  let customTransition = 15.0;
  let controlMode = 'preset'; // 'preset' or 'custom'
  let isMorphing = false;
  let shapeMode = 'shapes';
  let targetShapeStrength = 0.95;
  let shapeStrength = 0.95;
  let autoMorph = true;


  const SHAPE_NAMES_EN = [
    'Cube', 'Sphere', 'Torus', 'Helix', 'Octahedron',
    'Superformula', 'Rose', 'Wave', 'Ribbon', 'Icosahedron', 'Polygon'
  ];

  const SHAPE_NAMES_RU = [
    'Куб', 'Сфера', 'Тор', 'Спираль', 'Октаэдр',
    'Суперформула', 'Роза', 'Волна', 'Лента', 'Икосаэдр', 'Полигон'
  ];

  let SHAPE_NAMES = SHAPE_NAMES_RU;

  const FRACTAL_SHAPE_ID = 11;

  // МНОЖЕСТВЕННЫЕ ЦВЕТОВЫЕ ПАЛИТРЫ
  const colorPalettes = [
    { name: 'Polar Aurora', a: [0.35, 0.78, 1.2], b: [1.15, 0.42, 1.1] },
    { name: 'Neon Reef', a: [0.12, 1.15, 0.82], b: [1.05, 0.42, 0.8] },
    { name: 'Amber Ice', a: [1.15, 0.48, 0.08], b: [0.25, 0.95, 1.15] },
    { name: 'Candy Glass', a: [1.05, 0.25, 0.6], b: [0.25, 1.05, 1.1] },
    { name: 'Lime Orchid', a: [0.4, 1.05, 0.2], b: [0.95, 0.25, 1.1] },
    { name: 'Golden Hour', a: [1.05, 0.92, 0.25], b: [0.32, 0.55, 1.2] },
    { name: 'Aqua Pulse', a: [0.0, 1.15, 0.95], b: [1.15, 0.2, 0.8] },
    { name: 'Copper Sky', a: [0.85, 0.55, 0.2], b: [0.15, 0.95, 1.15] },
  ];
  let currentPaletteIndex = 0;

  const MAX_COLOR_STOPS = 6;
  let colorStopCount = 3;
  const colorStops = new Float32Array(MAX_COLOR_STOPS * 3);
  const colorStopsBase = new Float32Array(MAX_COLOR_STOPS * 3);

  const randomFractalSeed = () => [
    Math.random() * 2.6 + 0.4,
    Math.random() * 2.2 + 0.3,
    Math.random() * 1.6 + 0.2,
    Math.random() * Math.PI * 2,
  ];

  const fractalState = {
    seedA: randomFractalSeed(),
    seedB: randomFractalSeed(),
    morph: 0,
    timer: 0,
    duration: 18.0,
  };

  const palettePreview = document.getElementById('palettePreview');
  const paletteLabel = document.getElementById('paletteLabel');

  const paletteToGradient = (palette) => {
    const steps = Array.from({ length: 5 }).map((_, i) => {
      const t = i / 4;
      const r = palette.a[0] * (1 - t) + palette.b[0] * t;
      const g = palette.a[1] * (1 - t) + palette.b[1] * t;
      const b = palette.a[2] * (1 - t) + palette.b[2] * t;
      return `rgb(${(r * 110).toFixed(0)}, ${(g * 110).toFixed(0)}, ${(b * 110).toFixed(0)}) ${Math.round(t * 100)}%`;
    });
    return `linear-gradient(90deg, ${steps.join(', ')})`;
  };

  const rebuildColorStops = () => {
    const palette = colorPalettes[currentPaletteIndex];
    const wobble = Math.random() * Math.PI * 2;
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const t = colorStopCount <= 1 ? 0 : Math.min(1, i / (colorStopCount - 1));
      const vibrato = 0.9 + 0.12 * Math.sin(wobble + t * 4.1 + i * 0.3);
      colorStopsBase[i * 3 + 0] = (palette.a[0] * (1 - t) + palette.b[0] * t) * vibrato;
      colorStopsBase[i * 3 + 1] = (palette.a[1] * (1 - t) + palette.b[1] * t) * vibrato;
      colorStopsBase[i * 3 + 2] = (palette.a[2] * (1 - t) + palette.b[2] * t) * vibrato;
    }
    // Update palette preview with CSS variable
    const gradientCSS = paletteToGradient(palette);
    document.documentElement.style.setProperty('--preview-gradient', gradientCSS);
    if (palettePreview) {
      palettePreview.style.setProperty('--preview-gradient', gradientCSS);
    }
    if (paletteLabel) {
      paletteLabel.textContent = palette.name;
    }
  };
  rebuildColorStops();

  const EQUALIZER_SHAPE_ID_SIM = 12;

  function scheduleShapes(dt, t) {
    if (shapeMode === 'free') {
      morph = 0.0;
      isMorphing = false;
      return;
    }

    if (shapeMode === 'equalizer') {
      shapeA = EQUALIZER_SHAPE_ID_SIM;
      shapeB = EQUALIZER_SHAPE_ID_SIM;
      morph = 0.0;
      isMorphing = false;
      return;
    }

    if (shapeMode === 'fractal') {
      shapeA = FRACTAL_SHAPE_ID;
      shapeB = FRACTAL_SHAPE_ID;
      const hold = 0.18;
      const phase = fractalState.timer / fractalState.duration;
      const clampedPhase = Math.min(1.0, phase);
      const eased = (() => {
        if (clampedPhase < hold) return 0.0;
        if (clampedPhase > 1.0 - hold) return 1.0;
        const u = (clampedPhase - hold) / (1.0 - 2.0 * hold);
        return 0.5 - 0.5 * Math.cos(Math.PI * u);
      })();
      morph = eased;
      fractalState.timer += dt;
      if (fractalState.timer >= fractalState.duration) {
        fractalState.timer = 0.0;
        fractalState.morph = 0.0;
        fractalState.seedA = fractalState.seedB;
        fractalState.seedB = randomFractalSeed();
        fractalState.duration = 18.0 + Math.random() * 6.0;
        currentPaletteIndex = (currentPaletteIndex + 1) % colorPalettes.length;
        rebuildColorStops();
      }
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
      rebuildColorStops();
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

  const animateColorStops = (time) => {
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const swing = 0.92 + 0.12 * Math.sin(time * 0.4 + i * 0.9 + morph * 1.6);
      colorStops[i * 3 + 0] = colorStopsBase[i * 3 + 0] * swing;
      colorStops[i * 3 + 1] = colorStopsBase[i * 3 + 1] * swing;
      colorStops[i * 3 + 2] = colorStopsBase[i * 3 + 2] * swing;
    }
    for (let i = colorStopCount; i < MAX_COLOR_STOPS; i++) {
      colorStops[i * 3 + 0] = colorStops[(colorStopCount - 1) * 3 + 0];
      colorStops[i * 3 + 1] = colorStops[(colorStopCount - 1) * 3 + 1];
      colorStops[i * 3 + 2] = colorStops[(colorStopCount - 1) * 3 + 2];
    }
  };

  // Render loop
  let last = performance.now();
  console.log('✓ Render loop инициализирован');

  function frame(now) {
    const t = now * 0.001;
    let dt = Math.min(0.033, (now - last) * 0.001);
    last = now;
    updateAudioAnalysis();
    scheduleShapes(dt, t);
    const simDt = dt * particleSpeed;
    const shapeBase = shapeMode === 'shapes' ? manualShapeStrength : 0.0;
    if (scatterCooldown > 0.0) {
      scatterCooldown = Math.max(0.0, scatterCooldown - dt);
      const relax = 0.35 + 0.65 * (scatterCooldown / SCATTER_RELAX_TIME);
      targetShapeStrength = Math.min(shapeBase, manualShapeStrength * relax);
    } else {
      targetShapeStrength = shapeBase;
    }
    shapeStrength += (targetShapeStrength - shapeStrength) * 0.08;
    updateShapeForceLabel();

    // ПЛАВНЫЙ ZOOM - интерполяция к целевому расстоянию
    camera.distance += (camera.targetDistance - camera.distance) * 0.1; // плавно
    updateCameraMatrix();
    computePointerWorld();

    animateColorStops(t);

    // SIMULATION PASS
    gl.useProgram(progSim);
    gl.viewport(0, 0, texSize, texSize);
    const read = simRead;
    const writeFBO = simFBO[read];
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    bindTex(progSim, 'u_pos', posTex[read], 0);
    bindTex(progSim, 'u_vel', velTex[read], 1);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_dt'), simDt);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_time'), t);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_speedMultiplier'), particleSpeed);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeA'), shapeA);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeB'), shapeB);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_morph'), morph);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_shapeStrength'), shapeStrength);
    gl.uniform2f(gl.getUniformLocation(progSim, 'u_simSize'), texSize, texSize);
    const pointerActive = pointerState.active && mouse.leftDown;
    const zoomReach = Math.max(0.35, camera.distance * 0.45);
    const zoomPower = Math.pow(3.8 / (zoomReach + 0.25), 0.65);
    const pointerRadius = pointerState.radius * (0.65 + (1.0 / zoomPower) * 0.9);
    const pointerStrength = pointerState.strength * (0.9 + zoomPower * 0.85);
    gl.uniform3f(gl.getUniformLocation(progSim, 'u_pointerPos'), pointerWorld[0], pointerWorld[1], pointerWorld[2]);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerStrength'), pointerStrength);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerRadius'), pointerRadius);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_pointerMode'), POINTER_MODES.indexOf(pointerState.mode));
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerActive'), pointerActive ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerPress'), pointerActive ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerPulse'), pointerState.pulse ? 1.0 : 0.0);
    gl.uniform3f(gl.getUniformLocation(progSim, 'u_viewDir'), viewDir[0], viewDir[1], viewDir[2]);
    gl.uniform4f(gl.getUniformLocation(progSim, 'u_fractalSeeds[0]'), fractalState.seedA[0], fractalState.seedA[1], fractalState.seedA[2], fractalState.seedA[3]);
    gl.uniform4f(gl.getUniformLocation(progSim, 'u_fractalSeeds[1]'), fractalState.seedB[0], fractalState.seedB[1], fractalState.seedB[2], fractalState.seedB[3]);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioBass'), audioState.smoothBass);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioMid'), audioState.smoothMid);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioTreble'), audioState.smoothTreble);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioEnergy'), audioState.smoothEnergy);
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
    gl.uniform1i(gl.getUniformLocation(progParticles, 'u_colorCount'), colorStopCount);
    gl.uniform3fv(gl.getUniformLocation(progParticles, 'u_colors'), colorStops);

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
  const shapeAttractionInput = document.getElementById('shapeAttraction');
  const shapeForceValue = document.getElementById('shapeForceValue');
  const particleCountSlider = document.getElementById('particleCount');
  const particleCountValue = document.getElementById('particleCountValue');
  const particleTextureLabel = document.getElementById('particleTextureLabel');
  const particleCountLabel = document.getElementById('particleCountLabel');
  const resetFlowBtn = document.getElementById('resetFlow');
  const scatterFlowBtn = document.getElementById('scatterFlow');
  const cursorToggle = document.getElementById('cursorActive');
  const cursorModeSelect = document.getElementById('cursorMode');
  const cursorStrengthInput = document.getElementById('cursorStrength');
  const cursorStrengthValue = document.getElementById('cursorStrengthValue');
  const cursorRadiusInput = document.getElementById('cursorRadius');
  const cursorRadiusValue = document.getElementById('cursorRadiusValue');
  const cursorModeLabel = document.getElementById('cursorModeLabel');
  const cursorRadiusLabel = document.getElementById('cursorRadiusLabel');
  const cursorPulseToggle = document.getElementById('cursorPulse');
  const particleSpeedInput = document.getElementById('particleSpeed');
  const particleSpeedValue = document.getElementById('particleSpeedValue');
  const manualGroup = document.getElementById('manualSpeedGroup');
  const colorCountInput = document.getElementById('colorCount');
  const colorCountValue = document.getElementById('colorCountValue');
  const paletteShuffleBtn = document.getElementById('shufflePalette');

  const DEFAULTS = {
    shapeStrength: 0.95,
    transition: 15.0,
    customTransition: 15.0,
    pointerStrength: 1.1,
    pointerRadius: 1.0,
    pointerMode: 'attract',
    particleTexSize: 256,
    colorStops: 3,
    particleSpeed: 1.0,
  };

  let manualShapeStrength = parseFloat(shapeAttractionInput.value);
  const SCATTER_RELAX_TIME = 6.0;
  let scatterCooldown = 0;
  let particleSpeed = DEFAULTS.particleSpeed;

  // Ручной выбор фигуры включает режим фигур
  function selectShape(idx) {
    shapeMode = 'shapes';
    targetShapeStrength = manualShapeStrength;
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
  const modeFractalBtn = document.getElementById('mode-fractal');
  const modeEqualizerBtn = document.getElementById('mode-equalizer');

  function updateModeButtons() {
    modeShapesBtn.classList.toggle('active', shapeMode === 'shapes');
    modeFreeBtn.classList.toggle('active', shapeMode === 'free');
    modeFractalBtn.classList.toggle('active', shapeMode === 'fractal');
    if (modeEqualizerBtn) modeEqualizerBtn.classList.toggle('active', shapeMode === 'equalizer');
  }

  function updateCursorLabels() {
    cursorStrengthValue.textContent = `${pointerState.strength.toFixed(2)}x`;
    cursorRadiusValue.textContent = pointerState.radius.toFixed(2);
    cursorRadiusLabel.textContent = pointerState.radius.toFixed(2);
    cursorModeLabel.textContent = cursorModeSelect.options[cursorModeSelect.selectedIndex].textContent;
  }

  function updateColorLabels() {
    const plural = colorStopCount >= 2 && colorStopCount <= 4 ? 'цвета' : 'цветов';
    colorCountValue.textContent = `${colorStopCount} ${plural}`;
  }

  const formatNumber = (val) => val.toLocaleString('ru-RU');
  function updateParticleLabels() {
    particleCountValue.textContent = formatNumber(texSize * texSize);
    particleTextureLabel.textContent = `${texSize} × ${texSize}`;
    particleCountLabel.textContent = formatNumber(texSize * texSize);
  }

  function updateShapeForceLabel() {
    shapeForceValue.textContent = `${shapeStrength.toFixed(2)}x`;
  }

  function updateParticleSpeedLabel() {
    particleSpeedValue.textContent = `${particleSpeed.toFixed(2)}x`;
  }

  function resetSystem() {
    autoMorph = true;
    autoToggle.checked = true;
    controlMode = 'preset';
    speedControl.value = 'normal';
    transitionSpeed = DEFAULTS.transition;
    customTransition = DEFAULTS.customTransition;
    manualSpeedInput.value = DEFAULTS.customTransition;
    manualMorphValue.textContent = `${customTransition.toFixed(1)}s`;
    manualGroup.style.display = 'none';

    shapeMode = 'shapes';
    shapeA = 0;
    shapeB = 1;
    morph = 0.0;
    isMorphing = false;
    manualShapeStrength = DEFAULTS.shapeStrength;
    shapeStrength = DEFAULTS.shapeStrength;
    targetShapeStrength = DEFAULTS.shapeStrength;
    shapeAttractionInput.value = DEFAULTS.shapeStrength.toFixed(2);
    scatterCooldown = 0;

    camera.angle.x = 0.5;
    camera.angle.y = 0.5;
    camera.targetDistance = 3.5;
    camera.distance = 3.5;
    updateCameraMatrix();

    currentPaletteIndex = 0;
    colorStopCount = DEFAULTS.colorStops;
    colorCountInput.value = colorStopCount;
    rebuildColorStops();

    pointerState.active = true;
    pointerState.mode = DEFAULTS.pointerMode;
    pointerState.strength = DEFAULTS.pointerStrength;
    pointerState.radius = DEFAULTS.pointerRadius;
    pointerState.pulse = true;
    cursorToggle.checked = true;
    cursorModeSelect.value = DEFAULTS.pointerMode;
    cursorStrengthInput.value = DEFAULTS.pointerStrength.toFixed(2);
    cursorRadiusInput.value = DEFAULTS.pointerRadius.toFixed(2);
    cursorPulseToggle.checked = true;
    updateColorLabels();
    fractalState.seedA = randomFractalSeed();
    fractalState.seedB = randomFractalSeed();
    fractalState.morph = 0.0;
    fractalState.duration = 11.0;
    updateCursorLabels();
    particleSpeed = DEFAULTS.particleSpeed;
    particleSpeedInput.value = DEFAULTS.particleSpeed;
    updateParticleSpeedLabel();

    if (texSize !== DEFAULTS.particleTexSize) {
      particleCountSlider.value = DEFAULTS.particleTexSize;
      initSimulation(DEFAULTS.particleTexSize);
      updateParticleLabels();
    } else {
      reinitializeParticles(0.0);
    }

    nextSwitch = performance.now() * 0.001 + transitionSpeed;
    updateShapeButtons();
    updateModeButtons();
    updateShapeForceLabel();
  }

  function scatterParticles() {
    reinitializeParticles(1.0);
    morph = 0.0;
    isMorphing = false;
    scatterCooldown = SCATTER_RELAX_TIME;
    targetShapeStrength = Math.min(manualShapeStrength, manualShapeStrength * 0.55);
    shapeStrength = Math.min(shapeStrength, targetShapeStrength);
    nextSwitch = performance.now() * 0.001 + transitionSpeed * 0.5;
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
  particleSpeed = parseFloat(particleSpeedInput.value);
  updateParticleSpeedLabel();

  speedControl.addEventListener('change', (e) => {
    if (e.target.value === 'manual') {
      controlMode = 'custom';
      manualGroup.style.display = 'block';
      transitionSpeed = customTransition = parseFloat(manualSpeedInput.value);
    } else {
      controlMode = 'preset';
      manualGroup.style.display = 'none';
      if (e.target.value === 'slow') transitionSpeed = 20.0;
      else if (e.target.value === 'fast') transitionSpeed = 6.0;
      else transitionSpeed = 15.0;
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

  shapeAttractionInput.addEventListener('input', (e) => {
    manualShapeStrength = parseFloat(e.target.value);
    if (shapeMode === 'shapes') {
      targetShapeStrength = manualShapeStrength;
    }
    updateShapeForceLabel();
  });

  particleCountSlider.addEventListener('input', (e) => {
    const size = parseInt(e.target.value, 10);
    particleTextureLabel.textContent = `${size} × ${size}`;
    particleCountValue.textContent = formatNumber(size * size);
  });

  particleCountSlider.addEventListener('change', (e) => {
    const size = parseInt(e.target.value, 10);
    initSimulation(size);
    updateParticleLabels();
  });

  particleSpeedInput.addEventListener('input', (e) => {
    particleSpeed = parseFloat(e.target.value);
    updateParticleSpeedLabel();
  });

  cursorToggle.addEventListener('change', (e) => {
    pointerState.active = e.target.checked;
  });

  cursorModeSelect.addEventListener('change', (e) => {
    pointerState.mode = e.target.value;
    updateCursorLabels();
  });

  cursorStrengthInput.addEventListener('input', (e) => {
    pointerState.strength = parseFloat(e.target.value);
    updateCursorLabels();
  });

  cursorRadiusInput.addEventListener('input', (e) => {
    pointerState.radius = parseFloat(e.target.value);
    updateCursorLabels();
  });

  cursorPulseToggle.addEventListener('change', (e) => {
    pointerState.pulse = e.target.checked;
  });

  colorCountInput.addEventListener('input', (e) => {
    colorStopCount = parseInt(e.target.value, 10);
    rebuildColorStops();
    updateColorLabels();
  });

  paletteShuffleBtn.addEventListener('click', () => {
    let next = Math.floor(Math.random() * colorPalettes.length);
    if (next === currentPaletteIndex) next = (next + 1) % colorPalettes.length;
    currentPaletteIndex = next;
    fractalState.timer = 0.0;
    fractalState.seedB = randomFractalSeed();
    rebuildColorStops();
    updateColorLabels();
  });

  resetFlowBtn.addEventListener('click', () => {
    resetSystem();
    console.log('↩️  Сброс к исходному состоянию');
  });

  scatterFlowBtn.addEventListener('click', () => {
    scatterParticles();
    console.log('🌌 Разброс частиц с фрактальным узором');
  });

  modeShapesBtn.addEventListener('click', () => {
    shapeMode = 'shapes';
    targetShapeStrength = manualShapeStrength;
    if (!isMorphing) nextSwitch = performance.now() * 0.001 + transitionSpeed;
    updateModeButtons();
  });

  modeFreeBtn.addEventListener('click', () => {
    shapeMode = 'free';
    targetShapeStrength = 0.0;
    isMorphing = false;
    morph = 0.0;
    updateModeButtons();
  });

  modeFractalBtn.addEventListener('click', () => {
    shapeMode = 'fractal';
    targetShapeStrength = Math.max(1.05, manualShapeStrength);
    fractalState.seedA = randomFractalSeed();
    fractalState.seedB = randomFractalSeed();
    fractalState.morph = 0.0;
    fractalState.timer = 0.0;
    fractalState.duration = 18.0 + Math.random() * 6.0;
    morph = 0.0;
    isMorphing = false;
    rebuildColorStops();
    updateModeButtons();
  });

  // Equalizer mode - particles form a plane and oscillate with audio
  const EQUALIZER_SHAPE_ID = 12;
  if (modeEqualizerBtn) {
    modeEqualizerBtn.addEventListener('click', () => {
      shapeMode = 'equalizer';
      targetShapeStrength = 1.2;
      shapeA = EQUALIZER_SHAPE_ID;
      shapeB = EQUALIZER_SHAPE_ID;
      morph = 0.0;
      isMorphing = false;
      // Enable audio reactivity automatically in equalizer mode
      audioReactivityEnabled = true;
      const audioToggle = document.getElementById('audioEnabled');
      if (audioToggle) audioToggle.checked = true;
      updateModeButtons();
    });
  }

  // ==== AUDIO CONTROLS ====
  const audioEnabledToggle = document.getElementById('audioEnabled');
  const selectAudioFileBtn = document.getElementById('selectAudioFile');
  const audioFileInput = document.getElementById('audioFileInput');
  const audioElement = document.getElementById('audioElement');
  const bassValueLabel = document.getElementById('bassValue');
  const midValueLabel = document.getElementById('midValue');
  const trebleValueLabel = document.getElementById('trebleValue');
  const bassSensitivityInput = document.getElementById('bassSensitivity');
  const midSensitivityInput = document.getElementById('midSensitivity');
  const trebleSensitivityInput = document.getElementById('trebleSensitivity');
  const bassSensitivityValue = document.getElementById('bassSensitivityValue');
  const midSensitivityValue = document.getElementById('midSensitivityValue');
  const trebleSensitivityValue = document.getElementById('trebleSensitivityValue');

  audioEnabledToggle.addEventListener('change', (e) => {
    audioReactivityEnabled = e.target.checked;
    console.log('Audio reactivity:', audioReactivityEnabled ? 'enabled' : 'disabled');
  });

  selectAudioFileBtn.addEventListener('click', () => {
    audioFileInput.click();
  });

  audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      audioElement.src = url;
      audioElement.style.display = 'block';
      audioElement.play();
      initAudioFromFile(audioElement);
      console.log('✓ Audio file loaded:', file.name);
    }
  });

  bassSensitivityInput.addEventListener('input', (e) => {
    audioSensitivity.bass = parseFloat(e.target.value);
    bassSensitivityValue.textContent = audioSensitivity.bass.toFixed(1) + 'x';
  });

  midSensitivityInput.addEventListener('input', (e) => {
    audioSensitivity.mid = parseFloat(e.target.value);
    midSensitivityValue.textContent = audioSensitivity.mid.toFixed(1) + 'x';
  });

  trebleSensitivityInput.addEventListener('input', (e) => {
    audioSensitivity.treble = parseFloat(e.target.value);
    trebleSensitivityValue.textContent = audioSensitivity.treble.toFixed(1) + 'x';
  });

  // Update audio value labels
  setInterval(() => {
    if (bassValueLabel && midValueLabel && trebleValueLabel) {
      bassValueLabel.textContent = Math.round(audioState.smoothBass * 100) + '%';
      midValueLabel.textContent = Math.round(audioState.smoothMid * 100) + '%';
      trebleValueLabel.textContent = Math.round(audioState.smoothTreble * 100) + '%';
    }
  }, 100);

  // Скрываем регулятор при загрузке
  manualGroup.style.display = 'none';

  // ==== LANGUAGE SWITCHING ====
  const translations = {
    ru: {
      subtitle: 'Морфирующий поток частиц с мягким свечением, плавным морфингом и понятными настройками.',
      shapes_flight: 'Фигуры и полёт',
      shapes: 'Фигуры',
      modes: 'Режимы',
      mode_shapes: 'Фигуры',
      mode_free: 'Свободный полёт',
      mode_fractal: 'Фракталы',
      mode_equalizer: 'Эквалайзер',
      colors: 'Цвета',
      color_count: 'Количество цветов',
      shuffle_palette: 'Сменить палитру',
      shape_morphing: 'Морфинг фигур',
      auto_switch: 'Автоматически переключать фигуры',
      auto_speed: 'Скорость автоперехода',
      custom_transition: 'Настраиваемый переход (секунды)',
      shape_attraction: 'Притяжение к фигуре',
      force: 'Сила',
      active_cursor: 'Активный курсор',
      cursor_hint: 'ЛКМ — воздействие курсора, ПКМ — вращение камеры',
      enable_cursor: 'Включить курсор',
      mode: 'Режим',
      radius: 'Радиус',
      interaction_type: 'Тип взаимодействия',
      cursor_attract: 'Притягивать частицы',
      cursor_repel: 'Отталкивать и разгонять',
      cursor_vortex_left: 'Вихрь (левый закрут)',
      cursor_vortex_right: 'Вихрь (правый закрут)',
      cursor_pulse: 'Пульсирующий импульс',
      cursor_quasar: 'Квазар',
      cursor_magnet: 'Магнитный поток',
      cursor_strength: 'Сила курсора',
      influence_radius: 'Радиус влияния',
      pulse_on_press: 'Пульсирующий импульс при зажатии',
      particles: 'Частицы',
      particle_count_label: 'Количество частиц',
      particles_word: 'частиц',
      active: 'Активно',
      particle_speed: 'Скорость частиц',
      quick_actions: 'Быстрые действия',
      reset: 'Сбросить',
      scatter: 'Разброс / узор',
      color_2: 'цвета',
      color_3_4: 'цвета',
      color_5_plus: 'цветов',
      // Audio reactivity
      audio_reactivity: 'Аудио-реактивность',
      audio_hint: 'Частицы реагируют на частотные диапазоны: бас, середина, высокие',
      enable_audio: 'Включить аудио-реактивность',
      audio_source: 'Источник звука',
      use_microphone: 'Микрофон',
      load_audio_file: 'Загрузить файл',
      bass: 'Бас',
      mid: 'Середина',
      treble: 'Высокие',
      bass_sensitivity: 'Чувствительность баса',
      mid_sensitivity: 'Чувствительность середины',
      treble_sensitivity: 'Чувствительность высоких',
      // Speed presets
      speed_slow: 'Медленно (20с)',
      speed_normal: 'Нормально (15с)',
      speed_fast: 'Быстро (6с)',
      speed_custom: 'Свой вариант'
    },
    en: {
      subtitle: 'Morphing particle flow with soft glow, smooth morphing and intuitive controls.',
      shapes_flight: 'Shapes & Flight',
      shapes: 'Shapes',
      modes: 'Modes',
      mode_shapes: 'Shapes',
      mode_free: 'Free Flight',
      mode_fractal: 'Fractals',
      mode_equalizer: 'Equalizer',
      colors: 'Colors',
      color_count: 'Color count',
      shuffle_palette: 'Shuffle palette',
      shape_morphing: 'Shape Morphing',
      auto_switch: 'Automatically switch shapes',
      auto_speed: 'Auto-transition speed',
      custom_transition: 'Custom transition (seconds)',
      shape_attraction: 'Shape attraction',
      force: 'Force',
      active_cursor: 'Active Cursor',
      cursor_hint: 'LMB — cursor interaction, RMB — rotate camera',
      enable_cursor: 'Enable cursor',
      mode: 'Mode',
      radius: 'Radius',
      interaction_type: 'Interaction type',
      cursor_attract: 'Attract particles',
      cursor_repel: 'Repel and accelerate',
      cursor_vortex_left: 'Vortex (left spin)',
      cursor_vortex_right: 'Vortex (right spin)',
      cursor_pulse: 'Pulsing burst',
      cursor_quasar: 'Quasar',
      cursor_magnet: 'Magnetic flow',
      cursor_strength: 'Cursor strength',
      influence_radius: 'Influence radius',
      pulse_on_press: 'Pulse on press',
      particles: 'Particles',
      particle_count_label: 'Particle count',
      particles_word: 'particles',
      active: 'Active',
      particle_speed: 'Particle speed',
      quick_actions: 'Quick actions',
      reset: 'Reset',
      scatter: 'Scatter / pattern',
      color_2: 'colors',
      color_3_4: 'colors',
      color_5_plus: 'colors',
      // Audio reactivity
      audio_reactivity: 'Audio Reactivity',
      audio_hint: 'Particles react to frequency bands: bass, mid, treble',
      enable_audio: 'Enable audio reactivity',
      audio_source: 'Audio source',
      use_microphone: 'Microphone',
      load_audio_file: 'Load file',
      bass: 'Bass',
      mid: 'Mid',
      treble: 'Treble',
      bass_sensitivity: 'Bass sensitivity',
      mid_sensitivity: 'Mid sensitivity',
      treble_sensitivity: 'Treble sensitivity',
      // Speed presets
      speed_slow: 'Slow (20s)',
      speed_normal: 'Normal (15s)',
      speed_fast: 'Fast (6s)',
      speed_custom: 'Custom'
    }
  };

  let currentLang = 'ru'; // Начинаем с русского

  function updateCursorModeLabel() {
    const modeNames = {
      ru: {
        attract: 'Притягивать',
        repel: 'Отталкивать',
        'vortex-left': 'Вихрь (левый)',
        'vortex-right': 'Вихрь (правый)',
        pulse: 'Пульсация',
        quasar: 'Квазар',
        magnet: 'Магнитный'
      },
      en: {
        attract: 'Attract',
        repel: 'Repel',
        'vortex-left': 'Vortex (left)',
        'vortex-right': 'Vortex (right)',
        pulse: 'Pulse',
        quasar: 'Quasar',
        magnet: 'Magnetic'
      }
    };
    cursorModeLabel.textContent = modeNames[currentLang][pointerState.mode] || modeNames[currentLang]['attract'];
  }

  function switchLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];

    // Update shape names based on language
    SHAPE_NAMES = lang === 'ru' ? SHAPE_NAMES_RU : SHAPE_NAMES_EN;

    // Update shape buttons text
    document.querySelectorAll('#shapeButtons button').forEach((btn, i) => {
      if (i < SHAPE_NAMES.length) {
        btn.textContent = SHAPE_NAMES[i];
      }
    });

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        el.textContent = t[key];
      }
    });

    // Update option elements
    document.querySelectorAll('[data-i18n-opt]').forEach(el => {
      const key = el.getAttribute('data-i18n-opt');
      if (t[key]) {
        el.textContent = t[key];
      }
    });

    // Update color count label with proper pluralization
    updateColorLabels();

    // Update cursor mode label
    updateCursorModeLabel();

    // Update language button text
    const langBtn = document.getElementById('langToggle');
    langBtn.textContent = lang === 'ru' ? 'EN' : 'РУ';

    console.log('✓ Язык переключен на:', lang === 'ru' ? 'русский' : 'english');
  }

  // Language toggle button
  const langToggle = document.getElementById('langToggle');
  langToggle.addEventListener('click', () => {
    switchLanguage(currentLang === 'ru' ? 'en' : 'ru');
  });

  // Override updateColorLabels to use translations
  updateColorLabels = function() {
    const count = colorStopCount;
    const t = translations[currentLang];
    let plural;
    if (currentLang === 'ru') {
      plural = count === 1 ? 'цвет' : (count >= 2 && count <= 4 ? t.color_3_4 : t.color_5_plus);
    } else {
      plural = count === 1 ? 'color' : t.color_2;
    }
    colorCountValue.textContent = `${count} ${plural}`;
  };

  // Override cursorModeSelect change handler
  cursorModeSelect.addEventListener('change', (e) => {
    const mode = e.target.value;
    pointerState.mode = mode;
    updateCursorModeLabel();
  });

  updateShapeButtons();
  updateModeButtons();
  updateParticleLabels();
  updateShapeForceLabel();
  updateCursorLabels();
  updateColorLabels();

  // Initialize with Russian
  switchLanguage('ru');

  console.log('✓ UI инициализирован успешно!');
})();

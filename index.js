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
  // Isometric projection helper
  vec2 iso(vec3 p){
    // Isometric projection matrix
    float angleX = 0.615; // ~35.264 degrees
    float angleY = 0.785; // 45 degrees
    mat3 rotY = mat3(
      cos(angleY), 0.0, sin(angleY),
      0.0, 1.0, 0.0,
      -sin(angleY), 0.0, cos(angleY)
    );
    mat3 rotX = mat3(
      1.0, 0.0, 0.0,
      0.0, cos(angleX), -sin(angleX),
      0.0, sin(angleX), cos(angleX)
    );
    vec3 rotated = rotX * rotY * p;
    return rotated.xy;
  }

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

  // Map id uv->[0,1]^2 into target on chosen shape, with radial fill using s
  vec2 targetFor(int sid, vec2 id, float time){
    float s = fract(id.x + id.y*1.618 + noise(id*17.0)); // [0,1]
    float angle = (id.x + noise(id*3.1))*6.28318530718;
    vec2 p;
    
    if (sid==0){ // rotating cube
      vec3 p3 = shape_cube(angle / 6.28318530718, s);
      mat3 rotZ = mat3(cos(time*0.3), -sin(time*0.3), 0.0, sin(time*0.3), cos(time*0.3), 0.0, 0.0, 0.0, 1.0);
      p = iso(rotZ * p3);
    } else if (sid==1){ // sphere
      vec3 p3 = shape_sphere(angle / 6.28318530718, s);
      mat3 rotY = mat3(cos(time*0.2), 0.0, sin(time*0.2), 0.0, 1.0, 0.0, -sin(time*0.2), 0.0, cos(time*0.2));
      p = iso(rotY * p3);
    } else if (sid==2){ // torus
      vec3 p3 = shape_torus(angle / 6.28318530718, s);
      mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(time*0.25), -sin(time*0.25), 0.0, sin(time*0.25), cos(time*0.25));
      p = iso(rotX * p3);
    } else if (sid==3){ // helix
      vec3 p3 = shape_helix(angle / 6.28318530718, s);
      mat3 rotY = mat3(cos(time*0.15), 0.0, sin(time*0.15), 0.0, 1.0, 0.0, -sin(time*0.15), 0.0, cos(time*0.15));
      p = iso(rotY * p3);
    } else if (sid==4){ // octahedron
      vec3 p3 = shape_octahedron(angle / 6.28318530718, s);
      mat3 rotZ = mat3(cos(time*0.28), -sin(time*0.28), 0.0, sin(time*0.28), cos(time*0.28), 0.0, 0.0, 0.0, 1.0);
      mat3 rotY = mat3(cos(time*0.2), 0.0, sin(time*0.2), 0.0, 1.0, 0.0, -sin(time*0.2), 0.0, cos(time*0.2));
      p = iso(rotY * rotZ * p3);
    } else if (sid==5){ // superformula (2D)
      float m = 6.0 + 2.0*sin(time*0.2);
      float n1 = 0.3 + 0.2*sin(time*0.13);
      float n2 = 1.7 + 0.7*sin(time*0.17);
      float n3 = 1.7 + 0.7*cos(time*0.11);
      p = shape_superformula(angle, m, n1, n2, n3)*(0.3 + 0.7*sqrt(s));
    } else if (sid==6){ // rose
      float k = 5.0 + floor(mod(time*0.15, 3.0));
      p = shape_rose(angle, k)*(0.3 + 0.7*sqrt(s));
    } else if (sid==7){ // wave
      vec3 p3 = shape_wave(s, angle / 6.28318530718);
      mat3 rotZ = mat3(cos(time*0.2), -sin(time*0.2), 0.0, sin(time*0.2), cos(time*0.2), 0.0, 0.0, 0.0, 1.0);
      p = iso(rotZ * p3);
    } else if (sid==8){ // ribbon
      vec3 p3 = shape_ribbon(angle / 6.28318530718, s);
      mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(time*0.22), -sin(time*0.22), 0.0, sin(time*0.22), cos(time*0.22));
      p = iso(rotX * p3);
    } else if (sid==9){ // icosahedron
      vec3 p3 = shape_icosahedron(angle / 6.28318530718, s);
      mat3 rotZ = mat3(cos(time*0.24), -sin(time*0.24), 0.0, sin(time*0.24), cos(time*0.24), 0.0, 0.0, 0.0, 1.0);
      mat3 rotY = mat3(cos(time*0.18), 0.0, sin(time*0.18), 0.0, 1.0, 0.0, -sin(time*0.18), 0.0, cos(time*0.18));
      p = iso(rotY * rotZ * p3);
    } else { // polygon/star
      float n = 5.0 + floor(mod(time*0.2, 4.0));
      p = shape_polygon(angle, n)*(0.5 + 0.5*sqrt(s));
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
  uniform vec2 u_simSize;
  layout(location=0) out vec4 o_pos;
  layout(location=1) out vec4 o_vel;
  in vec2 v_uv;
  ${commonNoise}
  ${shapesGLSL}
  
  // Профессиональные easing функции
  float easeInOutQuint(float t){
    return t < 0.5 ? 16.0*t*t*t*t*t : 1.0 - pow(-2.0*t + 2.0, 5.0) / 2.0;
  }
  
  float easeOutExpo(float t){
    return t == 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t);
  }
  
  float easeInOutBack(float t){
    float c1 = 1.70158;
    float c2 = c1 * 1.525;
    return t < 0.5
      ? (pow(2.0 * t, 2.0) * ((c2 + 1.0) * 2.0 * t - c2)) / 2.0
      : (pow(2.0 * t - 2.0, 2.0) * ((c2 + 1.0) * (t * 2.0 - 2.0) + c2) + 2.0) / 2.0;
  }
  
  void main(){
    vec2 uv = v_uv;
    vec2 id = uv; // id on [0,1]^2
    vec4 posData = texture(u_pos, uv);
    vec3 pos = posData.xyz; // 3D позиция
    vec3 vel = texture(u_vel, uv).xyz; // ВАЖНО: читаем 3D скорость!

    // Волновое плавное перетекание
    float idHash = hash12(id);
    float wave = sin(u_morph * 3.14159 + idHash * 6.28318);
    float morphEased = easeInOutQuint(u_morph);
    
    // Добавляем волновой эффект для органичности
    float waveMorph = mix(morphEased, wave * 0.5 + 0.5, 0.15);
    waveMorph = clamp(waveMorph, 0.0, 1.0);
    
    // Target attraction (morphing between two shapes)
    vec2 tA = targetFor(u_shapeA, id, u_time);
    vec2 tB = targetFor(u_shapeB, id, u_time*0.93 + 12.3);
    vec2 target2D = mix(tA, tB, waveMorph);
    
    // Плавное спиральное движение во время перехода
    float transitionIntensity = sin(u_morph * 3.14159); // 0->1->0
    float morphSpiralAngle = u_morph * 6.28318 + idHash * 3.14159;
    vec2 spiral = vec2(cos(morphSpiralAngle), sin(morphSpiralAngle)) * transitionIntensity * 0.08;
    target2D += spiral;
    
    // ==== ФИГУРА ВНУТРИ ПОТОКА ЧАСТИЦ ====
    float layerHash = fract(idHash * 7.13);
    float personHash = fract(idHash * 13.37);
    float depthHash = fract(idHash * 17.13);
    
    // ОЧЕНЬ РАЗМЫТОЕ облако вокруг фигуры + случайное распределение везде
    // 50% частиц летают ВЕЗДЕ, 50% группируются вокруг фигуры (но размыто)
    float isCloudParticle = step(0.3, personHash); // 30% летают везде, 70% формируют фигуру
    
    // Целевая позиция фигуры - ОЧЕНЬ слабое влияние
    vec2 targetPos = target2D * (0.05 + 0.05 * sin(u_time * 0.1)); // пульсирует между 0.05 и 0.1
    
    // Облако размытости вокруг фигуры (очень большое)
    float cloudSpread = 1.5 + 0.5 * sin(u_time * 0.08 + personHash); // 1.5-2.0 радиус облака
    vec2 cloudNoise = vec2(
        sin(personHash * 100.0 + u_time * 0.2) * cloudSpread,
        cos(personHash * 73.0 + u_time * 0.15) * cloudSpread
    );
    
    // Целевые позиции - ОЧЕНЬ различные для каждого типа
    vec3 coreTarget = vec3(targetPos, 0.0); // ядро фигуры
    vec3 cloudTarget = vec3(cloudNoise, (depthHash - 0.5) * 4.0); // облако вокруг с БОЛЬШИМ Z-разбросом
    vec3 randomTarget = vec3(
        (personHash - 0.5) * 4.0,
        (layerHash - 0.5) * 4.0,
        (depthHash - 0.5) * 4.0
    ); // совсем случайное распределение везде
    
    // Микс целей в зависимости от категории частицы
    vec3 shapeTarget = mix(coreTarget, mix(cloudTarget, randomTarget, step(0.7, personHash)), isCloudParticle);
    vec3 toShape = shapeTarget - pos;
    float distToShape = length(toShape);
    
    // ОЧЕНЬ слабое притяжение - почти нет (частицы летают свободно)
    float attractionStrength = (1.0 - isCloudParticle) * 0.08 * exp(-distToShape * 0.3); // было 0.01, усилил до 0.08
    vec3 shapeForce = normalize(toShape + vec3(0.001)) * attractionStrength;
    
    // ===== УСИЛЕННЫЕ ЗАВИХРЕНИЯ КАК В РЕАЛЬНОМ ПЕСКЕ =====
    // Множественные вихри - более мощные и быстрые
    vec2 vortex1Center = vec2(sin(u_time * 0.12 + 0.3) * 0.8, cos(u_time * 0.10 + 0.7) * 0.8);
    vec2 vortex2Center = vec2(cos(u_time * 0.14 + 1.2) * 0.9, sin(u_time * 0.11 + 1.8) * 0.9);
    vec2 vortex3Center = vec2(sin(u_time * 0.08 + 2.1) * 0.7, cos(u_time * 0.13 + 2.9) * 0.7);
    
    vec2 toVortex1 = pos.xy - vortex1Center;
    vec2 toVortex2 = pos.xy - vortex2Center;
    vec2 toVortex3 = pos.xy - vortex3Center;
    
    float dist1 = length(toVortex1) + 0.15;
    float dist2 = length(toVortex2) + 0.15;
    float dist3 = length(toVortex3) + 0.15;
    
    // МОЩНЫЕ вихревые силы (тангенциальные)
    vec2 vortexForce1 = vec2(-toVortex1.y, toVortex1.x) / (dist1 * dist1) * 1.2;
    vec2 vortexForce2 = vec2(-toVortex2.y, toVortex2.x) / (dist2 * dist2) * 1.0;
    vec2 vortexForce3 = vec2(-toVortex3.y, toVortex3.x) / (dist3 * dist3) * 0.9;
    
    vec2 totalVortex = (vortexForce1 + vortexForce2 + vortexForce3) * 0.8;
    
    // СПИРАЛЬНЫЕ ПОТОКИ - более выраженные (как в песочных часах)
    float spiralFlowAngle = atan(pos.y, pos.x) + u_time * 0.4;
    float spiralRadius = length(pos.xy);
    float spiralForce = sin(spiralRadius * 2.0 - u_time) * 0.3;
    vec2 spiralFlow = vec2(
        -sin(spiralFlowAngle) * (spiralRadius + 0.2) * 0.5,
        cos(spiralFlowAngle) * (spiralRadius + 0.2) * 0.5
    ) + vec2(cos(spiralFlowAngle), sin(spiralFlowAngle)) * spiralForce;
    
    // ТУРБУЛЕНТНЫЕ ВИХРИ на 4 разных масштабах
    vec2 turbulence1 = curl(pos.xy * 0.3 + u_time * 0.08) * 1.5;
    vec2 turbulence2 = curl(pos.xy * 0.8 + u_time * 0.12) * 1.0;
    vec2 turbulence3 = curl(pos.xy * 2.0 + u_time * 0.06) * 0.6;
    vec2 turbulence4 = curl(pos.xy * 5.0 + u_time * 0.15) * 0.3;
    vec2 totalTurbulence = (turbulence1 + turbulence2 + turbulence3 + turbulence4) * 0.7;
    
    // 3D турбулентность для Z-оси
    float zTurbulence = sin(u_time * 0.2 + pos.x * 2.0 + pos.y * 3.0 + personHash * 10.0) * 0.4;
    
    // Радиальные волны от центра (более сильные)
    vec2 radialDir = normalize(pos.xy + vec2(0.001));
    float radialWave = sin(length(pos.xy) * 2.0 - u_time * 1.5) * 0.6;
    vec2 radialForce = radialDir * radialWave;
    
    // Случайное направление для каждой частицы (более выраженное)
    float randomAngle = personHash * 6.28318 + u_time * 0.15 + layerHash * 3.14159;
    vec2 randomDir = vec2(cos(randomAngle), sin(randomAngle)) * 0.5;
    
    // ===== УЛУЧШЕННАЯ ФИЗИКА ПЕСКА =====
    // Гравитация - песок падает!
    float gravity = 0.1 * (0.5 + sin(u_time * 0.1 + personHash) * 0.5); // пульсирует
    vec3 gravityForce = vec3(0.0, -gravity, -gravity * 0.5); // вниз И назад
    
    // Сопротивление воздуха
    float dragCoeff = 0.15 * length(vel);
    vec3 dragForce = -vec3(vel.x, vel.y, 0.0) * dragCoeff * 0.2;
    
    // Трение частиц друг о друга (коллективное поведение)
    vec2 collectiveFlow = normalize(curl(id * 50.0 + u_time * 0.05)) * 0.2;
    vec3 flockingForce = vec3(collectiveFlow, 0.0) * 0.1;
    
    // ===== КОМБИНИРУЕМ ВСЕ СИЛЫ =====
    vec3 acc = vec3(
        totalVortex.x + spiralFlow.x + totalTurbulence.x + radialForce.x + randomDir.x,
        totalVortex.y + spiralFlow.y + totalTurbulence.y + radialForce.y + randomDir.y,
        0.0
    ) + shapeForce + gravityForce + dragForce + flockingForce;
    
    // ВОЛНООБРАЗНЫЕ КОЛЕБАНИЯ во ВСЕХ направлениях (более выраженные)
    acc.x += sin(u_time * 0.22 + personHash * 10.0) * 0.4;
    acc.y += cos(u_time * 0.18 + personHash * 12.0) * 0.4;
    acc.z += sin(u_time * 0.15 + personHash * 8.0 + depthHash * 5.0) * 0.4;
    acc.z += zTurbulence * 0.3; // добавляем 3D турбулентность в Z
    
    // Integrate - 3D интеграция!
    vel += acc * u_dt; // используем ПОЛНОЕ ускорение (XYZ)!
    
    // Очень слабый damping - полная свобода
    vel *= 0.88;
    
    // Ограничение скорости (только для безопасности, но ОЧЕНЬ высокий лимит)
    float speed = length(vel);
    if (speed > 20.0) { // был 6.0, теперь 20.0 - намного выше
        vel = (vel / speed) * 20.0;
    }
    
    // Обновляем позицию по всем трём осям!
    pos += vel * u_dt; // 3D обновление вместо только xy
    
    // БЕЗ НИКАКИХ ОГРАНИЧЕНИЙ И CLAMP!
    // Частицы летают свободно во всём пространстве

    o_pos = vec4(pos, 1.0);
    o_vel = vec4(vel, 0.0); // 3D скорость (vel.xyz)
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
    vec2 id = v_uv;
    // РАВНОМЕРНОЕ распределение по ВСЕМУ экрану (большой радиус)
    float r = sqrt(fract(noise(id*91.13 + u_seed))) * 2.5;
    float a = 6.2831853*fract(noise(id*13.7 + u_seed*1.7));
    float depth = (fract(noise(id*33.7 + u_seed*2.3)) - 0.5) * 4.0; // было 1.0, теперь 4.0 - В 4 раза больше!
    vec3 pos = vec3(r*vec2(cos(a), sin(a)), depth);
    vec3 vel = vec3(0.0); // 3D скорость!
    o_pos = vec4(pos, 1.0);
    o_vel = vec4(vel, 0.0); // 3D скорость
  }
  `;

  const particleVS = `#version 300 es
  precision highp float;
  layout(location=0) in float a_idx; // index 0..N-1
  uniform sampler2D u_pos;
  uniform vec2 u_texSize;
  uniform mat4 u_proj;
  uniform mat4 u_view;
  uniform float u_time;
  out float v_vmag;
  out vec2 v_id;
  out float v_hash;
  out float v_depth;
  vec2 idxToUV(float idx){
    float x = mod(idx, u_texSize.x);
    float y = floor(idx / u_texSize.x);
    return (vec2(x + 0.5, y + 0.5)) / u_texSize;
  }
  float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  void main(){
    vec2 uv = idxToUV(a_idx);
    vec4 posData = texture(u_pos, uv);
    vec3 pos = posData.xyz;
    
    // Применяем view и projection матрицы
    vec4 viewPos = u_view * vec4(pos, 1.0);
    gl_Position = u_proj * viewPos;
    
    // Size variation by hash and depth
    v_hash = hash11(a_idx+1.0);
    v_depth = posData.w;
    v_vmag = 0.0;
    v_id = uv;
    
    // Размер зависит от глубины (перспектива)
    float depthScale = 1.0 + posData.z * 0.3;
    float baseSize = (5.0 + v_hash * 3.0) * depthScale * max(0.3, 1.0 - length(viewPos.xy) * 0.2);
    gl_PointSize = max(2.0, baseSize);
  }
  `;

  const particleFS = `#version 300 es
  precision highp float;
  uniform vec3 u_colorA;
  uniform vec3 u_colorB;
  uniform float u_time;
  uniform vec3 u_lightPos;
  in float v_vmag;
  in vec2 v_id;
  in float v_hash;
  in float v_depth;
  out vec4 o_col;
  
  // Улучшенная процедурная текстура
  float perlinNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  // Fractional Brownian Motion для сложных текстур
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * perlinNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }
  
  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    
    // ===== УЛУЧШЕННАЯ ФОРМА ЧАСТИЦЫ =====
    float shape = sqrt(1.0 - r * r * 0.9);
    vec3 normal = normalize(vec3(p.x, p.y, shape * 0.8));
    
    // Микротекстура через FBM
    float microDetail = fbm(p * 12.0 + v_hash * 100.0) * 0.4;
    normal += normal * microDetail * 0.15;
    normal = normalize(normal);
    
    // ===== СЛОЖНАЯ ТЕКСТУРА И ЦВЕТ =====
    float hueMix = fract(v_hash + v_id.x * 0.37 + u_time * 0.01);
    vec3 baseColor = mix(u_colorA, u_colorB, hueMix);
    
    // Многослойная текстура
    float texture1 = perlinNoise(p * 6.0 + vec2(v_hash)) * 0.3 + 0.7;
    float texture2 = fbm(p * 3.0 + u_time * 0.05 + vec2(v_hash * 17.0)) * 0.2 + 0.8;
    float colorVar = texture1 * texture2;
    baseColor *= colorVar;
    
    // Цветовая вариация по глубине
    baseColor += vec3(0.1, 0.2, 0.3) * v_depth;
    
    // ===== ПРОДВИНУТОЕ ОСВЕЩЕНИЕ С RAY TRACING =====
    vec3 lightDir = normalize(u_lightPos);
    
    // Основное освещение
    float diffuse = max(0.0, dot(normal, lightDir)) * 0.6 + 0.4;
    
    // Острые зеркальные блики (ray tracing effect)
    vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfDir)), 24.0); // очень острый
    vec3 specColor = mix(vec3(1.0), baseColor, 0.3) * spec * 0.7;
    
    // Fresnel отражение (стеклоподобный эффект)
    float fresnel = pow(1.0 - dot(normal, viewDir), 3.0) * 0.6;
    
    // Ambient occlusion в трещинах текстуры
    float ao = mix(0.4, 1.0, shape) * (0.8 + microDetail * 0.2);
    
    // Rim lighting для контура
    float rim = pow(1.0 - dot(normal, viewDir), 2.5) * 0.4;
    
    // ===== ИТОГОВЫЙ ЦВЕТ =====
    vec3 finalColor = baseColor * diffuse * ao;
    finalColor += specColor;
    finalColor += baseColor * rim * 0.5;
    finalColor += fresnel * vec3(0.5, 0.8, 1.0);
    
    // Динамичное мерцание
    float twinkle = 0.8 + 0.2 * sin(u_time * 1.8 + v_hash * 100.0 + perlinNoise(vec2(v_hash) * 10.0) * 5.0);
    finalColor *= twinkle;
    
    // ===== ГАЛО И BLOOM ЭФФЕКТ =====
    float haloInner = exp(-r * r * 4.0) * 0.5;
    float haloOuter = exp(-r * r * 1.2) * 0.2;
    finalColor += mix(baseColor, vec3(0.3, 0.7, 1.0), 0.5) * (haloInner + haloOuter);
    
    // Дополнительный bloom для ярких частиц
    if (dot(finalColor, vec3(0.299, 0.587, 0.114)) > 0.6) {
      finalColor += vec3(0.1, 0.3, 0.6) * 0.5;
    }
    
    // ===== ФИНАЛЬНАЯ АЛЬФА =====
    float alpha = smoothstep(1.0, 0.0, r);
    alpha = pow(alpha, 0.3); // очень мягко
    
    o_col = vec4(finalColor * alpha, alpha * 0.85);
  }
  `;

  const blitFS = `#version 300 es
  precision highp float;
  uniform sampler2D u_tex;
  uniform vec2 u_resolution;
  in vec2 v_uv;
  out vec4 o_col;
  
  void main(){
    vec2 uv = v_uv;
    vec3 col = texture(u_tex, uv).rgb;
    
    // Subtle vignette для плавного края сцены
    vec2 p = uv*2.0-1.0;
    p.x *= u_resolution.x/u_resolution.y;
    float vig = smoothstep(1.2, 0.2, length(p));
    col *= vig;
    
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
  let autoTransition = true;
  let transitionSpeed = 12.0;
  let controlMode = 'auto'; // 'auto' or 'manual'
  let manualMorphTarget = 0.0;
  let isMorphing = false;


  const SHAPE_NAMES = [
    'Cube', 'Sphere', 'Torus', 'Helix', 'Octahedron',
    'Superformula', 'Rose', 'Wave', 'Ribbon', 'Icosahedron', 'Polygon'
  ];

  // МНОЖЕСТВЕННЫЕ ЦВЕТОВЫЕ ПАЛИТРЫ
  const colorPalettes = [
    { a: [0.2, 0.5, 1.0], b: [0.6, 0.3, 1.0] },     // Синий-Фиолетовый
    { a: [0.1, 0.8, 0.4], b: [1.0, 0.2, 0.8] },     // Зелёный-Малиновый
    { a: [1.0, 0.3, 0.0], b: [0.0, 0.8, 1.0] },     // Оранжевый-Голубой
    { a: [0.9, 0.1, 0.3], b: [0.2, 0.9, 0.8] },     // Розовый-Голубой
    { a: [0.3, 0.9, 0.1], b: [0.8, 0.1, 0.9] },     // Лайм-Фиолетовый
    { a: [1.0, 0.8, 0.0], b: [0.2, 0.3, 1.0] },     // Жёлтый-Синий
    { a: [0.0, 1.0, 0.8], b: [1.0, 0.0, 0.5] },     // Аквамарин-Пурпур
    { a: [0.8, 0.4, 0.1], b: [0.1, 0.8, 0.9] },     // Коричневый-Светло-голубой
  ];
  let currentPaletteIndex = 0;

  function scheduleShapes(t) {
      if (controlMode === 'auto') {
        if (t > nextSwitch) {
          shapeA = shapeB;
          shapeB = (shapeB + 1) % SHAPE_NAMES.length;
          morph = 0.0;
          isMorphing = true;
          nextSwitch = t + transitionSpeed + 2.0;
          currentPaletteIndex = (currentPaletteIndex + 1) % colorPalettes.length;
          console.log(`Auto-morph: ${SHAPE_NAMES[shapeA]} -> ${SHAPE_NAMES[shapeB]}`);
          updateShapeButtons();
        }
        if (isMorphing) {
          morph += 0.002;
          if (morph >= 1.0) {
            morph = 1.0;
            isMorphing = false;
          }
        }
      } else { // manual
        const diff = manualMorphTarget - morph;
        if (Math.abs(diff) > 0.001) {
          morph += diff * 0.1; // Smooth easing
        } else {
          morph = manualMorphTarget;
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
    scheduleShapes(t);

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
    gl.uniform2f(gl.getUniformLocation(progSim, 'u_simSize'), texSize, texSize);
    drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    simRead = 1 - simRead;

    // RENDER PASS
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderFBO);
    gl.viewport(0, 0, renderW, renderH);
    gl.clearColor(0.02, 0.02, 0.04, 1.0);
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

  // Функция для выбора фигуры вручную (ДОЛЖНА БЫТЬ ДО forEach!)
  function selectShape(idx) {
    if (shapeA === idx && controlMode === 'manual') return;

    controlMode = 'manual';
    document.getElementById('speedControl').value = 'manual';
    document.getElementById('manualSpeedGroup').style.display = 'block';

    shapeA = idx;
    shapeB = (idx + 1) % SHAPE_NAMES.length;
    morph = 0.0;
    manualMorphTarget = 0.0;

    const manualSpeedInput = document.getElementById('manualSpeed');
    const manualMorphValue = document.getElementById('speedValue');
    manualSpeedInput.value = 0.0;
    manualMorphValue.textContent = '0.00';

    console.log(`✓✓✓ Manual shape selection: ${SHAPE_NAMES[idx]}`);
    updateShapeButtons();
  }

  function updateShapeButtons() {
    document.querySelectorAll('#shapeButtons button').forEach((btn, i) => {
      btn.classList.toggle('active', i === shapeA);
    });
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

  speedControl.addEventListener('change', (e) => {
    controlMode = e.target.value;
    const manualGroup = document.getElementById('manualSpeedGroup');
    if (controlMode === 'manual') {
      manualGroup.style.display = 'block';
      autoTransition = false;
      // Set slider to current morph value
      manualMorphTarget = morph;
      manualSpeedInput.value = morph;
      manualMorphValue.textContent = morph.toFixed(2);
    } else {
      manualGroup.style.display = 'none';
      autoTransition = true;
      isMorphing = true; // Start auto-morphing
      nextSwitch = performance.now() * 0.001 + 2.0; // Schedule next transition
    }
  });

  manualSpeedInput.addEventListener('input', (e) => {
    if (controlMode === 'manual') {
        manualMorphTarget = parseFloat(e.target.value);
        manualMorphValue.textContent = manualMorphTarget.toFixed(2);
    }
  });

  // Скрываем регулятор при загрузке
  document.getElementById('manualSpeedGroup').style.display = 'none';

  updateShapeButtons();
  console.log('✓ UI инициализирован успешно!');
})();

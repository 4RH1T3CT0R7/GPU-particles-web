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
    // Настоящая спираль с увеличивающимся радиусом
    float totalTurns = 5.0; // 5 витков
    float angle = s * 6.28318530718 * totalTurns;
    float height = (s * 2.0 - 1.0) * 1.4;
    // Радиус плавно увеличивается от центра к краям
    float radius = 0.3 + s * 0.5;
    // Добавляем волнистость для органичности
    float wave = 0.08 * sin(angle * 2.0 + t * 6.28);
    return vec3(
      (radius + wave) * cos(angle),
      height,
      (radius + wave) * sin(angle)
    );
  }

  vec3 shape_octahedron(float t, float s){
    // Правильный октаэдр - 6 вершин, 8 треугольных граней
    // Вершины: ±X, ±Y, ±Z
    float face = floor(t * 8.0);
    float u = fract(t * 8.0);
    float v = s;

    vec3 v0, v1, v2;

    // Верхняя пирамида (вершина +Y)
    if (face < 1.0) {
      v0 = vec3(1,0,0); v1 = vec3(0,0,1); v2 = vec3(0,1,0);
    } else if (face < 2.0) {
      v0 = vec3(0,0,1); v1 = vec3(-1,0,0); v2 = vec3(0,1,0);
    } else if (face < 3.0) {
      v0 = vec3(-1,0,0); v1 = vec3(0,0,-1); v2 = vec3(0,1,0);
    } else if (face < 4.0) {
      v0 = vec3(0,0,-1); v1 = vec3(1,0,0); v2 = vec3(0,1,0);
    }
    // Нижняя пирамида (вершина -Y)
    else if (face < 5.0) {
      v0 = vec3(1,0,0); v1 = vec3(0,0,-1); v2 = vec3(0,-1,0);
    } else if (face < 6.0) {
      v0 = vec3(0,0,-1); v1 = vec3(-1,0,0); v2 = vec3(0,-1,0);
    } else if (face < 7.0) {
      v0 = vec3(-1,0,0); v1 = vec3(0,0,1); v2 = vec3(0,-1,0);
    } else {
      v0 = vec3(0,0,1); v1 = vec3(1,0,0); v2 = vec3(0,-1,0);
    }

    // Интерполяция внутри треугольника (барицентрические координаты)
    float sqrtV = sqrt(v);
    vec3 p = v0 * (1.0 - sqrtV) + mix(v1, v2, u) * sqrtV;

    return normalize(p) * 0.75;
  }

  vec3 shape_wave(float t, float s){
    // Волна 3D
    float x = (t - 0.5) * 2.0;
    float y = sin(t * 6.28318530718 * 3.0) * 0.5;
    float z = cos(t * 6.28318530718) * (s - 0.5);
    return vec3(x * 0.5, y, z) * 0.7;
  }

  vec3 shape_ribbon(float t, float s){
    // Лента Мёбиуса - топологическая поверхность с одной стороной
    float angle = t * 6.28318530718; // Полный оборот 0..2π

    // Ширина ленты (более широкая для наглядности)
    float stripWidth = 0.4;
    float w = (s - 0.5) * stripWidth; // -0.2 до +0.2

    // Радиус основной окружности
    float R = 0.8;

    // При обходе на 360° лента делает пол-оборота (π) вокруг своей оси
    float twist = angle * 0.5; // Половина оборота = эффект Мёбиуса

    // Толщина ленты для 3D эффекта
    float thickness = 0.05;
    // Используем часть s для толщины (создаём слои)
    float sLocal = fract(s * 3.0);  // 3 слоя по толщине
    float layer = (sLocal - 0.5) * thickness;

    // Направления в локальной системе координат ленты
    // Нормаль к поверхности ленты (меняется при кручении)
    vec3 normal = vec3(
      cos(twist) * cos(angle),
      cos(twist) * sin(angle),
      sin(twist)
    );

    // Тангенс вдоль ширины ленты (перпендикулярен основной окружности)
    vec3 widthDir = vec3(
      cos(twist) * cos(angle),
      cos(twist) * sin(angle),
      sin(twist)
    );

    // Базовая точка на центральной окружности
    float baseX = R * cos(angle);
    float baseY = 0.0;  // Лента лежит в плоскости XZ
    float baseZ = R * sin(angle);

    // Смещение по ширине ленты с учётом кручения
    float offsetX = w * cos(twist) * cos(angle);
    float offsetY = w * sin(twist);
    float offsetZ = w * cos(twist) * sin(angle);

    // Добавляем толщину
    float thickX = layer * sin(twist) * cos(angle);
    float thickY = layer * cos(twist);
    float thickZ = layer * sin(twist) * sin(angle);

    // Финальная позиция
    float x = baseX + offsetX + thickX;
    float y = baseY + offsetY + thickY;
    float z = baseZ + offsetZ + thickZ;

    // Добавляем лёгкую волну вдоль ленты для живости
    float waveAmp = 0.03;
    y += sin(angle * 4.0) * waveAmp * (1.0 - abs(w) / stripWidth);

    // Частицы концентрируются на краях ленты (контур)
    float edgeFactor = smoothstep(0.3, 0.5, abs(s - 0.5) * 2.0);

    return vec3(x, y, z) * 0.9;
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

  // Эквалайзер - ЧЁТКИЕ столбцы с явными контурами
  vec3 shape_equalizer(float t, float s, float bass, float mid, float treble, float time){
    // Количество столбцов эквалайзера
    float numBars = 16.0;
    float barWidth = 3.0 / numBars;  // Ширина столбца
    float gapRatio = 0.15;  // Промежуток между столбцами (15% от ширины)

    // Определяем позицию X
    float xRange = 3.0;  // от -1.5 до 1.5
    float xBase = (t - 0.5) * xRange;

    // Определяем индекс текущего столбца
    float barIndex = floor((t * numBars));
    float barCenter = (barIndex + 0.5) / numBars;  // Центр столбца [0,1]
    float localT = fract(t * numBars);  // Позиция внутри столбца [0,1]

    // Создаём чёткие границы столбцов
    float inBar = smoothstep(0.0, gapRatio, localT) * smoothstep(1.0, 1.0 - gapRatio, localT);
    float barEdge = pow(inBar, 0.5);  // Более резкие края

    // X координата привязана к столбцу
    float x = ((barCenter - 0.5) * xRange);

    // Z определяется параметром s - глубина столбца
    float zRange = 1.8;
    float z = (s - 0.5) * zRange;

    // Позиция внутри глубины столбца
    float depthEdge = smoothstep(0.0, 0.1, s) * smoothstep(1.0, 0.9, s);

    // Проверяем наличие аудио
    float totalEnergy = bass + mid + treble;
    bool hasAudio = totalEnergy > 0.01;

    // Демо-анимация - независимые частоты для каждого столбца
    float barPhase = barIndex * 0.7 + time;
    float demoWave1 = 0.5 + 0.5 * sin(time * 2.0 + barIndex * 0.5);
    float demoWave2 = 0.5 + 0.5 * sin(time * 2.5 + barIndex * 0.8 + 2.0);
    float demoWave3 = 0.5 + 0.5 * sin(time * 3.0 + barIndex * 1.2 + 4.0);

    // Усиленная чувствительность с лучшим балансом
    float useBass = hasAudio ? bass * 3.5 : demoWave1;
    float useMid = hasAudio ? mid * 3.2 : demoWave2;
    float useTreble = hasAudio ? treble * 2.8 : demoWave3;

    // Распределение частот по столбцам (слева направо: бас -> высокие)
    float normBar = barIndex / (numBars - 1.0);

    // Более равномерное разделение частот - каждая частота покрывает треть спектра
    float bassZone = smoothstep(0.45, 0.0, normBar);
    float midZone = 1.0 - abs(normBar - 0.5) * 3.0;
    midZone = max(0.0, midZone);
    float trebleZone = smoothstep(0.55, 1.0, normBar);

    // Нормализуем зоны чтобы избежать чрезмерных значений
    float totalZone = bassZone + midZone + trebleZone;
    if (totalZone > 0.01) {
      bassZone /= totalZone;
      midZone /= totalZone;
      trebleZone /= totalZone;
    }

    float barHeight = (useBass * bassZone + useMid * midZone + useTreble * trebleZone) * 0.85;

    // Базовая плоскость
    float baseY = -0.9;

    // Высота столбца
    float columnHeight = barHeight * 2.0;

    // Распределение частиц внутри столбца по высоте
    // s определяет высоту внутри столбца
    float heightFactor = s;

    // Частицы заполняют столбец снизу вверх до высоты columnHeight
    float maxY = baseY + columnHeight;
    float y = baseY + heightFactor * columnHeight;

    // Яркий "верхний край" столбца - частицы концентрируются наверху
    float topConcentration = smoothstep(0.6, 1.0, heightFactor);

    // Вертикальные рёбра столбцов - привязка к краям
    float edgeFactor = abs(localT - 0.5) * 2.0;  // 0 в центре, 1 на краях
    float onEdge = smoothstep(0.7, 0.95, edgeFactor);

    // Горизонтальные линии на уровнях (сетка)
    float gridLines = 5.0;
    float gridY = fract(heightFactor * gridLines);
    float onGridLine = smoothstep(0.1, 0.0, gridY) + smoothstep(0.9, 1.0, gridY);
    onGridLine *= 0.3;

    // Если частица на ребре, сдвигаем к краю столбца
    float xOffset = (localT - 0.5) * barWidth * 0.9;
    x += xOffset;

    // Передняя/задняя грань
    float frontBack = abs(s - 0.5) * 2.0;
    float onFrontBack = smoothstep(0.8, 1.0, frontBack);

    // Создаём контуры - частицы группируются на рёбрах
    float contourStrength = max(onEdge, onFrontBack) * barEdge * depthEdge;

    // Небольшое движение для живости
    float wobble = sin(time * 2.0 + barIndex * 1.5) * 0.02 * barEdge;
    y += wobble;

    // Пульсация верхушки
    float topPulse = sin(time * 4.0 + barIndex * 0.8) * 0.05 * topConcentration;
    y += topPulse;

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

    // 10 типов фракталов для разнообразия
    int fractalType = int(mod(seed.w * 10.0, 10.0));

    float zoom = 1.0 + seed.x * 0.3;
    vec2 center = vec2(-0.5 + seed.y * 0.2, seed.z * 0.15);
    vec2 c, z;
    float maxIter = 48.0;
    float smoothIter = 0.0;
    bool escaped = false;
    float colorMod = 0.0;  // Дополнительный параметр для цвета

    // Выбираем тип фрактала
    if (fractalType == 0) {
      // Мандельброт - классика
      c = p * zoom + center;
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 1) {
      // Julia Set - анимированный параметр
      float jTime = time * 0.08;
      vec2 juliaC = vec2(-0.7 + sin(jTime) * 0.25, 0.27015 + cos(jTime * 1.3) * 0.12);
      z = p * zoom * 1.5;
      c = juliaC;
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 2) {
      // Burning Ship
      c = p * zoom + vec2(-0.5, -0.5);
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(z.x*z.x - z.y*z.y, 2.0*abs(z.x*z.y)) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 3) {
      // Tricorn (Mandelbar)
      c = p * zoom + center;
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(z.x*z.x - z.y*z.y, -2.0*z.x*z.y) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 4) {
      // Newton Fractal (z^3 - 1)
      z = p * zoom * 2.0;
      for(int i = 0; i < 48; i++) {
        vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
        vec2 z3 = vec2(z2.x*z.x - z2.y*z.y, z2.x*z.y + z2.y*z.x);
        vec2 fz = vec2(z3.x - 1.0, z3.y);
        vec2 fpz = vec2(3.0 * z2.x, 3.0 * z2.y);
        float denom = fpz.x*fpz.x + fpz.y*fpz.y + 0.0001;
        vec2 ratio = vec2((fz.x*fpz.x + fz.y*fpz.y) / denom,
                          (fz.y*fpz.x - fz.x*fpz.y) / denom);
        z = z - ratio;
        vec2 root1 = vec2(1.0, 0.0);
        vec2 root2 = vec2(-0.5, 0.866);
        vec2 root3 = vec2(-0.5, -0.866);
        float d1 = length(z - root1);
        float d2 = length(z - root2);
        float d3 = length(z - root3);
        float minDist = min(d1, min(d2, d3));
        if (minDist < 0.01) {
          smoothIter = float(i) + (1.0 - minDist * 100.0);
          colorMod = (d1 < d2 && d1 < d3) ? 0.0 : ((d2 < d3) ? 0.33 : 0.66);
          escaped = true;
          break;
        }
        smoothIter = float(i);
      }
    }
    else if (fractalType == 5) {
      // Phoenix fractal - память о предыдущем z
      vec2 zPrev = vec2(0.0);
      float pParam = -0.5 + sin(time * 0.1) * 0.2;
      c = p * zoom + vec2(-0.5, 0.0);
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        vec2 zNew = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c + pParam * zPrev;
        zPrev = z;
        z = zNew;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 6) {
      // Multibrot z^4 - более сложная симметрия
      c = p * zoom * 0.8 + center;
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        // z^4 = (z^2)^2
        vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
        z = vec2(z2.x*z2.x - z2.y*z2.y, 2.0*z2.x*z2.y) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 7) {
      // Celtic fractal - вариация с abs
      c = p * zoom + vec2(-0.3, 0.0);
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(abs(z.x*z.x - z.y*z.y), 2.0*z.x*z.y) + c;
        smoothIter = float(i);
      }
    }
    else if (fractalType == 8) {
      // Perpendicular Mandelbrot
      c = p * zoom + center;
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        z = vec2(z.x*z.x - z.y*z.y, -2.0*abs(z.x)*z.y) + c;
        smoothIter = float(i);
      }
    }
    else {
      // Buffalo fractal - комбинация abs
      c = p * zoom + vec2(-0.4, -0.3);
      z = vec2(0.0);
      for(int i = 0; i < 48; i++) {
        float zLen = dot(z, z);
        if (zLen > 4.0) {
          smoothIter = float(i) - log2(log2(zLen) / log2(4.0));
          escaped = true;
          break;
        }
        float zx = abs(z.x*z.x - z.y*z.y) - abs(2.0*z.x*z.y);
        float zy = abs(2.0*z.x*z.y);
        z = vec2(zx, zy) + c;
        smoothIter = float(i);
      }
    }

    // Нормализуем
    float fractalVal = smoothIter / maxIter;
    fractalVal = clamp(fractalVal, 0.0, 1.0);

    // Внутренние точки
    if (!escaped) {
      fractalVal = 0.5 + 0.5 * sin(length(z) * 10.0 + time);
    }

    // 3D спиральная структура
    float baseAngle = atan(p.y, p.x);
    float dist = length(p);

    // Уникальные паттерны для каждого фрактала
    float typeF = float(fractalType);
    float arms = 3.0 + mod(typeF * 1.7, 5.0);
    float spiralSpeed = 0.2 + mod(typeF * 0.13, 0.3);
    float spiral = baseAngle * arms + fractalVal * 6.28 + time * spiralSpeed;
    float wave = 0.5 + 0.5 * sin(spiral * (1.0 + typeF * 0.15));

    // Радиус и высота зависят от фрактала
    float r = (0.3 + fractalVal * 0.7) * (0.6 + 0.4 * wave);
    float h = (fractalVal - 0.5) * 1.6;
    h += sin(spiral * 0.5) * 0.25 * fractalVal;

    // Различные геометрии для разных фракталов
    if (fractalType == 4 || fractalType == 5) {
      // Newton/Phoenix - трёхлучевая симметрия
      h += sin(baseAngle * 3.0 + time * 0.5) * 0.2 * fractalVal;
    } else if (fractalType == 6) {
      // Multibrot z^4 - четырёхлучевая симметрия
      r *= 1.0 + 0.2 * sin(baseAngle * 4.0 + fractalVal * 8.0);
    } else if (fractalType == 7 || fractalType == 8 || fractalType == 9) {
      // Celtic/Perp/Buffalo - более хаотичные формы
      h += sin(fractalVal * 15.0 + baseAngle * 2.0) * 0.15;
      r *= 1.0 + 0.15 * cos(fractalVal * 12.0 - time * 0.4);
    }

    // Финальная позиция
    float rotAngle = baseAngle + time * spiralSpeed + seed.w * 6.28;
    vec3 pos = vec3(
      cos(rotAngle) * r,
      h,
      sin(rotAngle) * r
    );

    // Органическое движение
    pos.x += sin(fractalVal * 10.0 + time * 0.7) * 0.1 * fractalVal;
    pos.z += cos(fractalVal * 8.0 - time * 0.5) * 0.08 * fractalVal;
    pos.y += sin(dist * 5.0 + time * 0.4) * 0.06;

    return pos;
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
    float structure = smoothstep(0.1, 0.9, u_shapeStrength);
    float calmFactor = smoothstep(0.5, 1.0, u_shapeStrength);

    // Многослойные завихрения для органичного движения
    vec2 curlLarge = curl(pos.xy * 0.4 + u_time * 0.1) * 0.7;
    vec2 curlMid   = curl(pos.xy * 1.0 + pos.z * 0.3 - u_time * 0.12) * 0.5;
    vec2 curlFine  = curl(pos.xy * 2.5 + u_time * 0.2 + idHash*3.0) * 0.25;
    float curlZ = noise(pos.xy * 1.5 + u_time * 0.15) - 0.5;

    vec2 swirl = curlLarge + curlMid + curlFine;

    // Плавающий центр вихря
    vec2 vortexCenter = vec2(sin(u_time*0.08), cos(u_time*0.1))*0.4;
    vec2 rel = pos.xy - vortexCenter;
    float r2 = max(0.15, dot(rel, rel));
    vec2 vortex = vec2(-rel.y, rel.x) / r2 * 0.35;

    // Органичный поток с 3D компонентой
    vec2 baseFlow = swirl * 0.55 + vortex * 0.35;
    vec2 dampedFlow = mix(baseFlow, swirl * 0.25, calmFactor);

    vec3 flow = vec3(dampedFlow, curlZ * 0.4);
    flow.z += sin(u_time*0.25 + pos.x*1.2 + pos.y*0.8) * 0.35;

    vec3 acc = flow * mix(0.35, 0.55, 1.0 - structure);
    acc.y -= 0.04; // лёгкая гравитация

    // Улучшенное демпфирование скорости
    float velMag = length(vel);
    acc -= vel * velMag * 0.018;

    // Адаптивное трение
    float drag = mix(0.93, 0.965, calmFactor);
    vel *= drag;

    // ==== ПРИТЯЖЕНИЕ К ФИГУРАМ ====
    vec3 targetA = targetFor(u_shapeA, id, u_time*0.55, 0);
    vec3 targetB = targetFor(u_shapeB, id, u_time*0.58 + 2.5, 1);
    vec3 desired = mix(targetA, targetB, easeInOutCubic(u_morph));

    float affinity = smoothstep(0.03, 0.9, idHash);
    float shapeWeight = u_shapeStrength * affinity;
    vec3 toShape = desired - pos;
    float dist = max(0.005, length(toShape));
    vec3 dirToShape = toShape / dist;

    // Усиленное притяжение к фигурам с плавным приближением
    float springStrength = 15.0 + 10.0 * calmFactor;
    float dampingFactor = exp(-dist * 0.4);
    vec3 shapeForce = toShape * springStrength * shapeWeight * dampingFactor;

    // Притяжение для близких частиц с мягкой посадкой
    float closeRange = smoothstep(0.5, 0.0, dist);
    shapeForce += dirToShape * 6.0 * shapeWeight * closeRange;

    // Дополнительная стабилизация при приближении к цели
    float nearTarget = smoothstep(0.15, 0.0, dist);
    shapeForce += dirToShape * 3.0 * shapeWeight * nearTarget;
    vel *= mix(1.0, 0.85, nearTarget * shapeWeight); // Мягкое торможение

    float cohesion = smoothstep(0.0, 0.55, shapeWeight);
    // Плавный переход к притяжению к фигуре
    acc = mix(acc, shapeForce * 2.2, cohesion * 0.92);
    acc += shapeForce * 0.6;
    // Демпфирование для стабильной формы
    vel *= mix(0.96, 0.87, cohesion * calmFactor);

    // ==== АКТИВНЫЙ КУРСОР ====
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
        // Притяжение/захват (усилено для заметности)
        acc += dirP * base * 1.5;
        vel += dirP * base * 0.45;
      } else if (u_pointerMode == 1) {
        // Отталкивание и разгон (ОЧЕНЬ УСИЛЕНО)
        acc -= dirP * base * 4.5;
        acc += vec3(dirP.y, -dirP.x, 0.3) * base * 2.8;
        vel -= dirP * base * 1.2;
        vel *= 0.97;
      } else if (u_pointerMode == 2 || u_pointerMode == 3) {
        // Вихревой закрут в обе стороны (усилено)
        float spin = (u_pointerMode == 2 ? -1.0 : 1.0);
        vec3 tangent = vec3(dirP.y * spin, -dirP.x * spin, dirP.z * 0.35 * spin);
        float spiralBoost = 1.2 + pulseWave * 0.8;
        acc += tangent * base * (2.5 * spiralBoost);
        acc += dirP * base * (0.8 + 0.6 * pulseWave);
        vel = mix(vel, vel + tangent * base * 0.6, 0.35 + 0.2 * pulseWave);
      } else if (u_pointerMode == 4) {
        // Импульсные всплески (ОЧЕНЬ УСИЛЕНО - реально пульсирует!)
        float pulsePhase = u_time * 5.5 + jitter * 12.0;
        float carrier = 0.7 + 0.6 * sin(pulsePhase);
        float burst = smoothstep(0.0, 1.0, sin(pulsePhase * 0.6));
        float strongBurst = pow(burst, 0.5); // Более острые пики
        float pulse = 1.0 + carrier + (u_pointerPulse > 0.5 ? strongBurst * 3.5 : carrier * 0.8);
        vec3 swirl = normalize(vec3(-dirP.y, dirP.x, dirP.z * 0.5));
        // Волновое отталкивание с пульсацией
        acc -= dirP * base * (2.5 + strongBurst * 4.5);
        acc += swirl * base * (2.2 + strongBurst * 3.8);
        // Добавляем радиальную волну
        float wave = sin(distPointer * 8.0 - u_time * 6.0) * strongBurst;
        acc += dirP * base * wave * 2.5;
        vel = mix(vel, vel - dirP * base * 1.5 + swirl * base * 1.2, 0.6 * pulse);
      } else if (u_pointerMode == 6) {
        // КВАЗАР: плоский диск + тонкие джеты из центра
        vec3 r = pos - u_pointerPos;
        float rLen = max(0.01, length(r));

        vec3 axis = vec3(0.0, 1.0, 0.0);

        // Цилиндрические координаты
        float h = dot(r, axis);
        float absH = abs(h);
        float hSign = sign(h + 0.0001);
        vec3 toAxis = r - axis * h;
        float rho = length(toAxis);
        vec3 rhoDir = rho > 0.01 ? toAxis / rho : vec3(1.0, 0.0, 0.0);
        vec3 phi = normalize(cross(axis, rhoDir));

        float q = u_pointerStrength * pressBoost * 0.4;

        // Размеры
        float diskR = radius * 1.3;    // радиус диска
        float coreR = radius * 0.08;   // ОЧЕНЬ маленькое ядро
        float jetW = radius * 0.15;    // узкие джеты

        // === 1. ДИСК - ОСНОВНАЯ СТРУКТУРА ===

        // Очень сильное сплющивание к плоскости h=0
        // Чем дальше от оси, тем сильнее
        float flattenStr = 10.0 * (1.0 + rho / diskR);
        acc -= axis * hSign * q * flattenStr;

        // Вращение диска (кеплеровское)
        float rot = 6.0 / (0.1 + rho);
        acc += phi * q * rot;

        // Слабое притяжение к центру в плоскости диска
        float inDiskPlane = exp(-absH * absH / (0.1 * 0.1));
        acc -= rhoDir * q * 2.0 * inDiskPlane / (0.3 + rho);

        // === 2. ДЖЕТЫ - ТОЛЬКО ИЗ ЯДРА ===

        // Выброс только из очень маленького ядра
        float inCore = exp(-rLen * rLen / (coreR * coreR));
        float eject = 20.0 * inCore;
        acc += axis * hSign * q * eject;

        // Частицы в джете (близко к оси И высоко) продолжают подъём
        float nearAxis = exp(-rho * rho / (jetW * jetW));
        float highUp = smoothstep(0.1, 0.4, absH / diskR);
        float inJet = nearAxis * highUp;

        // Продолжение подъёма в джете (слабеет с высотой)
        float jetLift = 8.0 * inJet / (1.0 + absH);
        acc += axis * hSign * q * jetLift;

        // Коллимация - сжатие джета к оси
        float collimateFactor = smoothstep(jetW * 0.3, jetW * 1.5, rho);
        acc -= rhoDir * q * 5.0 * inJet * collimateFactor;

        // Вращение в джете
        acc += phi * q * 4.0 * inJet;

        // === 3. ГРАНИЦЫ ===
        float boundR = smoothstep(diskR * 0.9, diskR * 1.2, rho);
        float boundH = smoothstep(diskR * 1.5, diskR * 2.0, absH);
        acc -= rhoDir * q * 15.0 * boundR;
        acc -= axis * hSign * q * 10.0 * boundH;

        // Возврат далёких частиц
        acc -= normalize(r) * q * 0.3 / (0.5 + rLen);

        // Стабилизация
        vel *= 0.99;
        float speed = length(vel);
        if (speed > 3.0) vel = vel / speed * 3.0;
      } else {
        // Магнитный поток - мощные дуговые силовые линии (ОЧЕНЬ УСИЛЕНО)
        vec3 axis = normalize(u_viewDir * 0.7 + vec3(0.0, 1.0, 0.5));
        vec3 r = pos - u_pointerPos;
        float rLen = max(0.06, length(r));
        float r2 = rLen * rLen;
        float r3 = r2 * rLen;
        float r5 = r2 * r3 + 1e-5;

        // Дипольное магнитное поле (усилено)
        vec3 dipole = (3.0 * r * dot(axis, r) / r5) - (axis / max(1e-3, r3));
        dipole = clamp(dipole, -vec3(20.0), vec3(20.0));

        // Силовые линии вращаются вокруг оси
        vec3 swirlDir = normalize(cross(dipole, axis) + 0.5 * cross(dirP, axis));

        // Более сильное затухание для ближних частиц
        float fluxFalloff = 1.0 / (1.0 + pow(rLen / (radius * 1.5), 1.5));
        float magneticStrength = pow(fluxFalloff, 0.7);

        // Очень сильные магнитные силы
        acc += dipole * base * (4.5 * magneticStrength);
        // Быстрое вращение вокруг силовых линий
        acc += swirlDir * base * (5.0 * magneticStrength);

        // Полярное отталкивание/притяжение
        float polarAlignment = dot(normalize(r), axis);
        acc += axis * base * (2.5 * sign(polarAlignment) * magneticStrength);

        // Спиральное движение вдоль силовых линий
        float spiralPhase = atan(r.y, r.x) + u_time * 2.0;
        vec3 spiralForce = vec3(cos(spiralPhase), sin(spiralPhase), 0.0);
        acc += spiralForce * base * (1.8 * magneticStrength);

        vel = mix(vel, vel + dipole * 1.2 + swirlDir * 1.5, 0.7 * falloff);
      }
    }

    // ==== СОХРАНЯЕМ ОБЛАКО ====
    float roamRadius = 4.5;
    float distCenter = length(pos);
    if (distCenter > roamRadius){
      acc -= pos / distCenter * (distCenter - roamRadius) * 0.6;
    }

    // ==== AUDIO REACTIVITY (ТОЛЬКО в режиме эквалайзера) ====
    // Применяем аудио эффекты ТОЛЬКО когда включен режим эквалайзера (shapeID == 12)
    bool isEqualizerMode = (u_shapeA == 12 || u_shapeB == 12);

    if (isEqualizerMode) {
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
    }

    // ==== FREE FLIGHT TURBULENCE (режим свободного полёта) ====
    // В режиме свободного полёта добавляем мощные завихрения и движения
    float isFreeFlightMode = 1.0 - step(0.05, u_shapeStrength); // 1.0 когда shapeStrength ~= 0

    if (isFreeFlightMode > 0.5) {
      // УСИЛЕННЫЕ вихревые движения с несколькими слоями частот
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

      // УСИЛЕННОЕ спиральное движение - несколько вихрей
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

      // УСИЛЕННЫЙ Curl noise для органического движения
      vec2 curlFlow1_2d = curl(pos.xy * 2.2 + u_time * 0.5);
      vec2 curlFlow2_2d = curl(pos.yz * 1.8 - u_time * 0.4 + vec2(5.7, 3.2));
      vec2 curlFlow3_2d = curl(pos.xz * 2.5 + u_time * 0.3 + vec2(2.1, 8.4));
      vec3 curlFlow1 = vec3(curlFlow1_2d, curlFlow2_2d.x) * 3.5;
      vec3 curlFlow2 = vec3(curlFlow3_2d.x, curlFlow1_2d.y, curlFlow2_2d.y) * 2.8;

      // Мощные вертикальные волны
      float vertWave = sin(u_time * 2.0 + pos.x * 2.5 + pos.z * 2.0) * 1.5;
      float horizWave = cos(u_time * 1.8 + pos.y * 2.2) * 1.2;

      // ОБЪЕДИНЯЕМ все силы с увеличенными коэффициентами
      acc += turbulence1 * 0.7;
      acc += turbulence2 * 0.65;
      acc += spiralFlow1 * 0.9;
      acc += spiralFlow2 * 0.75;
      acc += curlFlow1 * 1.0;
      acc += curlFlow2 * 0.85;
      acc.y += vertWave;
      acc.x += horizWave;

      // Дополнительное УСИЛЕННОЕ случайное движение
      vec3 randomDrift = vec3(
        noise(id * 18.3 + u_time * 0.6),
        noise(id * 27.7 - u_time * 0.5),
        noise(id * 35.1 + u_time * 0.7)
      ) * 2.2 - 1.1;
      acc += randomDrift;

      // Центральный вихрь для общего направления
      vec2 toCenter = -pos.xy;
      float distToCenter = max(0.5, length(toCenter));
      vec2 vortexForce = vec2(-toCenter.y, toCenter.x) / distToCenter;
      acc += vec3(vortexForce * 1.5, sin(u_time + pos.z) * 0.8);
    }

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

    // Фоновый градиент
    vec3 gradient = mix(vec3(0.02, 0.03, 0.07), vec3(0.05, 0.07, 0.12), uv.y);
    float radial = 1.0 - length(uv - 0.5) * 1.2;
    gradient += max(0.0, radial) * vec3(0.03, 0.02, 0.05);

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
    col += gradient * 0.5 + grain;

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
    strength: 1.8,  // Увеличена сила для большей заметности
    radius: 1.4,    // Увеличен радиус воздействия
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
    Math.random() * 0.8 + 0.3,  // zoom factor: 0.3-1.1
    Math.random() * 0.6 - 0.3,  // center X offset: -0.3 to 0.3
    Math.random() * 0.6 - 0.3,  // center Y offset: -0.3 to 0.3
    Math.random() * Math.PI * 2,  // rotation phase
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
      // Поддерживаем высокое притяжение для фракталов
      targetShapeStrength = Math.max(1.25, manualShapeStrength * 1.3);
      const hold = 0.15;
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
        fractalState.duration = 14.0 + Math.random() * 8.0;
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
    // Определяем базовую силу притяжения в зависимости от режима
    let shapeBase;
    if (shapeMode === 'shapes') {
      shapeBase = manualShapeStrength;
    } else if (shapeMode === 'fractal') {
      shapeBase = Math.max(1.25, manualShapeStrength * 1.3);
    } else if (shapeMode === 'equalizer') {
      shapeBase = 1.3;
    } else {
      shapeBase = 0.0; // free mode
    }
    if (scatterCooldown > 0.0) {
      scatterCooldown = Math.max(0.0, scatterCooldown - dt);
      const relax = 0.35 + 0.65 * (scatterCooldown / SCATTER_RELAX_TIME);
      targetShapeStrength = Math.min(shapeBase, manualShapeStrength * relax);
    } else {
      targetShapeStrength = shapeBase;
    }
    shapeStrength += (targetShapeStrength - shapeStrength) * 0.1;
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
    // Интуитивное масштабирование курсора относительно зума:
    // - Радиус масштабируется линейно с расстоянием камеры (видимая область курсора постоянна)
    // - Сила слегка увеличивается при отдалении для компенсации
    const baseDistance = 4.0;  // Эталонное расстояние камеры
    const zoomFactor = camera.distance / baseDistance;  // <1 при приближении, >1 при отдалении
    const pointerRadius = pointerState.radius * zoomFactor;  // Линейное масштабирование радиуса
    const pointerStrength = pointerState.strength * (0.8 + zoomFactor * 0.4);  // Мягкое усиление при отдалении
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
    // Усиленное притяжение для фракталов
    targetShapeStrength = Math.max(1.25, manualShapeStrength * 1.3);
    shapeStrength = targetShapeStrength * 0.8; // Быстрый старт
    fractalState.seedA = randomFractalSeed();
    fractalState.seedB = randomFractalSeed();
    fractalState.morph = 0.0;
    fractalState.timer = 0.0;
    fractalState.duration = 14.0 + Math.random() * 8.0;
    morph = 0.0;
    isMorphing = false;
    rebuildColorStops();
    updateModeButtons();
  });

  // Equalizer mode - particles form a plane and oscillate with audio
  const EQUALIZER_SHAPE_ID = 12;
  if (modeEqualizerBtn) {
    modeEqualizerBtn.addEventListener('click', async () => {
      shapeMode = 'equalizer';
      targetShapeStrength = 1.3;
      shapeStrength = 1.0; // Быстрый старт
      shapeA = EQUALIZER_SHAPE_ID;
      shapeB = EQUALIZER_SHAPE_ID;
      morph = 0.0;
      isMorphing = false;
      audioReactivityEnabled = true;
      updateModeButtons();

      // Автоматически запрашиваем доступ к микрофону при первом включении эквалайзера
      if (!audioEnabled && audioReactivityEnabled) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await initAudio(stream);
          console.log('✓ Microphone activated for equalizer');
        } catch (err) {
          console.error('Microphone access denied:', err);
        }
      }
    });
  }

  // ==== AUDIO UI CONTROLS ====
  const audioToggle = document.getElementById('audioToggle');
  const useMicrophoneBtn = document.getElementById('useMicrophoneBtn');
  const useAudioFileBtn = document.getElementById('useAudioFileBtn');
  const audioFileInput = document.getElementById('audioFileInput');
  const audioElement = document.getElementById('audioElement');
  const audioFileControls = document.getElementById('audioFileControls');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopAudioBtn = document.getElementById('stopAudioBtn');
  const audioStatusLabel = document.getElementById('audioStatusLabel');

  let currentAudioSource = 'microphone'; // 'microphone' or 'file'
  let isAudioPlaying = false;

  // Audio toggle
  if (audioToggle) {
    audioToggle.addEventListener('change', async (e) => {
      audioReactivityEnabled = e.target.checked;
      if (audioReactivityEnabled && !audioEnabled) {
        // Enable audio based on current source
        if (currentAudioSource === 'microphone') {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await initAudio(stream);
            console.log('✓ Microphone activated');
          } catch (err) {
            console.error('Microphone access denied:', err);
            audioReactivityEnabled = false;
            audioToggle.checked = false;
          }
        }
      }
    });
  }

  // Microphone button
  if (useMicrophoneBtn) {
    useMicrophoneBtn.addEventListener('click', async () => {
      currentAudioSource = 'microphone';
      useMicrophoneBtn.classList.add('active');
      useAudioFileBtn.classList.remove('active');
      audioFileControls.style.display = 'none';

      // Stop audio file if playing
      if (audioElement && !audioElement.paused) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      // Disconnect file source
      if (audioSource) {
        audioSource.disconnect();
        audioSource = null;
      }

      // Enable microphone
      if (audioReactivityEnabled) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await initAudio(stream);
          console.log('✓ Switched to microphone');
        } catch (err) {
          console.error('Microphone access denied:', err);
        }
      }
    });
  }

  // Audio file button
  if (useAudioFileBtn) {
    useAudioFileBtn.addEventListener('click', () => {
      audioFileInput.click();
    });
  }

  // Audio file input
  if (audioFileInput) {
    audioFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      currentAudioSource = 'file';
      useMicrophoneBtn.classList.remove('active');
      useAudioFileBtn.classList.add('active');
      audioFileControls.style.display = 'block';

      // Load audio file
      const url = URL.createObjectURL(file);
      audioElement.src = url;

      // Initialize audio from file
      try {
        await audioElement.load();
        initAudioFromFile(audioElement);
        audioStatusLabel.textContent = file.name;
        playPauseBtn.textContent = '▶ Play';
        isAudioPlaying = false;
        audioReactivityEnabled = true;
        if (audioToggle) audioToggle.checked = true;
        console.log('✓ Audio file loaded:', file.name);
      } catch (err) {
        console.error('Failed to load audio file:', err);
        audioStatusLabel.textContent = 'Ошибка загрузки';
      }
    });
  }

  // Play/Pause button
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (!audioElement.src) return;

      if (audioElement.paused) {
        audioElement.play();
        playPauseBtn.textContent = '⏸ Pause';
        isAudioPlaying = true;
        audioReactivityEnabled = true;
        if (audioToggle) audioToggle.checked = true;
      } else {
        audioElement.pause();
        playPauseBtn.textContent = '▶ Play';
        isAudioPlaying = false;
      }
    });
  }

  // Stop button
  if (stopAudioBtn) {
    stopAudioBtn.addEventListener('click', () => {
      if (!audioElement.src) return;

      audioElement.pause();
      audioElement.currentTime = 0;
      playPauseBtn.textContent = '▶ Play';
      isAudioPlaying = false;
    });
  }

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
      audio_hint: 'Работает только в режиме Эквалайзер',
      enable_audio: 'Включить аудио-реактивность',
      audio_source: 'Источник звука',
      use_microphone: 'Микрофон',
      load_audio_file: 'Загрузить файл',
      play: '▶ Играть',
      pause: '⏸ Пауза',
      stop: '■ Стоп',
      status: 'Статус',
      not_loaded: 'Не загружено',
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
      audio_hint: 'Works only in Equalizer mode',
      enable_audio: 'Enable audio reactivity',
      audio_source: 'Audio source',
      use_microphone: 'Microphone',
      load_audio_file: 'Load file',
      play: '▶ Play',
      pause: '⏸ Pause',
      stop: '■ Stop',
      status: 'Status',
      not_loaded: 'Not loaded',
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

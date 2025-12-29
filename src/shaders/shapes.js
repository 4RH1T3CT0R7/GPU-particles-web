/**
 * 3D shape generators and fractal functions for particle simulation
 * Restored from original monolithic version
 */

// Extract from original - shapes definitions
export const shapesGLSL = 
`
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
      float shells = 0.4 + 0.35 * sin(time * 0.3 + seed.w);
      p = applyRotations(f * (0.9 + shells), time * 0.25 + seed.w);
      p.xy += curl(id * 8.5 + seed.xy * 2.7 + time * 0.2) * 0.15;
      p.z += sin(angle * 0.6 + seed.z + time * 0.2) * 0.18;
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
;

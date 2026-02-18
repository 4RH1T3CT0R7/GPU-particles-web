/**
 * Primitive 3D/2D shape generators and rotation helpers (raw GLSL)
 */
export const shapesPrimitivesGLSL: string = `
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
  // Rotation matrix pre-computed on CPU and passed as uniform (u_rotMatA, u_rotMatB)
  vec3 applyRotation(vec3 p, int slot){
    return slot == 0 ? u_rotMatA * p : u_rotMatB * p;
  }

  // Map id uv->[0,1]^2 into target on chosen shape, with radial fill using s
  mat2 rot2(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;

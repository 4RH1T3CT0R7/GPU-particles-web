/**
 * Fractal flow function for particle simulation (raw GLSL)
 */
export const shapesFractalGLSL: string = `
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
`;

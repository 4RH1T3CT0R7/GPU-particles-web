# GPU Particle Shapes

<div align="center">

![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?style=for-the-badge&logo=webgl&logoColor=white)
![WebGPU](https://img.shields.io/badge/WebGPU-Ray_Tracing-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-WASM-DEA584?style=for-the-badge&logo=rust&logoColor=black)
![WASM](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-00D26A?style=for-the-badge)

**Система визуализации частиц в реальном времени с GPU-ускорением, двумя рендер-бекендами и физическим движком XPBD на Rust/WASM**

[WebGL2 Demo](https://4RH1T3CT0R7.github.io/GPU-particles-web/index.html) | [WebGPU Demo](https://4RH1T3CT0R7.github.io/GPU-particles-web/index-webgpu.html)

---

</div>

## Обзор

**GPU Particle Shapes** -- система визуализации частиц в реальном времени с двумя рендер-бекендами: стабильным **WebGL2** и экспериментальным **WebGPU с трассировкой лучей**. Физика реализована собственным движком **XPBD** на Rust, скомпилированным в WebAssembly.

Система обеспечивает рендеринг **65 000+ частиц** при 60 FPS, морфинг между 13 математическими формами, 7 режимов взаимодействия с курсором, аудиореактивность и физически корректное освещение (PBR).

## Демонстрация

| Версия | Ссылка | Описание |
|--------|--------|----------|
| WebGL2 (стабильная) | [Открыть](https://4RH1T3CT0R7.github.io/GPU-particles-web/index.html) | Полнофункциональная версия, все современные браузеры |
| WebGPU (экспериментальная) | [Открыть](https://4RH1T3CT0R7.github.io/GPU-particles-web/index-webgpu.html) | Трассировка лучей, Chrome 113+ |

## Возможности

### Рендеринг: WebGL2 (стабильный)

- GPU-ускорение через GPGPU: Multiple Render Targets, ping-pong текстурные буферы
- Текстуры с плавающей запятой RGBA32F для хранения состояния частиц (позиция + скорость)
- Физически корректный рендеринг (PBR): Cook-Torrance BRDF, Fresnel-Schlick, GGX NDF
- До 8 динамических источников света
- HDR-рендеринг с тональным отображением ACES
- Постобработка Bloom
- 65 000+ частиц (текстура до 384x384)

### Рендеринг: WebGPU (экспериментальный)

- Трассировка лучей в реальном времени с BVH-ускорением
- Глобальное освещение методом трассировки путей (1-bounce GI)
- Индивидуальные PBR-материалы для каждой частицы (albedo, roughness, metallic, emissive)
- Importance sampling на основе GGX-распределения
- Временное шумоподавление через экспоненциальное скользящее среднее
- Конвейер: Симуляция -> BVH -> Трассировка лучей -> Временная аккумуляция -> Вывод

### 13 математических форм

| Категория | Формы |
|-----------|-------|
| Базовые | Cube, Sphere |
| Криволинейные | Torus, Helix |
| Многогранники | Octahedron, Icosahedron |
| Параметрические | Superformula, Rose, Wave |
| Комплексные | Ribbon, Polygon |
| Специальные | Fractal, Equalizer |

### 3 режима рендеринга

| Режим | Описание |
|-------|----------|
| Shapes | Морфинг между математическими формами |
| Free Flight | Свободное движение частиц в пространстве |
| Fractals | Эмерджентные фрактальные паттерны |

### 7 режимов взаимодействия с курсором

| Режим | Описание |
|-------|----------|
| Attract | Притяжение частиц к курсору |
| Repel | Отталкивание частиц от курсора |
| Vortex Left | Вихрь против часовой стрелки |
| Vortex Right | Вихрь по часовой стрелке |
| Pulse | Пульсирующие волны от курсора |
| Magnetic Flow | Магнитный поток |
| Quasar | Квазароподобное выбрасывание частиц |

### Аудиореактивность

- Анализ частотного спектра в реальном времени (bass, mid, treble, energy)
- Частицы реагируют на аудиовход
- Режим визуализации Equalizer

### Физический движок XPBD (Rust/WASM)

- Солвер Extended Position Based Dynamics с подшагами и итерациями Якоби
- 5 типов ограничений: distance, contact, density (PBF), shape matching, bending
- N-body гравитация Barnes-Hut (O(N log N), октодерево)
- Электромагнитные силы (Кулон + Лоренц)
- PBF плотность + XSPH вязкость + vorticity confinement
- Пространственная хеш-сетка для O(N) поиска соседей
- Адаптивный контроллер качества (бюджетное масштабирование подшагов/итераций)
- Морфинг форм как XPBD-ограничения позиции с переменной податливостью
- 154 теста, ноль предупреждений
- Опциональная параллелизация через rayon

### Интерфейс

- Панель управления: формы, цвета, морфинг, курсор, частицы, аудио
- Двуязычный интерфейс (EN/RU через i18n)
- Адаптивный дизайн для мобильных устройств
- Камера: правая кнопка мыши + перетаскивание (вращение), колесо прокрутки (масштаб)

## Быстрый старт

### Требования

- **Node.js** -- для npm и dev-сервера
- **Rust toolchain + wasm-pack** -- для сборки физического движка в WASM
- **Современный браузер** -- WebGL2 для стабильной версии, Chrome 113+ для WebGPU

### Установка и запуск

```bash
# Клонирование репозитория
git clone https://github.com/4RH1T3CT0R7/GPU-particles-web.git
cd GPU-particles-web

# Установка зависимостей
npm install

# Полная сборка (WASM + TypeScript) и запуск dev-сервера
npm run dev
```

Dev-сервер запускается на `http://localhost:8080` с заголовками COOP/COEP (необходимы для SharedArrayBuffer и WASM).

- **WebGL2:** `http://localhost:8080/index.html`
- **WebGPU:** `http://localhost:8080/index-webgpu.html`

### npm-скрипты

| Команда | Описание |
|---------|----------|
| `npm run build` | Полная сборка: WASM + TypeScript |
| `npm run build:wasm` | Сборка Rust в WASM (release) |
| `npm run build:wasm:debug` | Сборка WASM (debug) |
| `npm run build:ts` | Бандлинг TypeScript через esbuild |
| `npm run build:watch` | Пересборка TS при изменениях |
| `npm run dev` | Сборка + dev-сервер на localhost:8080 |
| `npm run typecheck` | Проверка типов TypeScript |
| `npm run test:rust` | Запуск тестов Rust (154 теста) |
| `npm run bench:rust` | Запуск бенчмарков Rust |

## Структура проекта

```
GPU-particles-web/
├── index.html                  # WebGL2 версия (стабильная)
├── index.ts                    # WebGL2 точка входа (TypeScript)
├── index-webgpu.html           # WebGPU версия (трассировка лучей)
├── index-webgpu.ts             # WebGPU точка входа (TypeScript)
├── debug.html                  # WebGL2 диагностика
├── debug-webgpu.html           # WebGPU диагностика
├── serve.mjs                   # Dev-сервер (Node.js, COOP/COEP)
├── package.json                # npm-конфигурация и скрипты
├── tsconfig.json               # Конфигурация TypeScript
├── README.md
├── ROADMAP.md
├── WEBGPU_SETUP.md
├── START_LOCAL.md
├── LIGHTING_REPORT.md
├── LICENSE.md
├── dist/                       # Собранный JS
│   ├── index.js
│   └── index-webgpu.js
├── wasm/pkg/                   # Скомпилированный WASM
├── physics/                    # Физический движок Rust XPBD
│   ├── Cargo.toml              # Корень workspace
│   └── crates/
│       ├── xpbd-core/          # Чистый Rust (без WASM-зависимостей)
│       │   ├── src/
│       │   │   ├── lib.rs
│       │   │   ├── solver.rs         # Цикл солвера XPBD
│       │   │   ├── particle.rs       # ParticleSet, Phase enum
│       │   │   ├── config.rs         # PhysicsConfig
│       │   │   ├── grid.rs           # Пространственная хеш-сетка
│       │   │   ├── math.rs           # Математические утилиты
│       │   │   ├── quality.rs        # Адаптивное качество
│       │   │   ├── materials.rs      # Пресеты материалов
│       │   │   ├── constraints/      # distance, contact, density, shape_matching, bending
│       │   │   ├── forces/           # gravity, electromagnetic, pointer, audio, flow
│       │   │   ├── shapes/           # primitives, fractal, morph, dispatcher
│       │   │   └── fluids/           # viscosity, vorticity
│       │   └── tests/                # 154 теста
│       └── xpbd-wasm/          # WASM-привязки (wasm-bindgen)
│           └── src/lib.rs      # PhysicsWorld API
└── src/                        # Исходники TypeScript
    ├── types.ts                # Общие определения типов
    ├── app/lights.ts           # Конфигурация динамического освещения
    ├── audio/analyzer.ts       # Анализ аудиочастот
    ├── camera/controls.ts      # 3D-камера (орбита, масштаб)
    ├── config/
    │   ├── constants.ts        # Константы, палитры, формы
    │   ├── physics.ts          # Параметры физики
    │   └── rendering.ts        # PBR, bloom, экспозиция
    ├── core/
    │   ├── utils.ts            # WebGL-хелперы (VAO, FBO, текстуры)
    │   └── webgl.ts            # Инициализация WebGL2-контекста
    ├── gpu/
    │   ├── device.ts           # Инициализация WebGPU adapter/device
    │   ├── pipelines.ts        # Оркестрация пайплайнов
    │   └── pipelines/          # blit, bvh, raytracing, simulation, temporal
    ├── physics/wasm-loader.ts  # Интеграция WASM-физики
    ├── rendering/pipeline.ts   # Render targets, bloom, HDR
    ├── shaders/                # GLSL-шейдеры (WebGL2)
    │   ├── common.ts, particle.ts, pbr.ts, bloom.ts, blit.ts
    │   ├── simulation.ts, init.ts
    │   └── shapes.ts, shapes-primitives.ts, shapes-fractal.ts, shapes-dispatcher.ts
    ├── simulation/state.ts     # GPU-буферы частиц
    ├── ui/
    │   ├── controls.ts         # Главная настройка UI
    │   ├── controls/           # shapes, colors, cursor, particles, audio
    │   ├── i18n.ts             # Интернационализация (EN/RU)
    │   └── mobile.ts           # Мобильное меню
    └── wgsl/                   # WGSL-шейдеры (WebGPU)
        ├── shaders.ts
        └── snippets.ts
```

## Архитектура

### Технологический стек

| Слой | Технологии |
|------|-----------|
| Приложение | TypeScript 5.9, esbuild |
| Рендеринг (стабильный) | WebGL2, GLSL ES 3.0 |
| Рендеринг (экспериментальный) | WebGPU, WGSL |
| Физика | Rust, glam 0.29, bytemuck, rayon |
| WASM-мост | wasm-pack, wasm-bindgen |
| Dev-инфраструктура | Node.js, serve.mjs (порт 8080) |

### Конвейер рендеринга WebGL2

```
Инициализация текстур (RGBA32F)
        |
        v
  [Ping-Pong буферы]
        |
        v
  Вычисление физики (GPGPU через MRT)
        |
        v
  PBR-освещение (Cook-Torrance BRDF)
        |
        v
  Bloom постобработка
        |
        v
  HDR -> ACES тональное отображение
        |
        v
  Вывод на экран
```

### Конвейер рендеринга WebGPU

```
Симуляция частиц (Compute Shader)
        |
        v
  Построение BVH (Compute Shader)
        |
        v
  Трассировка лучей + GI (Compute Shader)
        |
        v
  Временная аккумуляция (Compute Shader)
        |
        v
  Blit + тональное отображение (Render Pass)
```

### Физический движок XPBD

Физический движок разделен на два крейта:

- **xpbd-core** -- чистая Rust-реализация без WASM-зависимостей. Содержит солвер, ограничения, силы, формы и пространственное хеширование. Может использоваться независимо.
- **xpbd-wasm** -- тонкий слой привязок через wasm-bindgen, экспортирующий `PhysicsWorld` API для JavaScript.

Цикл солвера на каждом кадре:

1. Внешние силы (гравитация, электромагнетизм, указатель, аудио, поток)
2. Предсказание позиций
3. Подшаги с итерациями Якоби:
   - Ограничения расстояния
   - Контактные ограничения
   - Ограничения плотности (PBF)
   - Shape matching
   - Ограничения изгиба
4. Обновление скоростей
5. XSPH вязкость + vorticity confinement
6. Обновление пространственной хеш-сетки

## Производительность

| Параметр | WebGL2 | WebGPU |
|----------|--------|--------|
| Целевой FPS | 60 | 60 |
| Количество частиц | 65 000+ | 16 000 -- 65 000 |
| Рекомендуемый GPU | Любой с WebGL2 | RTX 3080+ |
| Разрешение | Любое | 1080p для стабильных 60 FPS |
| Физика | GPU (GPGPU) + WASM | GPU (Compute) + WASM |

## Совместимость браузеров

### WebGL2 (стабильная версия)

| Браузер | Минимальная версия | Поддержка |
|---------|--------------------|-----------|
| Chrome | 56+ | Полная |
| Firefox | 51+ | Полная |
| Safari | 15+ | Полная |
| Edge | 79+ | Полная |

### WebGPU (экспериментальная версия)

| Браузер | Минимальная версия | Поддержка |
|---------|--------------------|-----------|
| Chrome | 113+ | Полная |
| Firefox | -- | В разработке |
| Safari Technology Preview | -- | Частичная |

## Отладка и диагностика

Проект включает специализированные страницы диагностики для каждого рендер-бекенда.

### Страницы отладки

| Страница | Локально | На GitHub Pages |
|----------|----------|-----------------|
| WebGL2 | `http://localhost:8080/debug.html` | [Открыть](https://4RH1T3CT0R7.github.io/GPU-particles-web/debug.html) |
| WebGPU | `http://localhost:8080/debug-webgpu.html` | [Открыть](https://4RH1T3CT0R7.github.io/GPU-particles-web/debug-webgpu.html) |

### Возможности диагностики

**WebGL2:**
- Проверка доступности WebGL2-контекста
- Верификация расширений (EXT_color_buffer_float)
- Тестирование компиляции шейдеров
- Захват ошибок в реальном времени со стек-трейсами

**WebGPU:**
- Обнаружение adapter и device
- Инспекция возможностей и лимитов GPU
- Верификация загрузки шейдерных файлов
- Компиляция WGSL с детальными сообщениями об ошибках
- Перехват консольного вывода в UI-оверлее

### Типичные проблемы

| Проблема | Решение |
|----------|---------|
| WebGPU недоступен | Используйте Chrome 113+, проверьте `chrome://flags/#enable-unsafe-webgpu` |
| Ошибки 404 при загрузке шейдеров | Убедитесь, что сервер запущен из корня проекта |
| Ошибки компиляции WGSL | Проверьте диагностическую страницу для получения номеров строк |
| Низкий FPS в WebGPU | Требуется GPU с аппаратной трассировкой лучей |
| WASM не загружается | Пересоберите: `npm run build:wasm` |

## Тестирование

### Тесты физического движка

```bash
# Запуск всех 154 тестов
npm run test:rust

# Или напрямую через cargo
cd physics
cargo test
```

Тесты покрывают: солвер XPBD, все типы ограничений, пространственное хеширование, N-body гравитацию, электромагнитные силы, генерацию форм, морфинг, адаптивное качество, конфигурацию и материалы.

### Проверка типов TypeScript

```bash
npm run typecheck
```

### Бенчмарки

```bash
npm run bench:rust
```

## Управление

### Мышь

| Действие | Результат |
|----------|-----------|
| Левая кнопка + перетаскивание | Применение эффекта курсора |
| Правая кнопка + перетаскивание | Вращение камеры |
| Колесо прокрутки | Масштабирование |

### Панель управления

- **Формы** -- выбор целевой формы, переключение режимов рендеринга, автоматическая смена форм
- **Цвета** -- количество цветов в градиенте (2-6), случайная смена палитры
- **Морфинг** -- скорость перехода (4-30 секунд), сила притяжения к форме
- **Курсор** -- выбор режима взаимодействия, сила и радиус, пульс при нажатии
- **Частицы** -- количество частиц, множитель скорости, сброс и разброс
- **Аудио** -- включение аудиореактивности, выбор источника

## Лицензия

Проект распространяется под лицензией MIT. Подробности в файле [LICENSE.md](LICENSE.md).

## Автор

**4RH1T3CT0R7** -- [GitHub](https://github.com/4RH1T3CT0R7)

Репозиторий: [https://github.com/4RH1T3CT0R7/GPU-particles-web](https://github.com/4RH1T3CT0R7/GPU-particles-web)

# Как запустить локально

## Необходимые инструменты

Перед началом работы убедитесь, что установлены:

- **Node.js** (v18 или новее) -- для сборки TypeScript и локального сервера
- **Rust toolchain** (stable) -- для компиляции физического движка в WASM
- **wasm-pack** -- для сборки Rust в WebAssembly (`cargo install wasm-pack`)

## Быстрый старт

```bash
git clone https://github.com/4RH1T3CT0R7/GPU-particles-web.git
cd GPU-particles-web
npm install
npm run build          # собирает Rust WASM + TypeScript
npm run dev            # запускает сервер на localhost:8080 с COOP/COEP заголовками
```

После запуска откройте в браузере: http://localhost:8080

## Команды сборки по отдельности

| Команда              | Описание                                             |
|----------------------|------------------------------------------------------|
| `npm run build:wasm` | Компиляция Rust-физики в WASM (через wasm-pack)      |
| `npm run build:ts`   | Сборка TypeScript в бандлы через esbuild             |
| `npm run build`      | Полная сборка: WASM + TypeScript                     |
| `npm run build:watch`| Непрерывная пересборка TypeScript при изменениях     |
| `npm run dev`        | Полная сборка и запуск dev-сервера на порту 8080     |

## Альтернативные серверы

Если вы не хотите использовать встроенный dev-сервер, можно запустить любой статический сервер. Однако учтите, что **SharedArrayBuffer** (необходим для WASM-физики) требует заголовков `Cross-Origin-Opener-Policy` и `Cross-Origin-Embedder-Policy`. Без них физический движок не загрузится.

Встроенный `npm run dev` (serve.mjs) выставляет эти заголовки автоматически. Альтернативные серверы -- нет.

### Python 3

```bash
python3 -m http.server 8080
```

### PHP

```bash
php -S localhost:8080
```

### VS Code Live Server

1. Установите расширение "Live Server".
2. Правый клик на `index.html` -- "Open with Live Server".

## Доступные страницы

| Страница                                     | Описание                     |
|----------------------------------------------|------------------------------|
| http://localhost:8080/index.html             | WebGL2 версия (основная)     |
| http://localhost:8080/index-webgpu.html      | WebGPU версия с ray tracing  |
| http://localhost:8080/debug.html             | Отладочная страница (WebGL2) |
| http://localhost:8080/debug-webgpu.html      | Отладочная страница (WebGPU) |

## Что должно работать

После успешного запуска:

- Частицы видны на экране (не черный экран)
- 13 фигур доступны через кнопки: куб, сфера, тор и т.д.
- PBR освещение с эффектом bloom
- Морфинг между фигурами
- Все контроли интерфейса работают
- Физика частиц (WASM-модуль XPBD)
- Аудио-реактивность

## Если не работает

1. Откройте консоль браузера (F12).
2. Проверьте вкладку **Console** на наличие ошибок.
3. Проверьте вкладку **Network** -- все файлы должны загружаться со статусом 200.
4. Если в консоли ошибка `SharedArrayBuffer is not defined` -- сервер не отправляет COOP/COEP заголовки. Используйте `npm run dev`.
5. Если WASM не загружается -- убедитесь, что выполнена сборка (`npm run build:wasm`) и файлы присутствуют в `wasm/pkg/`.

## Тесты

Для запуска тестов физического движка (154 теста):

```bash
npm run test:rust
```

Команда выполняет `cargo test` в директории `physics/`.

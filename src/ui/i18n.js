/**
 * Internationalization module
 */

import { SHAPE_NAMES_EN, SHAPE_NAMES_RU } from '../config/constants.js';

export const translations = {
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
    speed_slow: 'Slow (20s)',
    speed_normal: 'Normal (15s)',
    speed_fast: 'Fast (6s)',
    speed_custom: 'Custom'
  }
};

const cursorModeNames = {
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

export function createI18n() {
  let currentLang = 'ru';
  let SHAPE_NAMES = SHAPE_NAMES_RU;

  const updateCursorModeLabel = (pointerMode) => {
    const cursorModeLabel = document.getElementById('cursorModeLabel');
    if (cursorModeLabel) {
      cursorModeLabel.textContent = cursorModeNames[currentLang][pointerMode] || cursorModeNames[currentLang]['attract'];
    }
  };

  const switchLanguage = (lang) => {
    currentLang = lang;
    const t = translations[lang];

    SHAPE_NAMES = lang === 'ru' ? SHAPE_NAMES_RU : SHAPE_NAMES_EN;

    document.querySelectorAll('#shapeButtons button').forEach((btn, i) => {
      if (i < SHAPE_NAMES.length) {
        btn.textContent = SHAPE_NAMES[i];
      }
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        el.textContent = t[key];
      }
    });

    document.querySelectorAll('[data-i18n-opt]').forEach(el => {
      const key = el.getAttribute('data-i18n-opt');
      if (t[key]) {
        el.textContent = t[key];
      }
    });

    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.textContent = lang === 'ru' ? 'EN' : 'РУ';
    }

    console.log('✓ Язык переключен на:', lang === 'ru' ? 'русский' : 'english');

    return { SHAPE_NAMES, currentLang };
  };

  return {
    switchLanguage,
    updateCursorModeLabel,
    getCurrentLang: () => currentLang,
    getShapeNames: () => SHAPE_NAMES
  };
}

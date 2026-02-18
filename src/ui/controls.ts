/**
 * UI Controls initialization and event handling
 */

import { SHAPE_NAMES_EN, SHAPE_NAMES_RU, POINTER_MODES, colorPalettes } from '../config/constants.ts';
import type { ShapeState, PointerState, ColorManager, SimulationState, PointerMode } from '../types.ts';
import type { AudioAnalyzer } from '../audio/analyzer.ts';
import type { I18n } from './i18n.ts';

export interface UIControlsContext {
  shapeState: ShapeState;
  pointerState: PointerState;
  colorManager: ColorManager;
  simState: SimulationState;
  i18n: I18n;
  audioAnalyzer: AudioAnalyzer;
  reinitializeParticles: (pattern?: number) => void;
}

export interface UIControlsResult {
  getSpeedMultiplier: () => number;
}

export function initUIControls(context: UIControlsContext): UIControlsResult {
  const {
    shapeState,
    pointerState,
    colorManager,
    simState,
    i18n,
    audioAnalyzer,
    reinitializeParticles
  } = context;

  // Create shape buttons
  const shapeButtonsContainer: HTMLElement | null = document.getElementById('shapeButtons');
  if (shapeButtonsContainer) {
    const SHAPE_NAMES: readonly string[] = i18n.getCurrentLang() === 'ru' ? SHAPE_NAMES_RU : SHAPE_NAMES_EN;
    SHAPE_NAMES.forEach((name: string, i: number) => {
      const btn: HTMLButtonElement = document.createElement('button');
      btn.textContent = name;
      btn.id = `shape-${i}`;
      btn.addEventListener('click', () => {
        shapeState.shapeB = i;
        shapeState.shapeA = shapeState.shapeB;
        shapeState.morph = 0.0;
        updateShapeButtons();
      });
      shapeButtonsContainer.appendChild(btn);
    });
  }

  function updateShapeButtons(): void {
    document.querySelectorAll('#shapeButtons button').forEach((btn: Element, i: number) => {
      btn.classList.toggle('active', i === shapeState.shapeB);
    });
  }

  // Mode buttons
  const modeButtons: Record<string, () => void | Promise<void>> = {
    'mode-shapes': () => {
      shapeState.shapeMode = 'shapes';
      shapeState.targetShapeStrength = 0.95;
      // Disable audio reactivity when leaving equalizer mode
      audioAnalyzer.setReactivityEnabled(false);
    },
    'mode-free': () => {
      shapeState.shapeMode = 'free';
      shapeState.targetShapeStrength = 0.0;
      // Disable audio reactivity when leaving equalizer mode
      audioAnalyzer.setReactivityEnabled(false);
    },
    'mode-fractal': () => {
      shapeState.shapeMode = 'fractals';
      shapeState.targetShapeStrength = 0.95;
      // Disable audio reactivity when leaving equalizer mode
      audioAnalyzer.setReactivityEnabled(false);
    },
    'mode-equalizer': async () => {
      shapeState.shapeMode = 'equalizer';
      shapeState.targetShapeStrength = 1.3;
      audioAnalyzer.setReactivityEnabled(true);

      // Auto-request microphone access when entering equalizer mode
      if (!audioAnalyzer.isEnabled()) {
        try {
          const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await audioAnalyzer.initAudio(stream);
          console.log('✓ Microphone activated for equalizer');
          const audioToggle = document.getElementById('audioToggle') as HTMLInputElement | null;
          if (audioToggle) audioToggle.checked = true;
        } catch (err: unknown) {
          console.error('Microphone access denied:', err);
        }
      }
    }
  };

  Object.entries(modeButtons).forEach(([id, handler]: [string, () => void | Promise<void>]) => {
    const btn: HTMLElement | null = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', async () => {
        await handler();
        updateModeButtons();
      });
    }
  });

  function updateModeButtons(): void {
    Object.keys(modeButtons).forEach((id: string) => {
      const btn: HTMLElement | null = document.getElementById(id);
      if (btn) {
        const isActive: boolean = (
          (id === 'mode-shapes' && shapeState.shapeMode === 'shapes') ||
          (id === 'mode-free' && shapeState.shapeMode === 'free') ||
          (id === 'mode-fractal' && shapeState.shapeMode === 'fractals') ||
          (id === 'mode-equalizer' && shapeState.shapeMode === 'equalizer')
        );
        btn.classList.toggle('active', isActive);
      }
    });
  }

  // Color count slider
  const colorCountSlider = document.getElementById('colorCount') as HTMLInputElement | null;
  const colorCountValue: HTMLElement | null = document.getElementById('colorCountValue');
  if (colorCountSlider) {
    colorCountSlider.addEventListener('input', (e: Event) => {
      const count: number = parseInt((e.target as HTMLInputElement).value);
      colorManager.colorStopCount = count;
      if (colorCountValue) {
        const lang: string = i18n.getCurrentLang();
        const word: string = lang === 'ru' ?
          (count === 2 ? 'цвета' : count >= 5 ? 'цветов' : 'цвета') :
          'colors';
        colorCountValue.textContent = `${count} ${word}`;
      }
    });
    colorCountSlider.dispatchEvent(new Event('input'));
  }

  // Palette shuffle
  const shufflePaletteBtn: HTMLElement | null = document.getElementById('shufflePalette');
  const palettePreview: HTMLElement | null = document.getElementById('palettePreview');
  const paletteLabel: HTMLElement | null = document.getElementById('paletteLabel');
  if (shufflePaletteBtn) {
    shufflePaletteBtn.addEventListener('click', () => {
      let newIndex: number;
      do {
        newIndex = Math.floor(Math.random() * colorPalettes.length);
      } while (newIndex === colorManager.currentPaletteIndex);

      colorManager.currentPaletteIndex = newIndex;
      const palette = colorPalettes[newIndex];
      colorManager.rebuildColorStops(palette);

      if (palettePreview) {
        const gradA: string = `rgb(${palette.a.map((v: number) => Math.round(v * 80)).join(',')})`;
        const gradB: string = `rgb(${palette.b.map((v: number) => Math.round(v * 80)).join(',')})`;
        palettePreview.style.setProperty('--preview-gradient', `linear-gradient(90deg, ${gradA}, ${gradB})`);
      }
      if (paletteLabel) {
        paletteLabel.textContent = palette.name;
      }
    });
  }

  // Auto morph toggle
  const autoToggle = document.getElementById('autoToggle') as HTMLInputElement | null;
  if (autoToggle) {
    autoToggle.addEventListener('change', (e: Event) => {
      shapeState.autoMorph = (e.target as HTMLInputElement).checked;
    });
  }

  // Speed control
  const speedControl = document.getElementById('speedControl') as HTMLSelectElement | null;
  const manualSpeedGroup: HTMLElement | null = document.getElementById('manualSpeedGroup');
  const manualSpeed = document.getElementById('manualSpeed') as HTMLInputElement | null;
  const speedValue: HTMLElement | null = document.getElementById('speedValue');

  if (speedControl) {
    speedControl.addEventListener('change', (e: Event) => {
      const value: string = (e.target as HTMLSelectElement).value;
      shapeState.controlMode = value === 'manual' ? 'manual' : 'preset';

      if (value === 'slow') shapeState.transitionSpeed = 20;
      else if (value === 'normal') shapeState.transitionSpeed = 15;
      else if (value === 'fast') shapeState.transitionSpeed = 6;

      if (manualSpeedGroup) {
        manualSpeedGroup.style.display = value === 'manual' ? 'block' : 'none';
      }
    });
  }

  if (manualSpeed && speedValue) {
    manualSpeed.addEventListener('input', (e: Event) => {
      const value: number = parseFloat((e.target as HTMLInputElement).value);
      shapeState.customTransition = value;
      speedValue.textContent = `${value}s`;
    });
  }

  // Shape attraction
  const shapeAttraction = document.getElementById('shapeAttraction') as HTMLInputElement | null;
  const shapeForceValue: HTMLElement | null = document.getElementById('shapeForceValue');
  if (shapeAttraction) {
    shapeAttraction.addEventListener('input', (e: Event) => {
      const value: number = parseFloat((e.target as HTMLInputElement).value);
      shapeState.targetShapeStrength = value;
      if (shapeForceValue) {
        shapeForceValue.textContent = `${value.toFixed(2)}x`;
      }
    });
  }

  // Cursor controls
  const cursorActive = document.getElementById('cursorActive') as HTMLInputElement | null;
  if (cursorActive) {
    cursorActive.addEventListener('change', (e: Event) => {
      pointerState.enabled = (e.target as HTMLInputElement).checked;
    });
    cursorActive.checked = true;
    pointerState.enabled = true;
  }

  const cursorMode = document.getElementById('cursorMode') as HTMLSelectElement | null;
  if (cursorMode) {
    cursorMode.addEventListener('change', (e: Event) => {
      pointerState.mode = (e.target as HTMLSelectElement).value as PointerMode;
      i18n.updateCursorModeLabel((e.target as HTMLSelectElement).value);
    });
    pointerState.mode = 'attract';
    i18n.updateCursorModeLabel('attract');
  }

  const cursorStrength = document.getElementById('cursorStrength') as HTMLInputElement | null;
  const cursorStrengthValue: HTMLElement | null = document.getElementById('cursorStrengthValue');
  if (cursorStrength) {
    cursorStrength.addEventListener('input', (e: Event) => {
      const value: number = parseFloat((e.target as HTMLInputElement).value);
      pointerState.strength = value;
      if (cursorStrengthValue) {
        cursorStrengthValue.textContent = `${value.toFixed(2)}x`;
      }
    });
  }

  const cursorRadius = document.getElementById('cursorRadius') as HTMLInputElement | null;
  const cursorRadiusValue: HTMLElement | null = document.getElementById('cursorRadiusValue');
  const cursorRadiusLabel: HTMLElement | null = document.getElementById('cursorRadiusLabel');
  if (cursorRadius) {
    cursorRadius.addEventListener('input', (e: Event) => {
      const value: number = parseFloat((e.target as HTMLInputElement).value);
      pointerState.radius = value;
      if (cursorRadiusValue) {
        cursorRadiusValue.textContent = value.toFixed(2);
      }
      if (cursorRadiusLabel) {
        cursorRadiusLabel.textContent = value.toFixed(2);
      }
    });
  }

  const cursorPulse = document.getElementById('cursorPulse') as HTMLInputElement | null;
  if (cursorPulse) {
    cursorPulse.addEventListener('change', (e: Event) => {
      pointerState.pulse = (e.target as HTMLInputElement).checked;
    });
    cursorPulse.checked = true;
    pointerState.pulse = true;
  }

  // Particle count
  const particleCount = document.getElementById('particleCount') as HTMLSelectElement | null;
  const particleTextureLabel: HTMLElement | null = document.getElementById('particleTextureLabel');
  const particleCountValue: HTMLElement | null = document.getElementById('particleCountValue');
  const particleCountLabel: HTMLElement | null = document.getElementById('particleCountLabel');

  if (particleCount) {
    particleCount.addEventListener('change', (e: Event) => {
      const size: number = parseInt((e.target as HTMLSelectElement).value);
      simState.destroySimResources();
      simState.initSimulation(size);
      reinitializeParticles();

      const total: number = size * size;
      if (particleTextureLabel) {
        particleTextureLabel.textContent = `${size} × ${size}`;
      }
      if (particleCountValue) {
        particleCountValue.textContent = total.toLocaleString();
      }
      if (particleCountLabel) {
        particleCountLabel.textContent = total.toLocaleString();
      }
    });
  }

  // Particle speed
  const particleSpeed = document.getElementById('particleSpeed') as HTMLInputElement | null;
  const particleSpeedValue: HTMLElement | null = document.getElementById('particleSpeedValue');
  let speedMultiplier: number = 1.0;

  if (particleSpeed) {
    particleSpeed.addEventListener('input', (e: Event) => {
      speedMultiplier = parseFloat((e.target as HTMLInputElement).value);
      if (particleSpeedValue) {
        particleSpeedValue.textContent = `${speedMultiplier.toFixed(1)}x`;
      }
    });
  }

  // Reset and scatter buttons
  const resetFlow: HTMLElement | null = document.getElementById('resetFlow');
  if (resetFlow) {
    resetFlow.addEventListener('click', () => {
      reinitializeParticles(0.0);
    });
  }

  const scatterFlow: HTMLElement | null = document.getElementById('scatterFlow');
  if (scatterFlow) {
    scatterFlow.addEventListener('click', () => {
      reinitializeParticles(1.0);
    });
  }

  // Audio controls
  const audioToggle = document.getElementById('audioToggle') as HTMLInputElement | null;
  if (audioToggle) {
    audioToggle.addEventListener('change', (e: Event) => {
      audioAnalyzer.setReactivityEnabled((e.target as HTMLInputElement).checked);
    });
  }

  const useMicrophoneBtn: HTMLElement | null = document.getElementById('useMicrophoneBtn');
  const useAudioFileBtn: HTMLElement | null = document.getElementById('useAudioFileBtn');
  const audioFileInput = document.getElementById('audioFileInput') as HTMLInputElement | null;
  const audioFileControls: HTMLElement | null = document.getElementById('audioFileControls');

  if (useMicrophoneBtn) {
    useMicrophoneBtn.addEventListener('click', async () => {
      try {
        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await audioAnalyzer.initAudio(stream);
        useMicrophoneBtn.classList.add('active');
        if (useAudioFileBtn) useAudioFileBtn.classList.remove('active');
        if (audioFileControls) audioFileControls.style.display = 'none';
      } catch (err: unknown) {
        console.error('Microphone access denied:', err);
        alert('Microphone access denied');
      }
    });
  }

  if (useAudioFileBtn && audioFileInput) {
    useAudioFileBtn.addEventListener('click', () => {
      audioFileInput.click();
    });

    audioFileInput.addEventListener('change', (e: Event) => {
      const file: File | undefined = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const audioElement = document.getElementById('audioElement') as HTMLAudioElement | null;
        const audioStatusLabel: HTMLElement | null = document.getElementById('audioStatusLabel');

        if (audioElement) {
          // Revoke previous blob URL to prevent memory leak
          if (audioElement.src && audioElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioElement.src);
          }
          const url: string = URL.createObjectURL(file);
          audioElement.src = url;
          audioAnalyzer.initAudioFromFile(audioElement);

          if (useMicrophoneBtn) useMicrophoneBtn.classList.remove('active');
          useAudioFileBtn.classList.add('active');
          if (audioFileControls) audioFileControls.style.display = 'block';
          if (audioStatusLabel) audioStatusLabel.textContent = file.name;
        }
      }
    });
  }

  const playPauseBtn: HTMLElement | null = document.getElementById('playPauseBtn');
  const stopAudioBtn: HTMLElement | null = document.getElementById('stopAudioBtn');
  const audioElement = document.getElementById('audioElement') as HTMLAudioElement | null;

  if (playPauseBtn && audioElement) {
    playPauseBtn.addEventListener('click', () => {
      if (audioElement.paused) {
        audioElement.play();
        const lang: string = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '⏸ Пауза' : '⏸ Pause';
      } else {
        audioElement.pause();
        const lang: string = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
      }
    });
  }

  if (stopAudioBtn && audioElement) {
    stopAudioBtn.addEventListener('click', () => {
      audioElement.pause();
      audioElement.currentTime = 0;
      const lang: string = i18n.getCurrentLang();
      if (playPauseBtn) playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
    });
  }

  // Language toggle
  const langToggle: HTMLElement | null = document.getElementById('langToggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const newLang = i18n.getCurrentLang() === 'ru' ? 'en' as const : 'ru' as const;
      i18n.switchLanguage(newLang);
      i18n.updateCursorModeLabel(pointerState.mode);
    });
  }

  // Initialize palette label with first palette name
  if (paletteLabel) {
    paletteLabel.textContent = colorPalettes[0].name;
  }
  if (palettePreview) {
    const palette = colorPalettes[0];
    const gradA: string = `rgb(${palette.a.map((v: number) => Math.round(v * 80)).join(',')})`;
    const gradB: string = `rgb(${palette.b.map((v: number) => Math.round(v * 80)).join(',')})`;
    palettePreview.style.setProperty('--preview-gradient', `linear-gradient(90deg, ${gradA}, ${gradB})`);
  }

  // Initialize button states
  updateShapeButtons();
  updateModeButtons();

  return {
    getSpeedMultiplier: (): number => speedMultiplier
  };
}

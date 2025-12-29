/**
 * UI Controls initialization and event handling
 */

import { SHAPE_NAMES_EN, SHAPE_NAMES_RU, POINTER_MODES, colorPalettes } from '../config/constants.js';

export function initUIControls(context) {
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
  const shapeButtonsContainer = document.getElementById('shapeButtons');
  if (shapeButtonsContainer) {
    const SHAPE_NAMES = i18n.getCurrentLang() === 'ru' ? SHAPE_NAMES_RU : SHAPE_NAMES_EN;
    SHAPE_NAMES.forEach((name, i) => {
      const btn = document.createElement('button');
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

  function updateShapeButtons() {
    document.querySelectorAll('#shapeButtons button').forEach((btn, i) => {
      btn.classList.toggle('active', i === shapeState.shapeB);
    });
  }

  // Mode buttons
  const modeButtons = {
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
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await audioAnalyzer.initAudio(stream);
          console.log('✓ Microphone activated for equalizer');
          const audioToggle = document.getElementById('audioToggle');
          if (audioToggle) audioToggle.checked = true;
        } catch (err) {
          console.error('Microphone access denied:', err);
        }
      }
    }
  };

  Object.entries(modeButtons).forEach(([id, handler]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', async () => {
        await handler();
        updateModeButtons();
      });
    }
  });

  function updateModeButtons() {
    Object.keys(modeButtons).forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        const isActive = (
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
  const colorCountSlider = document.getElementById('colorCount');
  const colorCountValue = document.getElementById('colorCountValue');
  if (colorCountSlider) {
    colorCountSlider.addEventListener('input', (e) => {
      const count = parseInt(e.target.value);
      colorManager.colorStopCount = count;
      if (colorCountValue) {
        const lang = i18n.getCurrentLang();
        const word = lang === 'ru' ?
          (count === 2 ? 'цвета' : count >= 5 ? 'цветов' : 'цвета') :
          'colors';
        colorCountValue.textContent = `${count} ${word}`;
      }
    });
    colorCountSlider.dispatchEvent(new Event('input'));
  }

  // Palette shuffle
  const shufflePaletteBtn = document.getElementById('shufflePalette');
  const palettePreview = document.getElementById('palettePreview');
  const paletteLabel = document.getElementById('paletteLabel');
  if (shufflePaletteBtn) {
    shufflePaletteBtn.addEventListener('click', () => {
      let newIndex;
      do {
        newIndex = Math.floor(Math.random() * colorPalettes.length);
      } while (newIndex === colorManager.currentPaletteIndex);

      colorManager.currentPaletteIndex = newIndex;
      const palette = colorPalettes[newIndex];
      colorManager.rebuildColorStops(palette);

      if (palettePreview) {
        const gradA = `rgb(${palette.a.map(v => Math.round(v * 80)).join(',')})`;
        const gradB = `rgb(${palette.b.map(v => Math.round(v * 80)).join(',')})`;
        palettePreview.style.setProperty('--preview-gradient', `linear-gradient(90deg, ${gradA}, ${gradB})`);
      }
      if (paletteLabel) {
        paletteLabel.textContent = palette.name;
      }
    });
  }

  // Auto morph toggle
  const autoToggle = document.getElementById('autoToggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', (e) => {
      shapeState.autoMorph = e.target.checked;
    });
  }

  // Speed control
  const speedControl = document.getElementById('speedControl');
  const manualSpeedGroup = document.getElementById('manualSpeedGroup');
  const manualSpeed = document.getElementById('manualSpeed');
  const speedValue = document.getElementById('speedValue');

  if (speedControl) {
    speedControl.addEventListener('change', (e) => {
      const value = e.target.value;
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
    manualSpeed.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      shapeState.customTransition = value;
      speedValue.textContent = `${value}s`;
    });
  }

  // Shape attraction
  const shapeAttraction = document.getElementById('shapeAttraction');
  const shapeForceValue = document.getElementById('shapeForceValue');
  if (shapeAttraction) {
    shapeAttraction.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      shapeState.targetShapeStrength = value;
      if (shapeForceValue) {
        shapeForceValue.textContent = `${value.toFixed(2)}x`;
      }
    });
  }

  // Cursor controls
  const cursorActive = document.getElementById('cursorActive');
  if (cursorActive) {
    cursorActive.addEventListener('change', (e) => {
      pointerState.enabled = e.target.checked;
    });
    cursorActive.checked = true;
    pointerState.enabled = true;
  }

  const cursorMode = document.getElementById('cursorMode');
  if (cursorMode) {
    cursorMode.addEventListener('change', (e) => {
      pointerState.mode = e.target.value;
      i18n.updateCursorModeLabel(e.target.value);
    });
    pointerState.mode = 'attract';
    i18n.updateCursorModeLabel('attract');
  }

  const cursorStrength = document.getElementById('cursorStrength');
  const cursorStrengthValue = document.getElementById('cursorStrengthValue');
  if (cursorStrength) {
    cursorStrength.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      pointerState.strength = value;
      if (cursorStrengthValue) {
        cursorStrengthValue.textContent = `${value.toFixed(2)}x`;
      }
    });
  }

  const cursorRadius = document.getElementById('cursorRadius');
  const cursorRadiusValue = document.getElementById('cursorRadiusValue');
  const cursorRadiusLabel = document.getElementById('cursorRadiusLabel');
  if (cursorRadius) {
    cursorRadius.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      pointerState.radius = value;
      if (cursorRadiusValue) {
        cursorRadiusValue.textContent = value.toFixed(2);
      }
      if (cursorRadiusLabel) {
        cursorRadiusLabel.textContent = value.toFixed(2);
      }
    });
  }

  const cursorPulse = document.getElementById('cursorPulse');
  if (cursorPulse) {
    cursorPulse.addEventListener('change', (e) => {
      pointerState.pulse = e.target.checked;
    });
    cursorPulse.checked = true;
    pointerState.pulse = true;
  }

  // Particle count
  const particleCount = document.getElementById('particleCount');
  const particleTextureLabel = document.getElementById('particleTextureLabel');
  const particleCountValue = document.getElementById('particleCountValue');
  const particleCountLabel = document.getElementById('particleCountLabel');

  if (particleCount) {
    particleCount.addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      simState.destroySimResources();
      simState.initSimulation(size);
      reinitializeParticles();

      const total = size * size;
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
  const particleSpeed = document.getElementById('particleSpeed');
  const particleSpeedValue = document.getElementById('particleSpeedValue');
  let speedMultiplier = 1.0;

  if (particleSpeed) {
    particleSpeed.addEventListener('input', (e) => {
      speedMultiplier = parseFloat(e.target.value);
      if (particleSpeedValue) {
        particleSpeedValue.textContent = `${speedMultiplier.toFixed(1)}x`;
      }
    });
  }

  // Reset and scatter buttons
  const resetFlow = document.getElementById('resetFlow');
  if (resetFlow) {
    resetFlow.addEventListener('click', () => {
      reinitializeParticles(0.0);
    });
  }

  const scatterFlow = document.getElementById('scatterFlow');
  if (scatterFlow) {
    scatterFlow.addEventListener('click', () => {
      reinitializeParticles(1.0);
    });
  }

  // Audio controls
  const audioToggle = document.getElementById('audioToggle');
  if (audioToggle) {
    audioToggle.addEventListener('change', (e) => {
      audioAnalyzer.setReactivityEnabled(e.target.checked);
    });
  }

  const useMicrophoneBtn = document.getElementById('useMicrophoneBtn');
  const useAudioFileBtn = document.getElementById('useAudioFileBtn');
  const audioFileInput = document.getElementById('audioFileInput');
  const audioFileControls = document.getElementById('audioFileControls');

  if (useMicrophoneBtn) {
    useMicrophoneBtn.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await audioAnalyzer.initAudio(stream);
        useMicrophoneBtn.classList.add('active');
        if (useAudioFileBtn) useAudioFileBtn.classList.remove('active');
        if (audioFileControls) audioFileControls.style.display = 'none';
      } catch (err) {
        console.error('Microphone access denied:', err);
        alert('Microphone access denied');
      }
    });
  }

  if (useAudioFileBtn && audioFileInput) {
    useAudioFileBtn.addEventListener('click', () => {
      audioFileInput.click();
    });

    audioFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const audioElement = document.getElementById('audioElement');
        const audioStatusLabel = document.getElementById('audioStatusLabel');

        if (audioElement) {
          const url = URL.createObjectURL(file);
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

  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopAudioBtn = document.getElementById('stopAudioBtn');
  const audioElement = document.getElementById('audioElement');

  if (playPauseBtn && audioElement) {
    playPauseBtn.addEventListener('click', () => {
      if (audioElement.paused) {
        audioElement.play();
        const lang = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '⏸ Пауза' : '⏸ Pause';
      } else {
        audioElement.pause();
        const lang = i18n.getCurrentLang();
        playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
      }
    });
  }

  if (stopAudioBtn && audioElement) {
    stopAudioBtn.addEventListener('click', () => {
      audioElement.pause();
      audioElement.currentTime = 0;
      const lang = i18n.getCurrentLang();
      if (playPauseBtn) playPauseBtn.textContent = lang === 'ru' ? '▶ Играть' : '▶ Play';
    });
  }

  // Language toggle
  const langToggle = document.getElementById('langToggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const newLang = i18n.getCurrentLang() === 'ru' ? 'en' : 'ru';
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
    const gradA = `rgb(${palette.a.map(v => Math.round(v * 80)).join(',')})`;
    const gradB = `rgb(${palette.b.map(v => Math.round(v * 80)).join(',')})`;
    palettePreview.style.setProperty('--preview-gradient', `linear-gradient(90deg, ${gradA}, ${gradB})`);
  }

  // Initialize button states
  updateShapeButtons();
  updateModeButtons();

  return {
    getSpeedMultiplier: () => speedMultiplier
  };
}

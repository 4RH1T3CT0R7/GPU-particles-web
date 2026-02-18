/**
 * Shape switching and mode buttons
 */

import { SHAPE_NAMES_EN, SHAPE_NAMES_RU } from '../../config/constants.ts';
import type { UIControlsContext } from './types.ts';

export function initShapeControls(ctx: UIControlsContext): void {
  const { shapeState, i18n, audioAnalyzer } = ctx;

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
      audioAnalyzer.setReactivityEnabled(false);
    },
    'mode-free': () => {
      shapeState.shapeMode = 'free';
      shapeState.targetShapeStrength = 0.0;
      audioAnalyzer.setReactivityEnabled(false);
    },
    'mode-fractal': () => {
      shapeState.shapeMode = 'fractals';
      shapeState.targetShapeStrength = 0.95;
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

  // Initialize button states
  updateShapeButtons();
  updateModeButtons();
}

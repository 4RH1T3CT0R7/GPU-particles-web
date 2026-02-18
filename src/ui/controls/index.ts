/**
 * UI Controls — main entry point
 * Delegates to per-section sub-modules and re-exports shared types.
 */

export type { UIControlsContext, UIControlsResult } from './types.ts';
import type { UIControlsContext } from './types.ts';
import type { UIControlsResult } from './types.ts';

import { initShapeControls } from './shapes.ts';
import { initColorControls } from './colors.ts';
import { initCursorControls } from './cursor.ts';
import { initAudioControls } from './audio.ts';
import { initParticleControls } from './particles.ts';

export function initUIControls(context: UIControlsContext): UIControlsResult {
  const { pointerState, i18n } = context;

  // Section initializers
  initShapeControls(context);
  initColorControls(context);
  initCursorControls(context);
  initAudioControls(context);
  const particleResult = initParticleControls(context);

  // Language toggle (small, kept here rather than its own module)
  const langToggle: HTMLElement | null = document.getElementById('langToggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const newLang = i18n.getCurrentLang() === 'ru' ? 'en' as const : 'ru' as const;
      i18n.switchLanguage(newLang);
      i18n.updateCursorModeLabel(pointerState.mode);
    });
  }

  return {
    getSpeedMultiplier: particleResult.getSpeedMultiplier
  };
}

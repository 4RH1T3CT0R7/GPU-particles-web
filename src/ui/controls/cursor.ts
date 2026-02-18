/**
 * Cursor mode, strength, radius, and pulse controls
 */

import type { PointerMode } from '../../types.ts';
import type { UIControlsContext } from './types.ts';

export function initCursorControls(ctx: UIControlsContext): void {
  const { pointerState, i18n } = ctx;

  // Cursor active toggle
  const cursorActive = document.getElementById('cursorActive') as HTMLInputElement | null;
  if (cursorActive) {
    cursorActive.addEventListener('change', (e: Event) => {
      pointerState.enabled = (e.target as HTMLInputElement).checked;
    });
    cursorActive.checked = true;
    pointerState.enabled = true;
  }

  // Cursor mode select
  const cursorMode = document.getElementById('cursorMode') as HTMLSelectElement | null;
  if (cursorMode) {
    cursorMode.addEventListener('change', (e: Event) => {
      pointerState.mode = (e.target as HTMLSelectElement).value as PointerMode;
      i18n.updateCursorModeLabel((e.target as HTMLSelectElement).value);
    });
    pointerState.mode = 'attract';
    i18n.updateCursorModeLabel('attract');
  }

  // Cursor strength slider
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

  // Cursor radius slider
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

  // Cursor pulse toggle
  const cursorPulse = document.getElementById('cursorPulse') as HTMLInputElement | null;
  if (cursorPulse) {
    cursorPulse.addEventListener('change', (e: Event) => {
      pointerState.pulse = (e.target as HTMLInputElement).checked;
    });
    cursorPulse.checked = true;
    pointerState.pulse = true;
  }
}

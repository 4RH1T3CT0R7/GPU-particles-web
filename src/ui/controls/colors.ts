/**
 * Color palette UI and shuffle controls
 */

import { colorPalettes } from '../../config/constants.ts';
import type { UIControlsContext } from './types.ts';

export function initColorControls(ctx: UIControlsContext): void {
  const { colorManager, i18n } = ctx;

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
}

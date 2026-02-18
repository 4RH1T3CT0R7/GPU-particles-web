/**
 * Application constants and configuration
 */

import type { ColorPalette, PointerMode } from '../types.ts';

export const DPR: number = Math.min(2, window.devicePixelRatio || 1);

export const SHAPE_NAMES_EN: readonly string[] = [
  'Cube', 'Sphere', 'Torus', 'Helix', 'Octahedron',
  'Superformula', 'Rose', 'Wave', 'Ribbon', 'Icosahedron', 'Polygon'
] as const;

export const SHAPE_NAMES_RU: readonly string[] = [
  'Куб', 'Сфера', 'Тор', 'Спираль', 'Октаэдр',
  'Суперформула', 'Роза', 'Волна', 'Лента', 'Икосаэдр', 'Полигон'
] as const;

export const FRACTAL_SHAPE_ID = 11;
export const EQUALIZER_SHAPE_ID_SIM = 12;

export const POINTER_MODES: readonly PointerMode[] = [
  'attract', 'repel', 'vortex-left', 'vortex-right', 'pulse', 'magnet', 'quasar'
] as const;

export const MAX_COLOR_STOPS = 6;

export const colorPalettes: readonly ColorPalette[] = [
  { name: 'Polar Aurora', a: [0.35, 0.78, 1.2], b: [1.15, 0.42, 1.1] },
  { name: 'Neon Reef', a: [0.12, 1.15, 0.82], b: [1.05, 0.42, 0.8] },
  { name: 'Amber Ice', a: [1.15, 0.48, 0.08], b: [0.25, 0.95, 1.15] },
  { name: 'Candy Glass', a: [1.05, 0.25, 0.6], b: [0.25, 1.05, 1.1] },
  { name: 'Lime Orchid', a: [0.4, 1.05, 0.2], b: [0.95, 0.25, 1.1] },
  { name: 'Golden Hour', a: [1.05, 0.92, 0.25], b: [0.32, 0.55, 1.2] },
  { name: 'Aqua Pulse', a: [0.0, 1.15, 0.95], b: [1.15, 0.2, 0.8] },
  { name: 'Copper Sky', a: [0.85, 0.55, 0.2], b: [0.15, 0.95, 1.15] },
];

export const randomFractalSeed = (): number[] => [
  Math.random() * 0.8 + 0.3,
  Math.random() * 0.6 - 0.3,
  Math.random() * 0.6 - 0.3,
  Math.random() * Math.PI * 2,
];

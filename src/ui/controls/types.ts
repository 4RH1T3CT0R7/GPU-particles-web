/**
 * Shared types for UI controls sub-modules
 */

import type { ShapeState, PointerState, ColorManager, SimulationState } from '../../types.ts';
import type { AudioAnalyzer } from '../../audio/analyzer.ts';
import type { I18n } from '../i18n.ts';

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

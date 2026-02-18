/**
 * Particle count, speed, attraction, reset/scatter, auto-morph, and speed controls
 */

import type { UIControlsContext } from './types.ts';

export interface ParticleControlsResult {
  getSpeedMultiplier: () => number;
}

export function initParticleControls(ctx: UIControlsContext): ParticleControlsResult {
  const { shapeState, simState, reinitializeParticles } = ctx;

  // Auto morph toggle
  const autoToggle = document.getElementById('autoToggle') as HTMLInputElement | null;
  if (autoToggle) {
    autoToggle.addEventListener('change', (e: Event) => {
      shapeState.autoMorph = (e.target as HTMLInputElement).checked;
    });
  }

  // Speed control (morph transition speed)
  const speedControl = document.getElementById('speedControl') as HTMLSelectElement | null;
  const manualSpeedGroup: HTMLElement | null = document.getElementById('manualSpeedGroup');
  const manualSpeed = document.getElementById('manualSpeed') as HTMLInputElement | null;
  const speedValue: HTMLElement | null = document.getElementById('speedValue');

  if (speedControl) {
    speedControl.addEventListener('change', (e: Event) => {
      const value: string = (e.target as HTMLSelectElement).value;
      shapeState.controlMode = value === 'manual' ? 'custom' : 'preset';

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

  return {
    getSpeedMultiplier: (): number => speedMultiplier
  };
}

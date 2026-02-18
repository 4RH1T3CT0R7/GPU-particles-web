/**
 * Shared light definitions and animation
 * Used by both WebGL2 and WebGPU renderers
 */

import type { LightDef } from '../types.ts';

export const lights: readonly LightDef[] = [
  { pos: [2, 3, 2], color: [1.0, 0.9, 0.8], intensity: 3.0, radius: 20.0 },
  { pos: [-3, 1, -2], color: [0.3, 0.5, 1.0], intensity: 2.5, radius: 15.0 },
  { pos: [0, -2, 3], color: [1.0, 0.3, 0.5], intensity: 2.0, radius: 12.0 },
  { pos: [3, 2, -3], color: [0.5, 1.0, 0.3], intensity: 1.8, radius: 12.0 }
];

/**
 * Animate lights into pre-allocated arrays (WebGL2 layout: separate arrays)
 * @param {number} time - current time in seconds
 * @param {Float32Array} positions - output: 3 floats per light
 * @param {Float32Array} colors - output: 3 floats per light
 * @param {Float32Array} intensities - output: 1 float per light
 * @param {Float32Array} radii - output: 1 float per light
 */
export function animateLights(time: number, positions: Float32Array, colors: Float32Array, intensities: Float32Array, radii: Float32Array): void {
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const angle = time * 0.3 + i * Math.PI * 0.5;
    const offset = Math.sin(time * 0.5 + i) * 0.5;

    positions[i * 3 + 0] = light.pos[0] * Math.cos(angle) - light.pos[2] * Math.sin(angle);
    positions[i * 3 + 1] = light.pos[1] + offset;
    positions[i * 3 + 2] = light.pos[0] * Math.sin(angle) + light.pos[2] * Math.cos(angle);

    colors[i * 3 + 0] = light.color[0];
    colors[i * 3 + 1] = light.color[1];
    colors[i * 3 + 2] = light.color[2];

    intensities[i] = light.intensity * (0.9 + 0.1 * Math.sin(time * 2.0 + i * 1.5));
    radii[i] = light.radius;
  }
}

/**
 * Animate lights into a stride-12 Float32Array (WebGPU WGSL struct layout)
 * Per light: [pos.x, pos.y, pos.z, _, color.r, color.g, color.b, intensity, radius, _, _, _]
 * @param {number} time - current time in seconds
 * @param {Float32Array} buffer - output: 12 floats per light
 */
export function animateLightsGPU(time: number, buffer: Float32Array): void {
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const idx = i * 12;
    const angle = time * 0.3 + i * Math.PI * 0.5;
    const offset = Math.sin(time * 0.5 + i) * 0.5;

    buffer[idx + 0] = light.pos[0] * Math.cos(angle) - light.pos[2] * Math.sin(angle);
    buffer[idx + 1] = light.pos[1] + offset;
    buffer[idx + 2] = light.pos[0] * Math.sin(angle) + light.pos[2] * Math.cos(angle);

    buffer[idx + 4] = light.color[0];
    buffer[idx + 5] = light.color[1];
    buffer[idx + 6] = light.color[2];

    buffer[idx + 7] = light.intensity * (0.9 + 0.1 * Math.sin(time * 2.0 + i * 1.5));
    buffer[idx + 8] = light.radius;
  }
}

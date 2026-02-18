/**
 * 3D shape generators and fractal functions for particle simulation
 * Assembled from modular GLSL snippets
 */

import { shapesPrimitivesGLSL } from './shapes-primitives.ts';
import { shapesFractalGLSL } from './shapes-fractal.ts';
import { shapesDispatcherGLSL } from './shapes-dispatcher.ts';

// Assemble the full shapes GLSL block from individual modules
export const shapesGLSL: string =
  shapesPrimitivesGLSL +
  shapesFractalGLSL +
  shapesDispatcherGLSL;

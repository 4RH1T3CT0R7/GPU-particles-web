/**
 * Shared type definitions for GPU Particles
 */

export type PointerMode = 'attract' | 'repel' | 'vortex-left' | 'vortex-right' | 'pulse' | 'magnet' | 'quasar';

export interface ColorPalette {
  name: string;
  a: [number, number, number];
  b: [number, number, number];
}

export interface Camera {
  eye: number[];
  target: number[];
  up: number[];
  fov: number;
  aspect: number;
  near: number;
  far: number;
  viewMat: Float32Array;
  projMat: Float32Array;
  angle: { x: number; y: number };
  distance: number;
  targetDistance: number;
  _dirty: boolean;
  _prevAngleX: number;
  _prevAngleY: number;
  _prevDistance: number;
  _prevAspect: number;
}

export interface SimulationState {
  readonly texSize: number;
  readonly N: number;
  readonly posTex: WebGLTexture[];
  readonly velTex: WebGLTexture[];
  readonly simFBO: WebGLFramebuffer[];
  simRead: number;
  readonly idxVAO: WebGLVertexArrayObject | null;
  initSimulation(size: number): void;
  destroySimResources(): void;
  swapBuffers(): void;
}

export interface ShapeState {
  shapeA: number;
  shapeB: number;
  morph: number;
  nextSwitch: number;
  transitionSpeed: number;
  customTransition: number;
  controlMode: string;
  isMorphing: boolean;
  shapeMode: string;
  targetShapeStrength: number;
  shapeStrength: number;
  autoMorph: boolean;
}

export interface FractalState {
  seedA: number[];
  seedB: number[];
  morph: number;
  timer: number;
  duration: number;
}

export interface PointerState {
  enabled: boolean;
  mode: PointerMode;
  strength: number;
  radius: number;
  pulse: boolean;
  x: number;
  y: number;
  pressing: boolean;
}

export interface AudioState {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
}

export interface RenderTarget {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

export interface BloomTargets {
  texA: WebGLTexture;
  texB: WebGLTexture;
  fboA: WebGLFramebuffer;
  fboB: WebGLFramebuffer;
  width: number;
  height: number;
}

export interface RenderPipeline {
  resize(width: number, height: number): void;
  getRenderTarget(): RenderTarget;
  getBloomTargets(): BloomTargets;
  readonly width: number;
  readonly height: number;
}

export interface ColorManager {
  readonly colorStops: Float32Array;
  colorStopCount: number;
  currentPaletteIndex: number;
  rebuildColorStops(palette: ColorPalette): void;
  animateColorStops(time: number): void;
}

export interface UniformLocations {
  [key: string]: WebGLUniformLocation | null;
}

export interface LightDef {
  pos: [number, number, number];
  color: [number, number, number];
  intensity: number;
  radius: number;
}

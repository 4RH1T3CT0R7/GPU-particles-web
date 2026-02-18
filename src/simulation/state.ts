/**
 * Simulation state management
 */

import { createTex, createFBO } from '../core/utils.ts';
import { randomFractalSeed } from '../config/constants.ts';
import type { SimulationState, ShapeState, FractalState, PointerState } from '../types.ts';

export function createSimulationState(gl: WebGL2RenderingContext, simSize: number = 256): SimulationState {
  let texSize: number = simSize;
  let posTex: WebGLTexture[] = [];
  let velTex: WebGLTexture[] = [];
  let simFBO: WebGLFramebuffer[] = [];
  let simRead: number = 0;
  let idxVAO: WebGLVertexArrayObject | null = null;
  let idxVBO: WebGLBuffer | null = null;
  let N: number = 0;

  const makeSimTex = (): WebGLTexture => createTex(gl, texSize, texSize, {
    internalFormat: gl.RGBA16F,
    srcFormat: gl.RGBA,
    type: gl.HALF_FLOAT
  });

  const initSimulation = (size: number): void => {
    texSize = size;
    N = texSize * texSize;
    console.log(`✓ Инициализация симуляции: ${N} частиц (${texSize}x${texSize})`);

    // Create textures
    posTex = [makeSimTex(), makeSimTex()];
    velTex = [makeSimTex(), makeSimTex()];
    // FBO[0] writes to texture set 1, FBO[1] writes to texture set 0 (matches original)
    simFBO = [
      createFBO(gl, [posTex[1], velTex[1]]),
      createFBO(gl, [posTex[0], velTex[0]])
    ];

    // Create particle indices
    const indices: Float32Array = new Float32Array(N);
    for (let i = 0; i < N; i++) indices[i] = i;

    idxVAO = gl.createVertexArray();
    gl.bindVertexArray(idxVAO);
    idxVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idxVBO);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    simRead = 0;
  };

  const destroySimResources = (): void => {
    posTex.forEach((t: WebGLTexture) => gl.deleteTexture(t));
    velTex.forEach((t: WebGLTexture) => gl.deleteTexture(t));
    simFBO.forEach((f: WebGLFramebuffer) => gl.deleteFramebuffer(f));
    if (idxVBO) gl.deleteBuffer(idxVBO);
    if (idxVAO) gl.deleteVertexArray(idxVAO);
    posTex = [];
    velTex = [];
    simFBO = [];
    idxVBO = null;
    idxVAO = null;
  };

  return {
    get texSize(): number { return texSize; },
    get N(): number { return N; },
    get posTex(): WebGLTexture[] { return posTex; },
    get velTex(): WebGLTexture[] { return velTex; },
    get simFBO(): WebGLFramebuffer[] { return simFBO; },
    get simRead(): number { return simRead; },
    set simRead(val: number) { simRead = val; },
    get idxVAO(): WebGLVertexArrayObject | null { return idxVAO; },
    initSimulation,
    destroySimResources,
    swapBuffers: (): void => { simRead = 1 - simRead; }
  };
}

export function createShapeState(): ShapeState {
  let shapeA: number = 0;
  let shapeB: number = 0;
  let morph: number = 0.0;
  let nextSwitch: number = 15.0;
  let transitionSpeed: number = 15.0;
  let customTransition: number = 15.0;
  let controlMode: string = 'preset';
  let isMorphing: boolean = false;
  let shapeMode: string = 'shapes';
  let targetShapeStrength: number = 0.95;
  let shapeStrength: number = 0.95;
  let autoMorph: boolean = true;

  return {
    get shapeA(): number { return shapeA; },
    set shapeA(val: number) { shapeA = val; },
    get shapeB(): number { return shapeB; },
    set shapeB(val: number) { shapeB = val; },
    get morph(): number { return morph; },
    set morph(val: number) { morph = val; },
    get nextSwitch(): number { return nextSwitch; },
    set nextSwitch(val: number) { nextSwitch = val; },
    get transitionSpeed(): number { return transitionSpeed; },
    set transitionSpeed(val: number) { transitionSpeed = val; },
    get customTransition(): number { return customTransition; },
    set customTransition(val: number) { customTransition = val; },
    get controlMode(): string { return controlMode; },
    set controlMode(val: string) { controlMode = val; },
    get isMorphing(): boolean { return isMorphing; },
    set isMorphing(val: boolean) { isMorphing = val; },
    get shapeMode(): string { return shapeMode; },
    set shapeMode(val: string) { shapeMode = val; },
    get targetShapeStrength(): number { return targetShapeStrength; },
    set targetShapeStrength(val: number) { targetShapeStrength = val; },
    get shapeStrength(): number { return shapeStrength; },
    set shapeStrength(val: number) { shapeStrength = val; },
    get autoMorph(): boolean { return autoMorph; },
    set autoMorph(val: boolean) { autoMorph = val; }
  };
}

export function createFractalState(): FractalState {
  return {
    seedA: randomFractalSeed(),
    seedB: randomFractalSeed(),
    morph: 0,
    timer: 0,
    duration: 18.0
  };
}

export function createPointerState(): PointerState {
  return {
    enabled: true,  // Enable by default
    mode: 'attract',
    strength: 1.0,
    radius: 0.5,
    pulse: true,    // Enable pulse by default
    x: 0,
    y: 0,
    pressing: false
  };
}

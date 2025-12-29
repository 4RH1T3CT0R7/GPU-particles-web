/**
 * Simulation state management
 */

import { createTex, createFBO } from '../core/utils.js';
import { randomFractalSeed } from '../config/constants.js';

export function createSimulationState(gl, simSize = 256) {
  let texSize = simSize;
  let posTex = [];
  let velTex = [];
  let simFBO = [];
  let simRead = 0;
  let idxVAO = null;
  let idxVBO = null;
  let N = 0;

  const makeSimTex = () => createTex(gl, texSize, texSize, {
    internalFormat: gl.RGBA32F,
    srcFormat: gl.RGBA,
    type: gl.FLOAT
  });

  const initSimulation = (size) => {
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
    const indices = new Float32Array(N);
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

  const destroySimResources = () => {
    posTex.forEach((t) => gl.deleteTexture(t));
    velTex.forEach((t) => gl.deleteTexture(t));
    simFBO.forEach((f) => gl.deleteFramebuffer(f));
    if (idxVBO) gl.deleteBuffer(idxVBO);
    if (idxVAO) gl.deleteVertexArray(idxVAO);
    posTex = [];
    velTex = [];
    simFBO = [];
    idxVBO = null;
    idxVAO = null;
  };

  return {
    get texSize() { return texSize; },
    get N() { return N; },
    get posTex() { return posTex; },
    get velTex() { return velTex; },
    get simFBO() { return simFBO; },
    get simRead() { return simRead; },
    set simRead(val) { simRead = val; },
    get idxVAO() { return idxVAO; },
    initSimulation,
    destroySimResources,
    swapBuffers: () => { simRead = 1 - simRead; }
  };
}

export function createShapeState() {
  let shapeA = 0;
  let shapeB = 1;
  let morph = 0.0;
  let nextSwitch = 5.0;
  let transitionSpeed = 15.0;
  let customTransition = 15.0;
  let controlMode = 'preset';
  let isMorphing = false;
  let shapeMode = 'shapes';
  let targetShapeStrength = 0.95;
  let shapeStrength = 0.95;
  let autoMorph = true;

  return {
    get shapeA() { return shapeA; },
    set shapeA(val) { shapeA = val; },
    get shapeB() { return shapeB; },
    set shapeB(val) { shapeB = val; },
    get morph() { return morph; },
    set morph(val) { morph = val; },
    get nextSwitch() { return nextSwitch; },
    set nextSwitch(val) { nextSwitch = val; },
    get transitionSpeed() { return transitionSpeed; },
    set transitionSpeed(val) { transitionSpeed = val; },
    get customTransition() { return customTransition; },
    set customTransition(val) { customTransition = val; },
    get controlMode() { return controlMode; },
    set controlMode(val) { controlMode = val; },
    get isMorphing() { return isMorphing; },
    set isMorphing(val) { isMorphing = val; },
    get shapeMode() { return shapeMode; },
    set shapeMode(val) { shapeMode = val; },
    get targetShapeStrength() { return targetShapeStrength; },
    set targetShapeStrength(val) { targetShapeStrength = val; },
    get shapeStrength() { return shapeStrength; },
    set shapeStrength(val) { shapeStrength = val; },
    get autoMorph() { return autoMorph; },
    set autoMorph(val) { autoMorph = val; }
  };
}

export function createFractalState() {
  return {
    seedA: randomFractalSeed(),
    seedB: randomFractalSeed(),
    morph: 0,
    timer: 0,
    duration: 18.0
  };
}

export function createPointerState() {
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

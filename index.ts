/*
  GPU Particle Shapes — WebGL2
  Fully modular version
*/

//TODO FIX QUASAR

// Import all modules
import { DPR, SHAPE_NAMES_EN, SHAPE_NAMES_RU, FRACTAL_SHAPE_ID, EQUALIZER_SHAPE_ID_SIM, POINTER_MODES, MAX_COLOR_STOPS, colorPalettes } from './src/config/constants.ts';
import { MAX_DELTA_TIME, CAMERA_DIST_MIN, CAMERA_DIST_MAX, CAMERA_DIST_DEFAULT, CAMERA_ZOOM_LERP, SHAPE_STRENGTH_DEFAULT } from './src/config/physics.ts';
import { PBR_ROUGHNESS, PBR_METALLIC, BLOOM_STRENGTH, BLOOM_THRESHOLD, EXPOSURE } from './src/config/rendering.ts';
import { initWebGL } from './src/core/webgl.ts';
import { link, createQuadVAO, drawQuad, bindTex } from './src/core/utils.ts';
import { simVS } from './src/shaders/common.ts';
import { initPhysicsEngine, stepPhysics, getWebGLBuffers, type PhysicsEngine } from './src/physics/wasm-loader.ts';
import { particleVS, particleFS } from './src/shaders/particle.ts';
import { blitFS } from './src/shaders/blit.ts';
import { bloomFS } from './src/shaders/bloom.ts';
import { createCamera, updateCameraMatrix } from './src/camera/controls.ts';
import { createAudioAnalyzer } from './src/audio/analyzer.ts';
import { createI18n } from './src/ui/i18n.ts';
import { initMobileMenu } from './src/ui/mobile.ts';
import { initUIControls } from './src/ui/controls.ts';
import { createSimulationState, createShapeState, createFractalState, createPointerState } from './src/simulation/state.ts';
import { createRenderPipeline, createColorManager } from './src/rendering/pipeline.ts';
import { lights, animateLights } from './src/app/lights.ts';

(async function () {
  console.log('🚀 Starting modular GPU Particles application...');

  // Initialize WebGL
  const webglContext = initWebGL();
  if (!webglContext) return;

  const { canvas, gl } = webglContext;

  // Create quad VAO for full-screen rendering
  const quadVAO = createQuadVAO(gl);

  // Compile shaders and link programs
  console.log('🔧 Compiling shaders...');
  const progParticles = link(gl, particleVS, particleFS);
  const progPresent = link(gl, simVS, blitFS);
  const progBloom = link(gl, simVS, bloomFS);
  console.log('✓ All shaders compiled successfully');

  // Cache uniform locations (avoid 40+ string lookups per frame)
  const loc = (prog: WebGLProgram, name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name);
  const particleLocs = {
    texSize: loc(progParticles, 'u_texSize'), proj: loc(progParticles, 'u_proj'),
    view: loc(progParticles, 'u_view'), time: loc(progParticles, 'u_time'),
    colors: loc(progParticles, 'u_colors'), colorCount: loc(progParticles, 'u_colorCount'),
    cameraPos: loc(progParticles, 'u_cameraPos'),
    roughness: loc(progParticles, 'u_roughness'), metallic: loc(progParticles, 'u_metallic'),
    pbrStrength: loc(progParticles, 'u_pbrStrength'),
    lightPositions: loc(progParticles, 'u_lightPositions'), lightColors: loc(progParticles, 'u_lightColors'),
    lightIntensities: loc(progParticles, 'u_lightIntensities'), lightRadii: loc(progParticles, 'u_lightRadii'),
    lightCount: loc(progParticles, 'u_lightCount'),
  };
  const bloomLocs = {
    tex: loc(progBloom, 'u_tex'), direction: loc(progBloom, 'u_direction'),
    threshold: loc(progBloom, 'u_threshold'),
  };
  const presentLocs = {
    tex: loc(progPresent, 'u_tex'), bloom: loc(progPresent, 'u_bloom'),
    resolution: loc(progPresent, 'u_resolution'), time: loc(progPresent, 'u_time'),
    exposure: loc(progPresent, 'u_exposure'), bloomStrength: loc(progPresent, 'u_bloomStrength'),
  };

  // Pre-allocated typed arrays (avoid allocations in render loop)
  const lightPositions = new Float32Array(8 * 3);
  const lightColors = new Float32Array(8 * 3);
  const lightIntensities = new Float32Array(8);
  const lightRadii = new Float32Array(8);
  const fractalSeedsA = new Float32Array(4);
  const fractalSeedsB = new Float32Array(4);
  const rotMatA = new Float32Array(9);
  const rotMatB = new Float32Array(9);

  // Shape rotation time multipliers (per shape ID, baked into CPU rotation matrix)
  //                     0    1    2    3    4    5    6    7    8    9   10   11   12
  const ROT_MULTS = [1.0, 0.8, 1.1, 0.6, 0.9, 0.7, 0.5, 0.9, 1.0, 0.75, 0.4, 0.25, 0.0];

  function buildRotMat(effectiveTime: number, out: Float32Array) {
    const ax = effectiveTime * 0.21;
    const ay = effectiveTime * 0.17;
    const az = effectiveTime * 0.13;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(az), sz = Math.sin(az);
    // Column-major: M = rotZ * rotY * rotX
    out[0] = cz*cy;          out[1] = sz*cy;          out[2] = -sy;
    out[3] = cz*sy*sx-sz*cx; out[4] = sz*sy*sx+cz*cx; out[5] = cy*sx;
    out[6] = cz*sy*cx+sz*sx; out[7] = sz*sy*cx-cz*sx; out[8] = cy*cx;
  }

  // Initialize state managers
  const simState = createSimulationState(gl, 256);
  const shapeState = createShapeState();
  const fractalState = createFractalState();
  const pointerState = createPointerState();
  const renderPipeline = createRenderPipeline(gl);
  const colorManager = createColorManager();
  const camera = createCamera();
  const audioAnalyzer = createAudioAnalyzer();
  const i18n = createI18n();

  // Initialize simulation
  simState.initSimulation(256);

  const physicsEngine = await initPhysicsEngine(simState.N);

  // Initialize first color palette
  colorManager.rebuildColorStops(colorPalettes[0]);

  // Initialize camera with proper structure
  camera.angle = { x: 0.5, y: 0.5 };
  camera.distance = CAMERA_DIST_DEFAULT;
  camera.targetDistance = CAMERA_DIST_DEFAULT;
  camera.target = [0, 0, 0];
  camera.aspect = canvas.width / canvas.height;
  updateCameraMatrix(camera);

  // Mouse state
  const mouse = { x: 0, y: 0, leftDown: false, rightDown: false, lastX: 0, lastY: 0 };
  const pointerWorld = [0, 0, 0];
  const viewDir = [0, 0, -1];

  // Resize handler
  const size = { w: 0, h: 0 };
  function resize() {
    const w = Math.floor(canvas.clientWidth * DPR);
    const h = Math.floor(canvas.clientHeight * DPR);
    if (size.w === w && size.h === h) return;
    size.w = w;
    size.h = h;
    canvas.width = w;
    canvas.height = h;
    renderPipeline.resize(w, h);
    camera.aspect = w / h;
    updateCameraMatrix(camera);
    gl.viewport(0, 0, w, h);
    console.log(`✓ Resized to ${w}x${h}`);
  }

  // Initial resize
  resize();
  window.addEventListener('resize', resize);

  // Initialize particles via WASM physics engine
  function reinitializeParticles(_pattern = 0.0) {
    physicsEngine.world.reinitialize(Math.floor(Math.random() * 0xFFFFFFFF));
    // Upload WASM output to both sets of position/velocity textures
    const { pos, vel } = getWebGLBuffers(physicsEngine);
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, simState.posTex[i]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, simState.texSize, simState.texSize,
        gl.RGBA, gl.FLOAT, pos);
      gl.bindTexture(gl.TEXTURE_2D, simState.velTex[i]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, simState.texSize, simState.texSize,
        gl.RGBA, gl.FLOAT, vel);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    simState.simRead = 0;
    console.log('Particles reinitialized via WASM');
  }

  reinitializeParticles();

  // Shape scheduling
  function scheduleShapes(dt: number, t: number) {
    if (shapeState.shapeMode === 'free') {
      shapeState.morph = 0.0;
      shapeState.isMorphing = false;
      return;
    }

    if (shapeState.shapeMode === 'equalizer') {
      shapeState.shapeA = EQUALIZER_SHAPE_ID_SIM;
      shapeState.shapeB = EQUALIZER_SHAPE_ID_SIM;
      shapeState.morph = 0.0;
      shapeState.isMorphing = false;
      return;
    }

    if (shapeState.shapeMode === 'fractals') {
      shapeState.shapeA = FRACTAL_SHAPE_ID;
      shapeState.shapeB = FRACTAL_SHAPE_ID;
      // Reduced attraction for fractals to prevent jerking
      shapeState.targetShapeStrength = SHAPE_STRENGTH_DEFAULT;

      // Smoother easing with longer hold periods
      const hold = 0.25;
      const phase = fractalState.timer / fractalState.duration;
      const clampedPhase = Math.min(1.0, phase);
      const eased = (() => {
        if (clampedPhase < hold) return 0.0;
        if (clampedPhase > 1.0 - hold) return 1.0;
        const u = (clampedPhase - hold) / (1.0 - 2.0 * hold);
        // Cubic easing for smoother transitions
        return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      })();
      shapeState.morph = eased;

      fractalState.timer += dt;
      if (fractalState.timer >= fractalState.duration) {
        fractalState.timer = 0.0;
        fractalState.morph = 0.0;
        fractalState.seedA = fractalState.seedB;
        fractalState.seedB = [
          Math.random() * 0.8 + 0.3,
          Math.random() * 0.6 - 0.3,
          Math.random() * 0.6 - 0.3,
          Math.random() * Math.PI * 2
        ];
        fractalState.duration = 16.0 + Math.random() * 10.0;
        // Change palette on fractal transition
        colorManager.currentPaletteIndex = (colorManager.currentPaletteIndex + 1) % colorPalettes.length;
        colorManager.rebuildColorStops(colorPalettes[colorManager.currentPaletteIndex]);
      }
      return;
    }

    if (!shapeState.autoMorph) {
      shapeState.morph = 0.0;
      shapeState.shapeB = shapeState.shapeA;
      shapeState.isMorphing = false;
      return;
    }

    const SHAPE_COUNT = 11; // Total number of shapes (0-10)
    const duration = shapeState.controlMode === 'custom' ? shapeState.customTransition : shapeState.transitionSpeed;

    if (t > shapeState.nextSwitch) {
      shapeState.shapeA = shapeState.shapeB;
      shapeState.shapeB = (shapeState.shapeB + 1) % SHAPE_COUNT; // Sequential transition
      shapeState.morph = 0.0;
      shapeState.isMorphing = true;
      shapeState.nextSwitch = t + duration + 2.0;
      // Change palette on shape change
      colorManager.currentPaletteIndex = (colorManager.currentPaletteIndex + 1) % colorPalettes.length;
      colorManager.rebuildColorStops(colorPalettes[colorManager.currentPaletteIndex]);
      console.log(`Auto-morph: shape ${shapeState.shapeA} -> ${shapeState.shapeB}`);
    }

    if (shapeState.isMorphing) {
      shapeState.morph += dt / duration;
      if (shapeState.morph >= 1.0) {
        shapeState.morph = 1.0;
        shapeState.isMorphing = false;
        shapeState.nextSwitch = t + duration;
      }
    }
  }

  // Compute pointer world position using raycast (fixed to match cursor position)
  function computePointerWorld() {
    const nx = mouse.x * 2 - 1;
    const ny = 1 - mouse.y * 2;
    const aspect = canvas.width / canvas.height;
    const fov = camera.fov * Math.PI / 180;
    const depth = camera.distance * 0.8;

    // Forward direction from camera to target
    const forward = [
      camera.target[0] - camera.eye[0],
      camera.target[1] - camera.eye[1],
      camera.target[2] - camera.eye[2],
    ];
    const flen = Math.hypot(forward[0], forward[1], forward[2]) || 1;
    forward[0] /= flen; forward[1] /= flen; forward[2] /= flen;

    viewDir[0] = forward[0];
    viewDir[1] = forward[1];
    viewDir[2] = forward[2];

    // Right vector (cross product of forward and world up)
    const worldUp = [0, 1, 0];
    const right = [
      forward[1] * worldUp[2] - forward[2] * worldUp[1],
      forward[2] * worldUp[0] - forward[0] * worldUp[2],
      forward[0] * worldUp[1] - forward[1] * worldUp[0],
    ];
    const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

    // Up vector (cross product of right and forward)
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];

    // Compute pointer position at intersection plane
    const scale = Math.tan(fov / 2) * depth;

    pointerWorld[0] = camera.eye[0] + forward[0] * depth + (right[0] * nx * aspect + up[0] * ny) * scale;
    pointerWorld[1] = camera.eye[1] + forward[1] * depth + (right[1] * nx * aspect + up[1] * ny) * scale;
    pointerWorld[2] = camera.eye[2] + forward[2] * depth + (right[2] * nx * aspect + up[2] * ny) * scale;
  }

  // Mouse event handlers with camera control
  const updateMouse = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (mouse.rightDown) {
      // Rotate camera when right mouse button is pressed
      const dx = (x - mouse.lastX) * Math.PI * 1.5;
      const dy = (y - mouse.lastY) * Math.PI * 1.5;
      camera.angle.y -= dx;  // Fix inverted horizontal camera movement
      camera.angle.x += dy;
      // Clamp vertical angle to prevent camera flip
      camera.angle.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, camera.angle.x));
      updateCameraMatrix(camera);
      mouse.lastX = x;
      mouse.lastY = y;
    }

    mouse.x = x;
    mouse.y = y;
  };

  canvas.addEventListener('mousemove', (e) => {
    updateMouse(e);
    computePointerWorld();
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (e.button === 0) {
      mouse.leftDown = true;
    } else if (e.button === 2) {
      mouse.rightDown = true;
      mouse.lastX = (e.clientX - rect.left) / rect.width;
      mouse.lastY = (e.clientY - rect.top) / rect.height;
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.leftDown = false;
    else if (e.button === 2) mouse.rightDown = false;
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.leftDown = false;
    mouse.rightDown = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch events for mobile pointer interaction
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      mouse.x = (touch.clientX - rect.left) / rect.width;
      mouse.y = (touch.clientY - rect.top) / rect.height;
      mouse.leftDown = true;
      computePointerWorld();
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      mouse.x = (touch.clientX - rect.left) / rect.width;
      mouse.y = (touch.clientY - rect.top) / rect.height;
      computePointerWorld();
    }
  }, { passive: true });

  canvas.addEventListener('touchend', () => {
    mouse.leftDown = false;
  });

  canvas.addEventListener('touchcancel', () => {
    mouse.leftDown = false;
  });

  // Zoom with mouse wheel
  window.addEventListener('wheel', (e) => {
    if ((e.target as Element)?.closest('#controls')) return;
    e.preventDefault();
    const zoomSpeed = 0.15;
    const direction = e.deltaY > 0 ? 1 : -1;
    camera.targetDistance += direction * zoomSpeed;
    camera.targetDistance = Math.max(CAMERA_DIST_MIN, Math.min(CAMERA_DIST_MAX, camera.targetDistance));
  }, { passive: false });

  // UI initialization
  initMobileMenu();
  i18n.switchLanguage('ru');

  // Initialize UI controls
  const uiControls = initUIControls({
    shapeState,
    pointerState,
    colorManager,
    simState,
    i18n,
    audioAnalyzer,
    reinitializeParticles
  });

  // Main render loop
  let last = performance.now();

  function loop(now: number) {
    requestAnimationFrame(loop);
    const dt = Math.min(MAX_DELTA_TIME, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // Update audio
    const audioState = audioAnalyzer.updateAudioAnalysis();

    // Update shapes
    scheduleShapes(dt, t);

    // Update colors
    colorManager.animateColorStops(t);

    // Smooth camera zoom
    camera.distance += (camera.targetDistance - camera.distance) * CAMERA_ZOOM_LERP;
    updateCameraMatrix(camera);
    computePointerWorld();

    // Lerp shape strength
    shapeState.shapeStrength += (shapeState.targetShapeStrength - shapeState.shapeStrength) * 0.1;

    // ==== WASM Physics Step ====
    // Pass all parameters to WASM
    physicsEngine.world.set_shapes(
      shapeState.shapeA,
      shapeState.shapeB,
      shapeState.morph,
      shapeState.shapeStrength,
      uiControls.getSpeedMultiplier()
    );

    // Build rotation matrices (reuse pre-allocated arrays)
    const tA = t * 0.55;
    const tB = t * 0.58 + 2.5;
    const sA = shapeState.shapeA, sB = shapeState.shapeB;
    const effA = sA === 11 ? tA * 0.25 + fractalState.seedA[3] : tA * (ROT_MULTS[sA] || 0);
    const effB = sB === 11 ? tB * 0.25 + fractalState.seedB[3] : tB * (ROT_MULTS[sB] || 0);
    buildRotMat(effA, rotMatA);
    buildRotMat(effB, rotMatB);
    physicsEngine.world.set_shape_rotations(rotMatA, rotMatB);

    // Fractal seeds
    fractalSeedsA.set(fractalState.seedA);
    fractalSeedsB.set(fractalState.seedB);
    physicsEngine.world.set_fractal_seeds(fractalSeedsA, fractalSeedsB);

    // Pointer
    physicsEngine.world.set_pointer(
      pointerState.enabled && mouse.leftDown,
      POINTER_MODES.indexOf(pointerState.mode),
      pointerWorld[0], pointerWorld[1], pointerWorld[2],
      pointerState.strength,
      pointerState.radius,
      mouse.leftDown,
      pointerState.pulse,
      viewDir[0], viewDir[1], viewDir[2]
    );

    // Audio
    physicsEngine.world.set_audio(
      audioState.bass,
      audioState.mid,
      audioState.treble,
      audioState.energy
    );

    // Step physics
    stepPhysics(physicsEngine, dt, t);

    // Upload WASM output to WebGL textures
    const { pos, vel } = getWebGLBuffers(physicsEngine);
    const writeIdx = 1 - simState.simRead;
    gl.bindTexture(gl.TEXTURE_2D, simState.posTex[writeIdx]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, simState.texSize, simState.texSize,
      gl.RGBA, gl.FLOAT, pos);
    gl.bindTexture(gl.TEXTURE_2D, simState.velTex[writeIdx]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, simState.texSize, simState.texSize,
      gl.RGBA, gl.FLOAT, vel);
    gl.bindTexture(gl.TEXTURE_2D, null);
    simState.swapBuffers();

    // Render particles
    const renderTarget = renderPipeline.getRenderTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.fbo);
    gl.viewport(0, 0, renderTarget.width, renderTarget.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(progParticles);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    bindTex(gl, progParticles, 'u_pos', simState.posTex[simState.simRead], 0);
    gl.uniform2f(particleLocs.texSize, simState.texSize, simState.texSize);
    gl.uniformMatrix4fv(particleLocs.proj, false, camera.projMat);
    gl.uniformMatrix4fv(particleLocs.view, false, camera.viewMat);
    gl.uniform1f(particleLocs.time, t);
    gl.uniform3fv(particleLocs.colors, colorManager.colorStops);
    gl.uniform1i(particleLocs.colorCount, colorManager.colorStopCount);
    gl.uniform3fv(particleLocs.cameraPos, camera.eye);
    gl.uniform1f(particleLocs.roughness, PBR_ROUGHNESS);
    gl.uniform1f(particleLocs.metallic, PBR_METALLIC);
    gl.uniform1f(particleLocs.pbrStrength, 0.7);

    animateLights(t, lightPositions, lightColors, lightIntensities, lightRadii);

    gl.uniform3fv(particleLocs.lightPositions, lightPositions);
    gl.uniform3fv(particleLocs.lightColors, lightColors);
    gl.uniform1fv(particleLocs.lightIntensities, lightIntensities);
    gl.uniform1fv(particleLocs.lightRadii, lightRadii);
    gl.uniform1i(particleLocs.lightCount, lights.length);

    gl.bindVertexArray(simState.idxVAO);
    gl.drawArrays(gl.POINTS, 0, simState.N);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);

    // Bloom pass 1: horizontal blur at quarter resolution (extract bright areas)
    const bloom = renderPipeline.getBloomTargets();
    gl.useProgram(progBloom);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloom.fboA);
    gl.viewport(0, 0, bloom.width, bloom.height);
    gl.uniform1i(bloomLocs.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderTarget.tex);
    gl.uniform2f(bloomLocs.direction, 1.0 / bloom.width, 0.0);
    gl.uniform1f(bloomLocs.threshold, BLOOM_THRESHOLD);
    drawQuad(gl, quadVAO);

    // Bloom pass 2: vertical blur at quarter resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloom.fboB);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloom.texA);
    gl.uniform2f(bloomLocs.direction, 0.0, 1.0 / bloom.height);
    gl.uniform1f(bloomLocs.threshold, 0.0);
    drawQuad(gl, quadVAO);

    // Blit to screen with HDR tone mapping + pre-computed bloom
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size.w, size.h);
    gl.useProgram(progPresent);
    gl.uniform1i(presentLocs.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderTarget.tex);
    gl.uniform1i(presentLocs.bloom, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom.texB);
    gl.uniform2f(presentLocs.resolution, size.w, size.h);
    gl.uniform1f(presentLocs.time, t);
    gl.uniform1f(presentLocs.exposure, EXPOSURE);
    gl.uniform1f(presentLocs.bloomStrength, BLOOM_STRENGTH);
    drawQuad(gl, quadVAO);
  }

  console.log('✓ Modular application initialized successfully!');
  console.log('📦 All modules loaded from src/ directory');

  requestAnimationFrame(loop);
})();

/*
  GPU Particle Shapes — WebGL2
  Fully modular version
*/

//TODO FIX QUASAR

// Import all modules
import { DPR, SHAPE_NAMES_EN, SHAPE_NAMES_RU, FRACTAL_SHAPE_ID, EQUALIZER_SHAPE_ID_SIM, POINTER_MODES, MAX_COLOR_STOPS, colorPalettes } from './src/config/constants.js';
import { initWebGL } from './src/core/webgl.js';
import { link, createQuadVAO, drawQuad, bindTex } from './src/core/utils.js';
import { simVS } from './src/shaders/common.js';
import { simFS } from './src/shaders/simulation.js';
import { initFS } from './src/shaders/init.js';
import { particleVS, particleFS } from './src/shaders/particle.js';
import { blitFS } from './src/shaders/blit.js';
import { createCamera, updateCameraMatrix } from './src/camera/controls.js';
import { createAudioAnalyzer } from './src/audio/analyzer.js';
import { createI18n } from './src/ui/i18n.js';
import { initMobileMenu } from './src/ui/mobile.js';
import { initUIControls } from './src/ui/controls.js';
import { createSimulationState, createShapeState, createFractalState, createPointerState } from './src/simulation/state.js';
import { createRenderPipeline, createColorManager } from './src/rendering/pipeline.js';

(function () {
  console.log('🚀 Starting modular GPU Particles application...');

  // Initialize WebGL
  const webglContext = initWebGL();
  if (!webglContext) return;

  const { canvas, gl } = webglContext;

  // Create quad VAO for full-screen rendering
  const quadVAO = createQuadVAO(gl);

  // Compile shaders and link programs
  console.log('🔧 Compiling shaders...');
  const progSim = link(gl, simVS, simFS);
  const progInit = link(gl, simVS, initFS);
  const progParticles = link(gl, particleVS, particleFS);
  const progPresent = link(gl, simVS, blitFS);
  console.log('✓ All shaders compiled successfully');

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

  // Initialize first color palette
  colorManager.rebuildColorStops(colorPalettes[0]);

  // Initialize camera with proper structure
  camera.angle = { x: 0.5, y: 0.5 };
  camera.distance = 3.5;
  camera.targetDistance = 3.5;
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

  // Initialize particles (run init shader) - writes to both FBOs like original
  function reinitializeParticles(pattern = 0.0) {
    gl.viewport(0, 0, simState.texSize, simState.texSize);
    gl.useProgram(progInit);

    // Initialize both FBOs to ensure consistent state
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, simState.simFBO[i]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.uniform1f(gl.getUniformLocation(progInit, 'u_seed'), Math.random() * 1000);
      gl.uniform1f(gl.getUniformLocation(progInit, 'u_pattern'), pattern);
      drawQuad(gl, quadVAO);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    simState.simRead = 0;
    console.log('✓ Particles initialized');
  }

  reinitializeParticles();

  // Shape scheduling
  function scheduleShapes(dt, t) {
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
      shapeState.targetShapeStrength = 0.85;

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

  // Compute pointer world position using raycast (matches original)
  function computePointerWorld() {
    const nx = mouse.x * 2 - 1;
    const ny = 1 - mouse.y * 2;
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4;
    const depth = Math.max(0.35, camera.distance * 0.55);

    // Forward direction from camera position
    const forward = [
      -camera.eye[0] / camera.distance,
      -camera.eye[1] / camera.distance,
      -camera.eye[2] / camera.distance,
    ];
    viewDir[0] = forward[0];
    viewDir[1] = forward[1];
    viewDir[2] = forward[2];

    // Right vector (cross product with up)
    const right = [
      forward[2],
      0,
      -forward[0],
    ];
    const rlen = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rlen; right[1] /= rlen; right[2] /= rlen;

    // Up vector
    let up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const ulen = Math.hypot(up[0], up[1], up[2]) || 1;
    up = up.map((v) => v / ulen);

    // Compute pointer position at intersection plane
    const zoomScale = 1.0 + (camera.distance - 1.0) * 0.14;
    const scale = Math.tan(fov / 2) * depth * (1.2 + zoomScale * 0.4);

    pointerWorld[0] = camera.target[0] + forward[0] * depth + (right[0] * nx * aspect + up[0] * ny) * scale;
    pointerWorld[1] = camera.target[1] + forward[1] * depth + (right[1] * nx * aspect + up[1] * ny) * scale;
    pointerWorld[2] = camera.target[2] + forward[2] * depth + (right[2] * nx * aspect + up[2] * ny) * scale;
  }

  // Mouse event handlers with camera control
  const updateMouse = (e) => {
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

  // Zoom with mouse wheel
  window.addEventListener('wheel', (e) => {
    if (e.target.closest('#controls')) return;
    e.preventDefault();
    const zoomSpeed = 0.15;
    const direction = e.deltaY > 0 ? 1 : -1;
    camera.targetDistance += direction * zoomSpeed;
    camera.targetDistance = Math.max(1.0, Math.min(12, camera.targetDistance));
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

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // Update audio
    const audioState = audioAnalyzer.updateAudioAnalysis();

    // Update shapes
    scheduleShapes(dt, t);

    // Update colors
    colorManager.animateColorStops(t);

    // Smooth camera zoom
    camera.distance += (camera.targetDistance - camera.distance) * 0.1;
    updateCameraMatrix(camera);
    computePointerWorld();

    // Lerp shape strength
    shapeState.shapeStrength += (shapeState.targetShapeStrength - shapeState.shapeStrength) * 0.1;

    // Run simulation
    gl.useProgram(progSim);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_time'), t);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_speedMultiplier'), uiControls.getSpeedMultiplier());
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeA'), shapeState.shapeA);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_shapeB'), shapeState.shapeB);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_morph'), shapeState.morph);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_shapeStrength'), shapeState.shapeStrength);
    gl.uniform2f(gl.getUniformLocation(progSim, 'u_simSize'), simState.texSize, simState.texSize);
    gl.uniform3fv(gl.getUniformLocation(progSim, 'u_pointerPos'), pointerWorld);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerStrength'), pointerState.strength);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerRadius'), pointerState.radius);
    gl.uniform1i(gl.getUniformLocation(progSim, 'u_pointerMode'), POINTER_MODES.indexOf(pointerState.mode));
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerActive'), pointerState.enabled && mouse.leftDown ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerPress'), mouse.leftDown ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_pointerPulse'), pointerState.pulse ? 1.0 : 0.0);
    gl.uniform3fv(gl.getUniformLocation(progSim, 'u_viewDir'), viewDir);
    gl.uniform4fv(gl.getUniformLocation(progSim, 'u_fractalSeeds[0]'), new Float32Array(fractalState.seedA));
    gl.uniform4fv(gl.getUniformLocation(progSim, 'u_fractalSeeds[1]'), new Float32Array(fractalState.seedB));
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioBass'), audioState.bass);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioMid'), audioState.mid);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioTreble'), audioState.treble);
    gl.uniform1f(gl.getUniformLocation(progSim, 'u_audioEnergy'), audioState.energy);

    // Read from current textures, write to alternate FBO (which writes to other texture set)
    const read = simState.simRead;
    bindTex(gl, progSim, 'u_pos', simState.posTex[read], 0);
    bindTex(gl, progSim, 'u_vel', simState.velTex[read], 1);

    // FBO[read] writes to the opposite texture set (see FBO creation)
    gl.bindFramebuffer(gl.FRAMEBUFFER, simState.simFBO[read]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, simState.texSize, simState.texSize);
    drawQuad(gl, quadVAO);
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
    gl.uniform2f(gl.getUniformLocation(progParticles, 'u_texSize'), simState.texSize, simState.texSize);
    gl.uniformMatrix4fv(gl.getUniformLocation(progParticles, 'u_proj'), false, camera.projMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(progParticles, 'u_view'), false, camera.viewMat);
    gl.uniform1f(gl.getUniformLocation(progParticles, 'u_time'), t);
    gl.uniform3fv(gl.getUniformLocation(progParticles, 'u_colors'), colorManager.colorStops);
    gl.uniform1i(gl.getUniformLocation(progParticles, 'u_colorCount'), colorManager.colorStopCount);
    gl.uniform3f(gl.getUniformLocation(progParticles, 'u_lightPos'), 2, 3, 2);

    gl.bindVertexArray(simState.idxVAO);
    gl.drawArrays(gl.POINTS, 0, simState.N);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);

    // Blit to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size.w, size.h);
    gl.useProgram(progPresent);
    bindTex(gl, progPresent, 'u_tex', renderTarget.tex, 0);
    gl.uniform2f(gl.getUniformLocation(progPresent, 'u_resolution'), size.w, size.h);
    gl.uniform1f(gl.getUniformLocation(progPresent, 'u_time'), t);
    drawQuad(gl, quadVAO);
  }

  console.log('✓ Modular application initialized successfully!');
  console.log('📦 All modules loaded from src/ directory');

  requestAnimationFrame(loop);
})();

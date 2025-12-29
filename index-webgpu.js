/*
  GPU Particle Shapes — WebGPU with Ray Tracing
  Next-generation version with hardware-accelerated ray tracing
*/

import { initWebGPU, resizeWebGPU } from './src/gpu/device.js';
import { initializePipelines } from './src/gpu/pipelines.js';
import { DPR } from './src/config/constants.js';

(async function() {
  console.log('🚀 Starting WebGPU GPU Particles with Ray Tracing...');

  // Get canvas
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('❌ Canvas element not found');
    return;
  }

  // Initialize WebGPU
  const gpuContext = await initWebGPU(canvas);
  if (!gpuContext) {
    console.error('❌ WebGPU not available. Falling back to WebGL2...');
    // Fallback to WebGL2 version
    const webglScript = document.createElement('script');
    webglScript.type = 'module';
    webglScript.src = '/index.js';
    document.body.appendChild(webglScript);
    return;
  }

  const { device, presentation } = gpuContext;

  // Configuration
  const config = {
    particleCount: 65536,
    width: Math.floor(canvas.clientWidth * DPR),
    height: Math.floor(canvas.clientHeight * DPR),
    format: presentation.format,
  };

  canvas.width = config.width;
  canvas.height = config.height;

  // Initialize all pipelines
  console.log('📦 Initializing pipelines...');
  const pipelines = await initializePipelines(device, config);

  // State
  let currentBufferIndex = 0;
  let frameCount = 0;

  // Camera state
  const camera = {
    position: new Float32Array([0, 0, 10]),
    forward: new Float32Array([0, 0, -1]),
    right: new Float32Array([1, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    fov: Math.PI / 4,
  };

  // Lights
  const lights = [
    { pos: [2, 3, 2], color: [1.0, 0.9, 0.8], intensity: 3.0, radius: 20.0 },
    { pos: [-3, 1, -2], color: [0.3, 0.5, 1.0], intensity: 2.5, radius: 15.0 },
    { pos: [0, -2, 3], color: [1.0, 0.3, 0.5], intensity: 2.0, radius: 12.0 },
    { pos: [3, 2, -3], color: [0.5, 1.0, 0.3], intensity: 1.8, radius: 12.0 }
  ];

  // Initialize particles
  console.log('🎨 Initializing particles...');
  initializeParticles();

  function initializeParticles() {
    const particleData = new Float32Array(config.particleCount * 8); // 8 floats per particle

    for (let i = 0; i < config.particleCount; i++) {
      const idx = i * 8;
      const angle = (i / config.particleCount) * Math.PI * 2;
      const radius = 2 + Math.random() * 2;
      const height = (Math.random() - 0.5) * 4;

      // Position
      particleData[idx + 0] = Math.cos(angle) * radius;
      particleData[idx + 1] = height;
      particleData[idx + 2] = Math.sin(angle) * radius;
      particleData[idx + 3] = 0.05 + Math.random() * 0.05; // radius

      // Velocity
      particleData[idx + 4] = (Math.random() - 0.5) * 0.1;
      particleData[idx + 5] = (Math.random() - 0.5) * 0.1;
      particleData[idx + 6] = (Math.random() - 0.5) * 0.1;
      particleData[idx + 7] = 0.0; // padding
    }

    device.queue.writeBuffer(
      pipelines.simulation.buffers.particleA,
      0,
      particleData.buffer
    );
    device.queue.writeBuffer(
      pipelines.simulation.buffers.particleB,
      0,
      particleData.buffer
    );

    console.log('✓ Particles initialized');
  }

  // Update simulation params
  function updateSimulationParams(time, deltaTime) {
    const params = new Float32Array(64); // 256 bytes / 4 = 64 floats
    params[0] = deltaTime;
    params[1] = time;
    params[2] = config.particleCount;
    params[3] = 1.0; // speedMultiplier

    // Shape params (simplified for now)
    params[4] = 0; // shapeA
    params[5] = 1; // shapeB
    params[6] = Math.sin(time * 0.5) * 0.5 + 0.5; // morph
    params[7] = 0.5; // shapeStrength

    // Pointer (disabled for now)
    params[8] = 0;
    params[9] = 0;
    params[10] = 0;
    params[11] = 0;

    device.queue.writeBuffer(
      pipelines.simulation.buffers.params,
      0,
      params.buffer
    );
  }

  // Update ray tracing params
  function updateRayTracingParams(time) {
    const params = new Float32Array(64);

    // Camera
    params.set(camera.position, 0); // cameraPos
    params.set(camera.forward, 4); // cameraForward
    params.set(camera.right, 8); // cameraRight
    params.set(camera.up, 12); // cameraUp
    params[15] = camera.fov;

    // Counts
    params[16] = lights.length;
    params[17] = config.particleCount;
    params[18] = 2; // maxBounces
    params[19] = 1; // samplesPerPixel

    params[20] = time;
    params[21] = frameCount;

    device.queue.writeBuffer(
      pipelines.rayTracing.buffers.params,
      0,
      params.buffer
    );

    // Update lights
    const lightData = new Float32Array(lights.length * 12); // 48 bytes = 12 floats per light
    lights.forEach((light, i) => {
      const idx = i * 12;
      const angle = time * 0.3 + i * Math.PI * 0.5;
      const offset = Math.sin(time * 0.5 + i) * 0.5;

      // Animated position
      lightData[idx + 0] = light.pos[0] * Math.cos(angle) - light.pos[2] * Math.sin(angle);
      lightData[idx + 1] = light.pos[1] + offset;
      lightData[idx + 2] = light.pos[0] * Math.sin(angle) + light.pos[2] * Math.cos(angle);

      // Color
      lightData[idx + 4] = light.color[0];
      lightData[idx + 5] = light.color[1];
      lightData[idx + 6] = light.color[2];

      // Properties
      lightData[idx + 7] = light.intensity * (0.9 + 0.1 * Math.sin(time * 2.0 + i * 1.5));
      lightData[idx + 8] = light.radius;
    });

    device.queue.writeBuffer(
      pipelines.rayTracing.buffers.lights,
      0,
      lightData.buffer
    );
  }

  // Resize handler
  function resize() {
    const width = Math.floor(canvas.clientWidth * DPR);
    const height = Math.floor(canvas.clientHeight * DPR);

    if (config.width === width && config.height === height) return;

    config.width = width;
    config.height = height;
    resizeWebGPU(gpuContext, width, height);

    console.log(`✓ Resized to ${width}x${height}`);
  }

  window.addEventListener('resize', resize);

  // Main render loop
  let lastTime = performance.now();

  async function frame(now) {
    const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const time = now / 1000;

    // Update params
    updateSimulationParams(time, deltaTime);
    updateRayTracingParams(time);

    // Create command encoder
    const commandEncoder = device.createCommandEncoder({
      label: 'Frame Commands'
    });

    // 1. Run particle simulation
    const simPass = commandEncoder.beginComputePass({
      label: 'Particle Simulation'
    });
    simPass.setPipeline(pipelines.simulation.pipeline);
    simPass.setBindGroup(0, pipelines.simulation.bindGroups[currentBufferIndex]);
    simPass.dispatchWorkgroups(pipelines.simulation.workgroupCount);
    simPass.end();

    // Swap buffers
    currentBufferIndex = 1 - currentBufferIndex;

    // 2. Ray tracing pass (TODO: implement full integration)
    // For now, this is a placeholder

    // 3. Render to canvas
    const textureView = presentation.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      label: 'Canvas Render Pass',
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.02, g: 0.03, b: 0.07, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });

    // Simple particle rendering (fallback for now)
    // TODO: Replace with ray traced output

    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);

    frameCount++;
    requestAnimationFrame(frame);
  }

  // Start render loop
  console.log('✅ WebGPU initialization complete!');
  console.log('🎬 Starting render loop...');
  requestAnimationFrame(frame);

})();

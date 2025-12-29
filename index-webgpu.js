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

  // Update temporal accumulation params
  function updateTemporalParams() {
    const params = new Float32Array(4);
    params[0] = 0.1; // alpha (blend factor)
    params[1] = frameCount; // frameCount
    params[2] = frameCount === 0 ? 1 : 0; // reset on first frame
    params[3] = 0; // padding

    device.queue.writeBuffer(
      pipelines.temporal.paramsBuffer,
      0,
      params.buffer
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

  // Create ray tracing bind group layout and pipeline
  let rayTracingPipeline = null;
  let rayTracingBindGroup = null;

  async function setupRayTracing() {
    console.log('🔧 Setting up ray tracing pipeline...');

    // Load and compile ray tracing shader
    const response = await fetch('/src/shaders-wgsl/ray-trace.wgsl');
    const shaderCode = await response.text();
    const shaderModule = device.createShaderModule({
      label: 'Ray Tracing Compute',
      code: shaderCode
    });

    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'Ray Tracing Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particles
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // bvh nodes
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // lights
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },            // params
        { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } } // output
      ]
    });

    // Create pipeline
    rayTracingPipeline = device.createComputePipeline({
      label: 'Ray Tracing Pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      }
    });

    // Create bind group
    rayTracingBindGroup = device.createBindGroup({
      label: 'Ray Tracing Bind Group',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleA } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });

    console.log('✓ Ray tracing pipeline ready');
  }

  await setupRayTracing();

  // Setup temporal accumulation bind group
  const temporalBindGroup = device.createBindGroup({
    label: 'Temporal Accumulation Bind Group',
    layout: pipelines.temporal.bindGroupLayout,
    entries: [
      { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },       // current frame
      { binding: 1, resource: pipelines.temporal.textures.history.createView() },      // history
      { binding: 2, resource: pipelines.temporal.textures.output.createView() },       // output
      { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }            // params
    ]
  });

  console.log('✓ Temporal accumulation bind group created');

  // Setup blit bind group (now uses temporal output)
  blitBindGroup = device.createBindGroup({
    label: 'Blit Bind Group',
    layout: pipelines.blit.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pipelines.temporal.textures.output.createView() },
      { binding: 1, resource: pipelines.blit.sampler },
      { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
    ]
  });

  console.log('✓ Blit bind group created');

  // Main render loop
  let lastTime = performance.now();

  async function frame(now) {
    const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const time = now / 1000;

    // Update params
    updateSimulationParams(time, deltaTime);
    updateRayTracingParams(time);
    updateTemporalParams();

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

    // 2. Build BVH (simplified - in real version needs proper construction)
    // For now we skip BVH build and assume static or simplified structure

    // 3. Ray tracing pass
    const rayTracePass = commandEncoder.beginComputePass({
      label: 'Ray Tracing'
    });
    rayTracePass.setPipeline(rayTracingPipeline);
    rayTracePass.setBindGroup(0, rayTracingBindGroup);
    rayTracePass.dispatchWorkgroups(
      pipelines.rayTracing.workgroupCount.x,
      pipelines.rayTracing.workgroupCount.y,
      1
    );
    rayTracePass.end();

    // 4. Temporal accumulation pass (smooths path tracing noise)
    const temporalPass = commandEncoder.beginComputePass({
      label: 'Temporal Accumulation'
    });
    temporalPass.setPipeline(pipelines.temporal.pipeline);
    temporalPass.setBindGroup(0, temporalBindGroup);
    temporalPass.dispatchWorkgroups(
      pipelines.temporal.workgroupCount.x,
      pipelines.temporal.workgroupCount.y,
      1
    );
    temporalPass.end();

    // 5. Copy temporal output to history for next frame
    commandEncoder.copyTextureToTexture(
      { texture: pipelines.temporal.textures.output },
      { texture: pipelines.temporal.textures.history },
      [config.width, config.height]
    );

    // 6. Blit temporally accumulated output to canvas
    const textureView = presentation.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      label: 'Blit to Canvas',
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });

    renderPass.setPipeline(pipelines.blit.pipeline);
    renderPass.setBindGroup(0, blitBindGroup);
    renderPass.draw(3, 1, 0, 0); // Full-screen triangle

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

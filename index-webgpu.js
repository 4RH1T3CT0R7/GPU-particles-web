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
    webglScript.src = './index.js';
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
  // Emergency stop is handled via window.__webgpu_render_stopped in device.js

  // Camera state
  const camera = {
    position: new Float32Array([0, 0, 10]),
    forward: new Float32Array([0, 0, -1]),
    right: new Float32Array([1, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    fov: Math.PI / 4,
  };
  // Track previous camera for temporal accumulation reset
  const prevCameraPos = new Float32Array([0, 0, 10]);
  let temporalNeedsReset = true;

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

  // Pre-allocated buffers for params (avoid GC pressure)
  const simParamsBuffer = new ArrayBuffer(256);
  const simParamsF32 = new Float32Array(simParamsBuffer);
  const simParamsView = new DataView(simParamsBuffer);

  const rtParamsBuffer = new ArrayBuffer(256);
  const rtParamsView = new DataView(rtParamsBuffer);

  const lightDataBuffer = new Float32Array(lights.length * 12);

  const temporalParamsBuffer = new ArrayBuffer(16);
  const temporalParamsView = new DataView(temporalParamsBuffer);

  // Update simulation params
  function updateSimulationParams(time, deltaTime) {
    // SimParams struct layout (matching particle-sim.wgsl):
    // offset 0:  deltaTime: f32
    // offset 4:  time: f32
    // offset 8:  particleCount: u32
    // offset 12: speedMultiplier: f32
    // offset 16: shapeA: u32
    // offset 20: shapeB: u32
    // offset 24: morph: f32
    // offset 28: shapeStrength: f32
    // offset 32: pointerPos: vec3<f32> (32, 36, 40)
    // offset 44: pointerStrength: f32
    // offset 48: pointerRadius: f32
    // offset 52: pointerMode: u32
    // offset 56: pointerActive: f32
    // offset 60: pointerPress: f32
    // offset 64: audioBass: f32
    // offset 68: audioMid: f32
    // offset 72: audioTreble: f32
    // offset 76: audioEnergy: f32
    simParamsF32.fill(0);
    const v = simParamsView;
    const LE = true; // little-endian
    v.setFloat32(0, deltaTime, LE);
    v.setFloat32(4, time, LE);
    v.setUint32(8, config.particleCount, LE);
    v.setFloat32(12, 1.0, LE); // speedMultiplier

    v.setUint32(16, 0, LE); // shapeA
    v.setUint32(20, 1, LE); // shapeB
    v.setFloat32(24, Math.sin(time * 0.5) * 0.5 + 0.5, LE); // morph
    v.setFloat32(28, 0.5, LE); // shapeStrength

    // Pointer (disabled for now) -- offsets 32-60 stay zero

    device.queue.writeBuffer(
      pipelines.simulation.buffers.params,
      0,
      simParamsBuffer
    );
  }

  // Update ray tracing params
  function updateRayTracingParams(time) {
    // RayTraceParams struct layout (matching ray-trace.wgsl):
    // offset 0:  cameraPos: vec3<f32> + _pad0
    // offset 16: cameraForward: vec3<f32> + _pad1
    // offset 32: cameraRight: vec3<f32> + _pad2
    // offset 48: cameraUp: vec3<f32> + fov: f32
    // offset 64: lightCount: u32
    // offset 68: particleCount: u32
    // offset 72: maxBounces: u32
    // offset 76: samplesPerPixel: u32
    // offset 80: time: f32
    // offset 84: frameCount: u32
    // offset 88: _pad3: u32
    // offset 92: _pad4: u32
    const v = rtParamsView;
    const LE = true;

    // Zero out
    for (let i = 0; i < 256; i += 4) v.setFloat32(i, 0, LE);

    // Camera vectors (vec3 + padding)
    v.setFloat32(0, camera.position[0], LE);
    v.setFloat32(4, camera.position[1], LE);
    v.setFloat32(8, camera.position[2], LE);

    v.setFloat32(16, camera.forward[0], LE);
    v.setFloat32(20, camera.forward[1], LE);
    v.setFloat32(24, camera.forward[2], LE);

    v.setFloat32(32, camera.right[0], LE);
    v.setFloat32(36, camera.right[1], LE);
    v.setFloat32(40, camera.right[2], LE);

    v.setFloat32(48, camera.up[0], LE);
    v.setFloat32(52, camera.up[1], LE);
    v.setFloat32(56, camera.up[2], LE);
    v.setFloat32(60, camera.fov, LE);

    // Counts (u32 fields)
    v.setUint32(64, lights.length, LE);
    v.setUint32(68, config.particleCount, LE);
    v.setUint32(72, 2, LE); // maxBounces
    v.setUint32(76, 1, LE); // samplesPerPixel

    v.setFloat32(80, time, LE);
    v.setUint32(84, frameCount, LE);

    device.queue.writeBuffer(
      pipelines.rayTracing.buffers.params,
      0,
      rtParamsBuffer
    );

    // Update lights (reuse pre-allocated buffer)
    lightDataBuffer.fill(0);
    lights.forEach((light, i) => {
      const idx = i * 12;
      const angle = time * 0.3 + i * Math.PI * 0.5;
      const offset = Math.sin(time * 0.5 + i) * 0.5;

      // Animated position
      lightDataBuffer[idx + 0] = light.pos[0] * Math.cos(angle) - light.pos[2] * Math.sin(angle);
      lightDataBuffer[idx + 1] = light.pos[1] + offset;
      lightDataBuffer[idx + 2] = light.pos[0] * Math.sin(angle) + light.pos[2] * Math.cos(angle);

      // Color
      lightDataBuffer[idx + 4] = light.color[0];
      lightDataBuffer[idx + 5] = light.color[1];
      lightDataBuffer[idx + 6] = light.color[2];

      // Properties
      lightDataBuffer[idx + 7] = light.intensity * (0.9 + 0.1 * Math.sin(time * 2.0 + i * 1.5));
      lightDataBuffer[idx + 8] = light.radius;
    });

    device.queue.writeBuffer(
      pipelines.rayTracing.buffers.lights,
      0,
      lightDataBuffer.buffer
    );
  }

  // Update temporal accumulation params
  function updateTemporalParams() {
    // Detect camera movement to reset temporal accumulation
    const dx = camera.position[0] - prevCameraPos[0];
    const dy = camera.position[1] - prevCameraPos[1];
    const dz = camera.position[2] - prevCameraPos[2];
    const cameraMoved = (dx * dx + dy * dy + dz * dz) > 0.0001;

    if (cameraMoved || temporalNeedsReset) {
      temporalNeedsReset = false;
      prevCameraPos.set(camera.position);
    }

    const shouldReset = cameraMoved || frameCount === 0;

    // TemporalParams struct layout (matching temporal-accumulation.wgsl):
    // offset 0: alpha: f32
    // offset 4: frameCount: u32
    // offset 8: reset: u32
    // offset 12: _pad: u32
    const v = temporalParamsView;
    const LE = true;
    v.setFloat32(0, 0.1, LE); // alpha
    v.setUint32(4, frameCount, LE); // frameCount
    v.setUint32(8, shouldReset ? 1 : 0, LE); // reset when camera moves
    v.setUint32(12, 0, LE); // padding

    device.queue.writeBuffer(
      pipelines.temporal.paramsBuffer,
      0,
      temporalParamsBuffer
    );
  }

  // Resize handler — recreates all resolution-dependent textures and bind groups
  function resize() {
    const width = Math.floor(canvas.clientWidth * DPR);
    const height = Math.floor(canvas.clientHeight * DPR);

    if (config.width === width && config.height === height) return;
    if (width === 0 || height === 0) return;

    config.width = width;
    config.height = height;
    resizeWebGPU(gpuContext, width, height);

    // Destroy old textures
    pipelines.rayTracing.outputTexture.destroy();
    pipelines.temporal.textures.history.destroy();
    pipelines.temporal.textures.output.destroy();

    // Recreate ray tracing output texture
    pipelines.rayTracing.outputTexture = device.createTexture({
      label: 'Ray Trace Output',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Recreate temporal textures
    pipelines.temporal.textures.history = device.createTexture({
      label: 'Temporal History',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });

    pipelines.temporal.textures.output = device.createTexture({
      label: 'Temporal Output',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Update workgroup counts
    pipelines.rayTracing.workgroupCount = {
      x: Math.ceil(width / 8),
      y: Math.ceil(height / 8),
    };
    pipelines.temporal.workgroupCount = {
      x: Math.ceil(width / 8),
      y: Math.ceil(height / 8),
    };

    // Recreate ray tracing bind groups (reference outputTexture)
    rayTracingBindGroups[0] = device.createBindGroup({
      label: 'Ray Tracing Bind Group A',
      layout: rayTracingBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleA } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });
    rayTracingBindGroups[1] = device.createBindGroup({
      label: 'Ray Tracing Bind Group B',
      layout: rayTracingBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleB } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });

    // Recreate temporal bind group (references all 3 textures)
    temporalBindGroup = device.createBindGroup({
      label: 'Temporal Accumulation Bind Group',
      layout: pipelines.temporal.bindGroupLayout,
      entries: [
        { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },
        { binding: 1, resource: pipelines.temporal.textures.history.createView() },
        { binding: 2, resource: pipelines.temporal.textures.output.createView() },
        { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }
      ]
    });

    // Recreate blit bind group (references temporal output)
    blitBindGroup = device.createBindGroup({
      label: 'Blit Bind Group',
      layout: pipelines.blit.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: pipelines.temporal.textures.output.createView() },
        { binding: 1, resource: pipelines.blit.sampler },
        { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
      ]
    });

    // Reset temporal accumulation for new resolution
    temporalNeedsReset = true;

    console.log(`✓ Resized to ${width}x${height} (textures + bind groups recreated)`);
  }

  window.addEventListener('resize', resize);

  // Create ray tracing and blit bind groups
  let rayTracingPipeline = null;
  let rayTracingBindGroupLayout = null;
  let rayTracingBindGroups = [null, null]; // Two bind groups for ping-pong buffering
  let temporalBindGroup = null;
  let blitBindGroup = null;

  async function setupRayTracing() {
    try {
      console.log('🔧 Setting up ray tracing pipeline...');

      // Load and compile ray tracing shader (with cache busting)
      const response = await fetch('./src/shaders-wgsl/ray-trace.wgsl?t=' + Date.now());
      const shaderCode = await response.text();

      console.log('🔍 Compiling ray tracing shader...');
      const shaderModule = device.createShaderModule({
        label: 'Ray Tracing Compute',
        code: shaderCode
      });
      console.log('✓ Ray tracing shader compiled');

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

    // Store layout for resize recreation
    rayTracingBindGroupLayout = bindGroupLayout;

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

    // Create two bind groups for ping-pong buffering
    rayTracingBindGroups[0] = device.createBindGroup({
      label: 'Ray Tracing Bind Group A',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleA } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });

    rayTracingBindGroups[1] = device.createBindGroup({
      label: 'Ray Tracing Bind Group B',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleB } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });

    console.log('✓ Ray tracing pipeline ready');
    } catch (error) {
      console.error('🚨 FATAL: Ray tracing setup failed!');
      console.error('Error:', error.message);
      console.error('⚠️  This is likely due to browser cache loading old buggy shader code.');
      console.error('⚠️  DO HARD REFRESH: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)');
      console.error('⚠️  Or clear browser cache and reload the page.');

      // Prevent render loop from starting
      window.__webgpu_render_stopped = true;

      throw new Error('WebGPU initialization failed - hard refresh required');
    }
  }

  // Setup ray tracing with fallback to WebGL2 on error
  try {
    await setupRayTracing();
  } catch (error) {
    console.error('🚨 WebGPU initialization FAILED. Browser cache issue detected.');
    console.error('🔄 Falling back to WebGL2 version...');

    // Fallback to WebGL2 version
    const webglScript = document.createElement('script');
    webglScript.type = 'module';
    webglScript.src = './index.js';
    document.body.appendChild(webglScript);
    return;
  }

  // Setup LBVH data bind groups (two sets for ping-pong particle buffers)
  const lbvhDataBindGroups = [
    device.createBindGroup({
      label: 'LBVH Data Bind Group A',
      layout: pipelines.bvh.layouts.data,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleA } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.bvh.buffers.mortonKeys } },
        { binding: 3, resource: { buffer: pipelines.bvh.buffers.mortonVals } },
        { binding: 4, resource: { buffer: pipelines.bvh.buffers.atomicFlags } },
        { binding: 5, resource: { buffer: pipelines.bvh.buffers.parentOf } },
      ]
    }),
    device.createBindGroup({
      label: 'LBVH Data Bind Group B',
      layout: pipelines.bvh.layouts.data,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleB } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.bvh.buffers.mortonKeys } },
        { binding: 3, resource: { buffer: pipelines.bvh.buffers.mortonVals } },
        { binding: 4, resource: { buffer: pipelines.bvh.buffers.atomicFlags } },
        { binding: 5, resource: { buffer: pipelines.bvh.buffers.parentOf } },
      ]
    })
  ];

  console.log('✓ LBVH bind groups created');

  // Setup temporal accumulation bind group
  temporalBindGroup = device.createBindGroup({
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
    // Emergency stop check
    if (window.__webgpu_render_stopped) {
      console.error('🚨 Render loop stopped due to errors. Hard refresh required.');
      return; // Stop render loop
    }

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

    // 2. Build LBVH (Morton codes + bitonic sort + Karras tree)
    const bvhWG = pipelines.bvh.workgroupCount;
    const bvhDataBG = lbvhDataBindGroups[currentBufferIndex];
    const bvhParamsBG = pipelines.bvh.paramsBindGroup;

    // 2a. Compute Morton codes
    {
      const p = commandEncoder.beginComputePass({ label: 'LBVH Morton Codes' });
      p.setPipeline(pipelines.bvh.pipelines.computeMortonCodes);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [0]); // offset 0 = base params
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 2b. Bitonic sort — local (stages 0-7)
    {
      const p = commandEncoder.beginComputePass({ label: 'LBVH Sort Local' });
      p.setPipeline(pipelines.bvh.pipelines.bitonicSortLocal);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [0]);
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 2c. Bitonic sort — global merge steps
    for (let i = 0; i < pipelines.bvh.sortSteps.length; i++) {
      const p = commandEncoder.beginComputePass({ label: `LBVH Sort Global ${i}` });
      p.setPipeline(pipelines.bvh.pipelines.bitonicSortGlobal);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [(i + 1) * 256]); // offset to sort step entry
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 2d. Build leaf nodes from sorted order
    {
      const p = commandEncoder.beginComputePass({ label: 'LBVH Build Leaves' });
      p.setPipeline(pipelines.bvh.pipelines.buildLeaves);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [0]);
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 2e. Build internal nodes (Karras 2012)
    {
      const p = commandEncoder.beginComputePass({ label: 'LBVH Build Tree' });
      p.setPipeline(pipelines.bvh.pipelines.buildInternalNodes);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [0]);
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 2f. Bottom-up AABB propagation
    {
      const p = commandEncoder.beginComputePass({ label: 'LBVH Compute Bounds' });
      p.setPipeline(pipelines.bvh.pipelines.computeNodeBounds);
      p.setBindGroup(0, bvhDataBG);
      p.setBindGroup(1, bvhParamsBG, [0]);
      p.dispatchWorkgroups(bvhWG);
      p.end();
    }

    // 3. Ray tracing pass (use current buffer after simulation)
    const rayTracePass = commandEncoder.beginComputePass({
      label: 'Ray Tracing'
    });
    rayTracePass.setPipeline(rayTracingPipeline);
    rayTracePass.setBindGroup(0, rayTracingBindGroups[currentBufferIndex]);
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

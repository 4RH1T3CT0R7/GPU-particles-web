/*
  GPU Particle Shapes — WebGPU with Ray Tracing
  Next-generation version with hardware-accelerated ray tracing
*/

import { initWebGPU, resizeWebGPU } from './src/gpu/device.ts';
import { initializePipelines } from './src/gpu/pipelines.ts';
import { DPR } from './src/config/constants.ts';
import { MAX_DELTA_TIME } from './src/config/physics.ts';
import { lights, animateLightsGPU } from './src/app/lights.ts';
import { initPhysicsEngine, stepPhysics, getGpuBufferView, type PhysicsEngine } from './src/physics/wasm-loader.ts';

(async function() {
  console.log('🚀 Starting WebGPU GPU Particles with Ray Tracing...');

  // Get canvas
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
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
    webglScript.src = './dist/index.js';
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
  const pipelines = initializePipelines(device, config);

  // Initialize WASM physics engine
  console.log('Loading WASM physics...');
  const physicsEngine = await initPhysicsEngine(config.particleCount);

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

  // Initialize particles
  console.log('🎨 Initializing particles...');
  initializeParticles();

  function initializeParticles() {
    // WASM physics engine already has initial particle positions (spiral ring)
    // Upload WASM output to both GPU particle buffers
    const initialData = getGpuBufferView(physicsEngine);
    device.queue.writeBuffer(
      pipelines.simulation.buffers.particleA,
      0,
      initialData
    );
    device.queue.writeBuffer(
      pipelines.simulation.buffers.particleB,
      0,
      initialData
    );
    console.log('Particles initialized from WASM');
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
  function updateSimulationParams(time: number, deltaTime: number) {
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
  function updateRayTracingParams(time: number) {
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

    // Update lights (shared animation, reuse pre-allocated buffer)
    lightDataBuffer.fill(0);
    animateLightsGPU(time, lightDataBuffer);

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

    const shouldReset = cameraMoved || temporalNeedsReset || frameCount === 0;

    if (cameraMoved || temporalNeedsReset) {
      temporalNeedsReset = false;
      prevCameraPos.set(camera.position);
    }

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
    const width = Math.floor(canvas!.clientWidth * DPR);
    const height = Math.floor(canvas!.clientHeight * DPR);

    if (config.width === width && config.height === height) return;
    if (width === 0 || height === 0) return;

    config.width = width;
    config.height = height;
    resizeWebGPU(gpuContext!, width, height);

    // Destroy old textures
    pipelines.rayTracing.outputTexture.destroy();
    pipelines.temporal.textures.a.destroy();
    pipelines.temporal.textures.b.destroy();

    // Recreate ray tracing output texture
    pipelines.rayTracing.outputTexture = device.createTexture({
      label: 'Ray Trace Output',
      size: { width, height },
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Recreate temporal ping-pong textures
    const temporalUsage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    pipelines.temporal.textures.a = device.createTexture({
      label: 'Temporal Texture A',
      size: { width, height },
      format: 'rgba16float',
      usage: temporalUsage,
    });

    pipelines.temporal.textures.b = device.createTexture({
      label: 'Temporal Texture B',
      size: { width, height },
      format: 'rgba16float',
      usage: temporalUsage,
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
      layout: rayTracingBindGroupLayout!,
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
      layout: rayTracingBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: pipelines.simulation.buffers.particleB } },
        { binding: 1, resource: { buffer: pipelines.bvh.buffers.bvh } },
        { binding: 2, resource: { buffer: pipelines.rayTracing.buffers.lights } },
        { binding: 3, resource: { buffer: pipelines.rayTracing.buffers.params } },
        { binding: 4, resource: pipelines.rayTracing.outputTexture.createView() }
      ]
    });

    // Recreate temporal ping-pong bind groups
    temporalBindGroups[0] = device.createBindGroup({
      label: 'Temporal Bind Group 0 (A→B)',
      layout: pipelines.temporal.bindGroupLayout,
      entries: [
        { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },
        { binding: 1, resource: pipelines.temporal.textures.a.createView() },
        { binding: 2, resource: pipelines.temporal.textures.b.createView() },
        { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }
      ]
    });
    temporalBindGroups[1] = device.createBindGroup({
      label: 'Temporal Bind Group 1 (B→A)',
      layout: pipelines.temporal.bindGroupLayout,
      entries: [
        { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },
        { binding: 1, resource: pipelines.temporal.textures.b.createView() },
        { binding: 2, resource: pipelines.temporal.textures.a.createView() },
        { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }
      ]
    });

    // Recreate blit ping-pong bind groups
    blitBindGroups[0] = device.createBindGroup({
      label: 'Blit Bind Group 0 (reads B)',
      layout: pipelines.blit.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: pipelines.temporal.textures.b.createView() },
        { binding: 1, resource: pipelines.blit.sampler },
        { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
      ]
    });
    blitBindGroups[1] = device.createBindGroup({
      label: 'Blit Bind Group 1 (reads A)',
      layout: pipelines.blit.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: pipelines.temporal.textures.a.createView() },
        { binding: 1, resource: pipelines.blit.sampler },
        { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
      ]
    });

    // Reset temporal accumulation for new resolution
    temporalPingPong = 0;
    temporalNeedsReset = true;

    console.log(`✓ Resized to ${width}x${height} (textures + bind groups recreated)`);
  }

  window.addEventListener('resize', resize);

  // Create ray tracing and blit bind groups
  let rayTracingPipeline: GPUComputePipeline | null = null;
  let rayTracingBindGroupLayout: GPUBindGroupLayout | null = null;
  let rayTracingBindGroups: (GPUBindGroup | null)[] = [null, null]; // Two bind groups for ping-pong buffering
  let temporalBindGroups: (GPUBindGroup | null)[] = [null, null]; // ping-pong: [0] writes B reads A, [1] writes A reads B
  let blitBindGroups: (GPUBindGroup | null)[] = [null, null];     // [0] reads B, [1] reads A
  let temporalPingPong = 0;

  async function setupRayTracing() {
    try {
      console.log('🔧 Setting up ray tracing pipeline...');

      // Use pre-compiled shader module from initializePipelines
      const shaderModule = pipelines.rayTracing.shaderModule;

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
      console.error('Error:', (error as Error).message);
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
    webglScript.src = './dist/index.js';
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

  // Setup temporal accumulation bind groups (ping-pong — no texture copy needed)
  // Group 0: history=A, output=B
  temporalBindGroups[0] = device.createBindGroup({
    label: 'Temporal Bind Group 0 (A→B)',
    layout: pipelines.temporal.bindGroupLayout,
    entries: [
      { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },
      { binding: 1, resource: pipelines.temporal.textures.a.createView() },
      { binding: 2, resource: pipelines.temporal.textures.b.createView() },
      { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }
    ]
  });
  // Group 1: history=B, output=A
  temporalBindGroups[1] = device.createBindGroup({
    label: 'Temporal Bind Group 1 (B→A)',
    layout: pipelines.temporal.bindGroupLayout,
    entries: [
      { binding: 0, resource: pipelines.rayTracing.outputTexture.createView() },
      { binding: 1, resource: pipelines.temporal.textures.b.createView() },
      { binding: 2, resource: pipelines.temporal.textures.a.createView() },
      { binding: 3, resource: { buffer: pipelines.temporal.paramsBuffer } }
    ]
  });

  console.log('✓ Temporal ping-pong bind groups created');

  // Setup blit bind groups (ping-pong — reads output of corresponding temporal group)
  blitBindGroups[0] = device.createBindGroup({
    label: 'Blit Bind Group 0 (reads B)',
    layout: pipelines.blit.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pipelines.temporal.textures.b.createView() },
      { binding: 1, resource: pipelines.blit.sampler },
      { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
    ]
  });
  blitBindGroups[1] = device.createBindGroup({
    label: 'Blit Bind Group 1 (reads A)',
    layout: pipelines.blit.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: pipelines.temporal.textures.a.createView() },
      { binding: 1, resource: pipelines.blit.sampler },
      { binding: 2, resource: { buffer: pipelines.blit.uniformsBuffer } }
    ]
  });

  console.log('✓ Blit ping-pong bind groups created');

  // Pre-allocated constant buffers for WASM physics (avoid per-frame GC)
  const identityRot = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
  const defaultFractalSeed = new Float32Array([0.5, 0.0, 0.0, 0.0]);

  // Main render loop
  let lastTime = performance.now();

  async function frame(now: number) {
    // Emergency stop check
    if (window.__webgpu_render_stopped) {
      console.error('🚨 Render loop stopped due to errors. Hard refresh required.');
      return; // Stop render loop
    }

    const deltaTime = Math.min(MAX_DELTA_TIME, (now - lastTime) / 1000);
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

    // Pass shape parameters to WASM physics engine
    physicsEngine.world.set_shapes(
        0,    // shapeA
        1,    // shapeB
        Math.sin(time * 0.5) * 0.5 + 0.5, // morph (animated)
        0.5,  // shapeStrength
        1.0   // speedMultiplier
    );
    physicsEngine.world.set_shape_rotations(identityRot, identityRot);
    physicsEngine.world.set_fractal_seeds(defaultFractalSeed, defaultFractalSeed);
    physicsEngine.world.set_audio(0, 0, 0, 0);

    // Pointer (disabled for now — will be wired to input system later)
    physicsEngine.world.set_pointer(
        false,  // active
        0,      // mode (attract)
        0, 0, 0, // position
        1.0,    // strength
        0.5,    // radius
        false,  // pressing
        false,  // pulse
        0, 0, -1 // view direction (camera forward)
    );

    // 1. WASM physics step (replaces GPU simulation compute pass)
    stepPhysics(physicsEngine, deltaTime, time);

    // Upload WASM particle data to GPU buffer
    // Always write to particleA — no ping-pong needed since WASM handles state internally
    const wasmParticleData = getGpuBufferView(physicsEngine);
    device.queue.writeBuffer(
      pipelines.simulation.buffers.particleA,
      0,
      wasmParticleData
    );

    // Use buffer index 0 consistently (particleA) for all downstream passes
    currentBufferIndex = 0;

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
    rayTracePass.setPipeline(rayTracingPipeline!);
    rayTracePass.setBindGroup(0, rayTracingBindGroups[currentBufferIndex]!);
    rayTracePass.dispatchWorkgroups(
      pipelines.rayTracing.workgroupCount.x,
      pipelines.rayTracing.workgroupCount.y,
      1
    );
    rayTracePass.end();

    // 4. Temporal accumulation pass (ping-pong — no texture copy needed)
    const tp = temporalPingPong;
    const temporalPass = commandEncoder.beginComputePass({
      label: 'Temporal Accumulation'
    });
    temporalPass.setPipeline(pipelines.temporal.pipeline);
    temporalPass.setBindGroup(0, temporalBindGroups[tp]!);
    temporalPass.dispatchWorkgroups(
      pipelines.temporal.workgroupCount.x,
      pipelines.temporal.workgroupCount.y,
      1
    );
    temporalPass.end();

    // 5. Blit temporally accumulated output to canvas
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
    renderPass.setBindGroup(0, blitBindGroups[tp]!);
    renderPass.draw(3, 1, 0, 0); // Full-screen triangle

    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);

    // Swap temporal ping-pong for next frame
    temporalPingPong = 1 - tp;
    frameCount++;
    requestAnimationFrame(frame);
  }

  // Start render loop
  console.log('✅ WebGPU initialization complete!');
  console.log('🎬 Starting render loop...');
  requestAnimationFrame(frame);

})();

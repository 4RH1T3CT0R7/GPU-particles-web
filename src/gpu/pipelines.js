/**
 * WebGPU Pipeline Management
 * Compute and Render Pipelines for Particle System
 */

import { createShaderModule, createBuffer, createTexture } from './device.js';

/**
 * Create Particle Simulation Compute Pipeline
 */
export async function createSimulationPipeline(device, particleCount) {
  console.log('🔧 Creating particle simulation pipeline...');

  // Load shader
  const response = await fetch('./src/shaders-wgsl/particle-sim.wgsl');
  const shaderCode = await response.text();
  const shaderModule = createShaderModule(device, shaderCode, 'Particle Simulation');

  // Create particle buffers (double-buffered)
  const particleSize = 32; // vec3 position (12) + padding (4) + vec3 velocity (12) + padding (4)
  const bufferSize = particleCount * particleSize;

  const particleBufferA = createBuffer(device, {
    label: 'Particle Buffer A',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const particleBufferB = createBuffer(device, {
    label: 'Particle Buffer B',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Create params uniform buffer
  const paramsSize = 256; // Generous size for SimParams struct
  const paramsBuffer = createBuffer(device, {
    label: 'Simulation Params',
    size: paramsSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Simulation Bind Group Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' }
      }
    ]
  });

  // Create pipeline layout
  const pipelineLayout = device.createPipelineLayout({
    label: 'Simulation Pipeline Layout',
    bindGroupLayouts: [bindGroupLayout]
  });

  // Create compute pipeline
  const pipeline = device.createComputePipeline({
    label: 'Particle Simulation Pipeline',
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'main'
    }
  });

  // Create bind groups (for double buffering)
  const bindGroupA = device.createBindGroup({
    label: 'Simulation Bind Group A',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBufferA } },
      { binding: 1, resource: { buffer: particleBufferB } },
      { binding: 2, resource: { buffer: paramsBuffer } }
    ]
  });

  const bindGroupB = device.createBindGroup({
    label: 'Simulation Bind Group B',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBufferB } },
      { binding: 1, resource: { buffer: particleBufferA } },
      { binding: 2, resource: { buffer: paramsBuffer } }
    ]
  });

  console.log('✓ Particle simulation pipeline created');

  return {
    pipeline,
    bindGroupLayout,
    bindGroups: [bindGroupA, bindGroupB],
    buffers: {
      particleA: particleBufferA,
      particleB: particleBufferB,
      params: paramsBuffer
    },
    workgroupCount: Math.ceil(particleCount / 256)
  };
}

/**
 * Create BVH Build Compute Pipeline (Simplified)
 */
export async function createBVHBuildPipeline(device, particleCount) {
  console.log('🔧 Creating BVH build pipeline...');

  const response = await fetch('./src/shaders-wgsl/bvh-simple.wgsl');
  const shaderCode = await response.text();
  const shaderModule = createShaderModule(device, shaderCode, 'BVH Build Simple');

  // Calculate BVH node count (2*N-1 for binary tree)
  const nodeCount = particleCount * 2 - 1;

  // Create BVH buffer
  const bvhNodeSize = 32; // min(12) + leftChild(4) + max(12) + rightChild(4)
  const bvhBuffer = createBuffer(device, {
    label: 'BVH Nodes',
    size: nodeCount * bvhNodeSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Create particle count uniform
  const particleCountBuffer = createBuffer(device, {
    label: 'BVH Particle Count',
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Write particle count
  device.queue.writeBuffer(particleCountBuffer, 0, new Uint32Array([particleCount]).buffer);

  // Create bind group layouts and pipelines for each kernel
  const initFlatLayout = device.createBindGroupLayout({
    label: 'Init Flat BVH Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particles
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },            // bvh nodes
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }             // particle count
    ]
  });

  const buildRootLayout = device.createBindGroupLayout({
    label: 'Build Root BVH Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // particles
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },            // bvh nodes
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }             // particle count
    ]
  });

  // Create pipelines
  const initFlatPipeline = device.createComputePipeline({
    label: 'Init Flat BVH Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [initFlatLayout] }),
    compute: { module: shaderModule, entryPoint: 'initializeFlatBVH' }
  });

  const buildRootPipeline = device.createComputePipeline({
    label: 'Build Root BVH Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [buildRootLayout] }),
    compute: { module: shaderModule, entryPoint: 'buildRootNode' }
  });

  console.log('✓ BVH build pipeline created');

  return {
    shaderModule,
    buffers: {
      bvh: bvhBuffer,
      particleCount: particleCountBuffer
    },
    pipelines: {
      initFlat: initFlatPipeline,
      buildRoot: buildRootPipeline
    },
    layouts: {
      initFlat: initFlatLayout,
      buildRoot: buildRootLayout
    },
    nodeCount,
    workgroupCount: Math.ceil(particleCount / 256)
  };
}

/**
 * Create Ray Tracing Compute Pipeline
 */
export async function createRayTracingPipeline(device, width, height) {
  console.log('🔧 Creating ray tracing pipeline...');

  const response = await fetch('./src/shaders-wgsl/ray-trace.wgsl');
  const shaderCode = await response.text();
  const shaderModule = createShaderModule(device, shaderCode, 'Ray Tracing');

  // Create output texture
  const outputTexture = createTexture(device, {
    label: 'Ray Trace Output',
    size: { width, height },
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });

  // Create light buffer
  const maxLights = 8;
  const lightSize = 48; // position(12) + pad(4) + color(12) + intensity(4) + radius(4) + padding(12)
  const lightBuffer = createBuffer(device, {
    label: 'Lights',
    size: maxLights * lightSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Create params buffer
  const paramsSize = 256;
  const paramsBuffer = createBuffer(device, {
    label: 'Ray Trace Params',
    size: paramsSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  console.log('✓ Ray tracing pipeline created');

  return {
    shaderModule,
    outputTexture,
    buffers: {
      lights: lightBuffer,
      params: paramsBuffer
    },
    workgroupSize: { x: 8, y: 8 },
    workgroupCount: {
      x: Math.ceil(width / 8),
      y: Math.ceil(height / 8)
    }
  };
}

/**
 * Create Particle Render Pipeline (traditional rasterization fallback)
 */
export async function createParticleRenderPipeline(device, format) {
  console.log('🔧 Creating particle render pipeline...');

  // Vertex shader (point sprites)
  const vertexShader = `
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) worldPos: vec3<f32>,
      @location(1) energy: f32,
      @location(2) particleHash: f32,
    }

    @group(0) @binding(0) var<storage, read> particles: array<vec3<f32>>;
    @group(0) @binding(1) var<uniform> viewProj: mat4x4<f32>;

    @vertex
    fn main(@builtin(vertex_index) idx: u32) -> VertexOutput {
      var output: VertexOutput;
      let pos = particles[idx];
      output.position = viewProj * vec4<f32>(pos, 1.0);
      output.worldPos = pos;
      output.energy = length(pos) * 0.04;
      output.particleHash = fract(sin(f32(idx) * 12.9898) * 43758.5453);
      return output;
    }
  `;

  // Fragment shader
  const fragmentShader = `
    @fragment
    fn main(
      @location(0) worldPos: vec3<f32>,
      @location(1) energy: f32,
      @location(2) particleHash: f32
    ) -> @location(0) vec4<f32> {
      // Simple particle color
      let color = mix(vec3<f32>(0.2, 0.5, 1.0), vec3<f32>(1.0, 0.3, 0.5), particleHash);
      return vec4<f32>(color * (0.5 + energy * 0.5), 1.0);
    }
  `;

  const vertexModule = createShaderModule(device, vertexShader, 'Particle Vertex');
  const fragmentModule = createShaderModule(device, fragmentShader, 'Particle Fragment');

  const pipeline = device.createRenderPipeline({
    label: 'Particle Render Pipeline',
    layout: 'auto',
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'main',
      targets: [{
        format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one',
          }
        }
      }]
    },
    primitive: {
      topology: 'point-list',
    }
  });

  console.log('✓ Particle render pipeline created');

  return { pipeline, vertexModule, fragmentModule };
}

/**
 * Create Temporal Accumulation Pipeline
 */
export async function createTemporalAccumulationPipeline(device, width, height) {
  console.log('🔧 Creating temporal accumulation pipeline...');

  const response = await fetch('./src/shaders-wgsl/temporal-accumulation.wgsl');
  const shaderCode = await response.text();
  const shaderModule = createShaderModule(device, shaderCode, 'Temporal Accumulation');

  // Create history texture (for accumulation)
  const historyTexture = createTexture(device, {
    label: 'Temporal History',
    size: { width, height },
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });

  // Create accumulation output texture
  const outputTexture = createTexture(device, {
    label: 'Temporal Output',
    size: { width, height },
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  // Create params buffer
  const paramsBuffer = createBuffer(device, {
    label: 'Temporal Params',
    size: 16, // alpha(4) + frameCount(4) + reset(4) + pad(4)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Initialize params
  const paramsData = new Float32Array([0.1, 0, 1, 0]); // alpha, frameCount, reset, pad
  device.queue.writeBuffer(paramsBuffer, 0, paramsData.buffer);

  // Create bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Temporal Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } }, // current
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } }, // history
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } }, // output
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }  // params
    ]
  });

  // Create pipeline
  const pipeline = device.createComputePipeline({
    label: 'Temporal Accumulation Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: {
      module: shaderModule,
      entryPoint: 'main'
    }
  });

  console.log('✓ Temporal accumulation pipeline created');

  return {
    pipeline,
    bindGroupLayout,
    textures: {
      history: historyTexture,
      output: outputTexture
    },
    paramsBuffer,
    workgroupCount: {
      x: Math.ceil(width / 8),
      y: Math.ceil(height / 8)
    }
  };
}

/**
 * Create Blit Pipeline (Ray traced output to canvas)
 */
export async function createBlitPipeline(device, format) {
  console.log('🔧 Creating blit pipeline...');

  const response = await fetch('./src/shaders-wgsl/blit.wgsl');
  const shaderCode = await response.text();
  const shaderModule = createShaderModule(device, shaderCode, 'Blit');

  // Create sampler
  const sampler = device.createSampler({
    label: 'Blit Sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Create uniforms buffer
  const uniformsBuffer = createBuffer(device, {
    label: 'Blit Uniforms',
    size: 16, // 4 floats
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Initialize uniforms
  const uniformsData = new Float32Array([0.2, 2.2, 0, 0]); // exposure, gamma, pad, pad
  device.queue.writeBuffer(uniformsBuffer, 0, uniformsData.buffer);

  const pipeline = device.createRenderPipeline({
    label: 'Blit Pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }]
    },
    primitive: {
      topology: 'triangle-list',
    }
  });

  console.log('✓ Blit pipeline created');

  return {
    pipeline,
    sampler,
    uniformsBuffer
  };
}

/**
 * Initialize all pipelines
 */
export async function initializePipelines(device, config) {
  console.log('🚀 Initializing all WebGPU pipelines...');

  const particleCount = config.particleCount || 65536;
  const width = config.width || 1920;
  const height = config.height || 1080;
  const format = config.format || 'bgra8unorm';

  const [simulation, bvh, rayTracing, temporal, render, blit] = await Promise.all([
    createSimulationPipeline(device, particleCount),
    createBVHBuildPipeline(device, particleCount),
    createRayTracingPipeline(device, width, height),
    createTemporalAccumulationPipeline(device, width, height),
    createParticleRenderPipeline(device, format),
    createBlitPipeline(device, format)
  ]);

  console.log('✅ All pipelines initialized!');

  return {
    simulation,
    bvh,
    rayTracing,
    temporal,
    render,
    blit,
    config: {
      particleCount,
      width,
      height,
      format
    }
  };
}

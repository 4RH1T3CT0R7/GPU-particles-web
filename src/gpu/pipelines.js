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

  try {
    // Load shader (with cache busting to ensure fresh version)
    const response = await fetch('./src/shaders-wgsl/particle-sim.wgsl?t=' + Date.now());
    if (!response.ok) {
      throw new Error(`Failed to load particle-sim.wgsl: HTTP ${response.status} ${response.statusText}`);
    }
    const shaderCode = await response.text();

    // Check if we got HTML instead of WGSL (404 error page)
    if (shaderCode.includes('<!DOCTYPE') || shaderCode.includes('<html>')) {
      throw new Error('Received HTML instead of WGSL shader code. File not found on server.');
    }

    console.log(`  ✓ Loaded particle-sim.wgsl (${shaderCode.length} chars)`);
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
  } catch (error) {
    console.error('❌ Failed to create simulation pipeline:', error);
    throw error;
  }
}

/**
 * Create LBVH Build Pipeline (Morton codes + Bitonic sort + Karras 2012)
 */
export async function createBVHBuildPipeline(device, particleCount) {
  console.log('🔧 Creating LBVH build pipeline...');

  try {
    const response = await fetch('./src/shaders-wgsl/bvh-lbvh.wgsl?t=' + Date.now());
    if (!response.ok) {
      throw new Error(`Failed to load bvh-lbvh.wgsl: HTTP ${response.status} ${response.statusText}`);
    }
    const shaderCode = await response.text();
    if (shaderCode.includes('<!DOCTYPE') || shaderCode.includes('<html>')) {
      throw new Error('Received HTML instead of WGSL shader code. File not found on server.');
    }
    console.log(`  ✓ Loaded bvh-lbvh.wgsl (${shaderCode.length} chars)`);
    const shaderModule = createShaderModule(device, shaderCode, 'LBVH Build');

    const nodeCount = particleCount * 2 - 1;

    // Buffers
    const bvhBuffer = createBuffer(device, {
      label: 'BVH Nodes',
      size: nodeCount * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const mortonKeysBuffer = createBuffer(device, {
      label: 'Morton Keys',
      size: particleCount * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const mortonValsBuffer = createBuffer(device, {
      label: 'Morton Values',
      size: particleCount * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const atomicFlagsBuffer = createBuffer(device, {
      label: 'Atomic Flags',
      size: nodeCount * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const parentOfBuffer = createBuffer(device, {
      label: 'Parent Pointers',
      size: nodeCount * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    // Params buffer: entry 0 for non-sort kernels, entries 1-100 for sort steps
    // Each entry 256-byte aligned (WebGPU minUniformBufferOffsetAlignment)
    const sortSteps = [];
    const log2N = Math.log2(particleCount);
    for (let stage = Math.ceil(Math.log2(256)); stage < log2N; stage++) {
      for (let step = stage; step >= 0; step--) {
        sortSteps.push({ stage, step });
      }
    }
    const totalParamEntries = 1 + sortSteps.length; // entry 0 + sort steps
    const paramsBuffer = createBuffer(device, {
      label: 'LBVH Params',
      size: totalParamEntries * 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Pre-fill params buffer
    const paramsData = new ArrayBuffer(totalParamEntries * 256);
    const pView = new DataView(paramsData);
    // Entry 0: non-sort kernels
    pView.setUint32(0, particleCount, true);
    pView.setUint32(4, 0, true);
    pView.setUint32(8, 0, true);
    pView.setUint32(12, 0, true);
    // Sort step entries
    for (let i = 0; i < sortSteps.length; i++) {
      const offset = (i + 1) * 256;
      pView.setUint32(offset + 0, particleCount, true);
      pView.setUint32(offset + 4, sortSteps[i].stage, true);
      pView.setUint32(offset + 8, sortSteps[i].step, true);
      pView.setUint32(offset + 12, 0, true);
    }
    device.queue.writeBuffer(paramsBuffer, 0, paramsData);

    // Bind group layout: group 0 (data)
    const dataLayout = device.createBindGroupLayout({
      label: 'LBVH Data Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    });

    // Bind group layout: group 1 (params with dynamic offset)
    const paramsLayout = device.createBindGroupLayout({
      label: 'LBVH Params Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ]
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [dataLayout, paramsLayout]
    });

    // Create all 6 compute pipelines
    const entryPoints = [
      'computeMortonCodes', 'bitonicSortLocal', 'bitonicSortGlobal',
      'buildLeaves', 'buildInternalNodes', 'computeNodeBounds'
    ];
    const pipelines = {};
    for (const ep of entryPoints) {
      pipelines[ep] = device.createComputePipeline({
        label: `LBVH ${ep}`,
        layout: pipelineLayout,
        compute: { module: shaderModule, entryPoint: ep }
      });
    }

    // Params bind group (shared, uses dynamic offset)
    const paramsBindGroup = device.createBindGroup({
      label: 'LBVH Params Bind Group',
      layout: paramsLayout,
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer, size: 16 } }
      ]
    });

    console.log(`✓ LBVH pipeline created (${sortSteps.length} sort steps)`);

    return {
      shaderModule,
      buffers: {
        bvh: bvhBuffer,
        mortonKeys: mortonKeysBuffer,
        mortonVals: mortonValsBuffer,
        atomicFlags: atomicFlagsBuffer,
        parentOf: parentOfBuffer,
      },
      pipelines,
      layouts: { data: dataLayout, params: paramsLayout },
      paramsBindGroup,
      sortSteps,
      nodeCount,
      workgroupCount: Math.ceil(particleCount / 256),
    };
  } catch (error) {
    console.error('❌ Failed to create BVH build pipeline:', error);
    throw error;
  }
}

/**
 * Create Ray Tracing Compute Pipeline
 */
export async function createRayTracingPipeline(device, width, height) {
  console.log('🔧 Creating ray tracing pipeline...');

  try {
    const response = await fetch('./src/shaders-wgsl/ray-trace.wgsl?t=' + Date.now());
    if (!response.ok) {
      throw new Error(`Failed to load ray-trace.wgsl: HTTP ${response.status} ${response.statusText}`);
    }
    const shaderCode = await response.text();
    if (shaderCode.includes('<!DOCTYPE') || shaderCode.includes('<html>')) {
      throw new Error('Received HTML instead of WGSL shader code. File not found on server.');
    }
    console.log(`  ✓ Loaded ray-trace.wgsl (${shaderCode.length} chars)`);
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
  } catch (error) {
    console.error('❌ Failed to create ray tracing pipeline:', error);
    throw error;
  }
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

  try {
    const response = await fetch('./src/shaders-wgsl/temporal-accumulation.wgsl?t=' + Date.now());
    if (!response.ok) {
      throw new Error(`Failed to load temporal-accumulation.wgsl: HTTP ${response.status} ${response.statusText}`);
    }
    const shaderCode = await response.text();
    if (shaderCode.includes('<!DOCTYPE') || shaderCode.includes('<html>')) {
      throw new Error('Received HTML instead of WGSL shader code. File not found on server.');
    }
    console.log(`  ✓ Loaded temporal-accumulation.wgsl (${shaderCode.length} chars)`);
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
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
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
  } catch (error) {
    console.error('❌ Failed to create temporal accumulation pipeline:', error);
    throw error;
  }
}

/**
 * Create Blit Pipeline (Ray traced output to canvas)
 */
export async function createBlitPipeline(device, format) {
  console.log('🔧 Creating blit pipeline...');

  try {
    const response = await fetch('./src/shaders-wgsl/blit.wgsl?t=' + Date.now());
    if (!response.ok) {
      throw new Error(`Failed to load blit.wgsl: HTTP ${response.status} ${response.statusText}`);
    }
    const shaderCode = await response.text();
    if (shaderCode.includes('<!DOCTYPE') || shaderCode.includes('<html>')) {
      throw new Error('Received HTML instead of WGSL shader code. File not found on server.');
    }
    console.log(`  ✓ Loaded blit.wgsl (${shaderCode.length} chars)`);
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
  } catch (error) {
    console.error('❌ Failed to create blit pipeline:', error);
    throw error;
  }
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

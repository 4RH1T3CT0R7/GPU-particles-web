/**
 * WebGPU Pipeline Management
 * Compute and Render Pipelines for Particle System
 */

import { createShaderModule, createBuffer, createTexture } from './device.ts';
import {
  particleSimShader,
  bvhLbvhShader,
  rayTraceShader,
  temporalAccumulationShader,
  blitShader,
} from '../wgsl/shaders.ts';

// ---------------------------------------------------------------------------
// Return-type interfaces
// ---------------------------------------------------------------------------

/** Result of createSimulationPipeline */
export interface SimulationPipelineResult {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroups: [GPUBindGroup, GPUBindGroup];
  buffers: {
    particleA: GPUBuffer;
    particleB: GPUBuffer;
    params: GPUBuffer;
  };
  workgroupCount: number;
}

/** A single bitonic-sort step descriptor. */
export interface SortStep {
  stage: number;
  step: number;
}

/** The set of named LBVH compute pipelines. */
export interface LBVHPipelines {
  computeMortonCodes: GPUComputePipeline;
  bitonicSortLocal: GPUComputePipeline;
  bitonicSortGlobal: GPUComputePipeline;
  buildLeaves: GPUComputePipeline;
  buildInternalNodes: GPUComputePipeline;
  computeNodeBounds: GPUComputePipeline;
}

/** Result of createBVHBuildPipeline */
export interface BVHBuildPipelineResult {
  shaderModule: GPUShaderModule;
  buffers: {
    bvh: GPUBuffer;
    mortonKeys: GPUBuffer;
    mortonVals: GPUBuffer;
    atomicFlags: GPUBuffer;
    parentOf: GPUBuffer;
  };
  pipelines: LBVHPipelines;
  layouts: {
    data: GPUBindGroupLayout;
    params: GPUBindGroupLayout;
  };
  paramsBindGroup: GPUBindGroup;
  sortSteps: SortStep[];
  nodeCount: number;
  workgroupCount: number;
}

/** 2D workgroup count for dispatching over a full-screen grid. */
export interface WorkgroupCount2D {
  x: number;
  y: number;
}

/** Result of createRayTracingPipeline */
export interface RayTracingPipelineResult {
  shaderModule: GPUShaderModule;
  outputTexture: GPUTexture;
  buffers: {
    lights: GPUBuffer;
    params: GPUBuffer;
  };
  workgroupSize: { x: number; y: number };
  workgroupCount: WorkgroupCount2D;
}

/** Result of createTemporalAccumulationPipeline */
export interface TemporalAccumulationPipelineResult {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
  textures: {
    a: GPUTexture;
    b: GPUTexture;
  };
  paramsBuffer: GPUBuffer;
  workgroupCount: WorkgroupCount2D;
}

/** Result of createBlitPipeline */
export interface BlitPipelineResult {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformsBuffer: GPUBuffer;
}

/** Configuration passed to initializePipelines. */
export interface PipelineConfig {
  particleCount?: number;
  width?: number;
  height?: number;
  format?: GPUTextureFormat;
}

/** The aggregate result of initializePipelines. */
export interface AllPipelines {
  simulation: SimulationPipelineResult;
  bvh: BVHBuildPipelineResult;
  rayTracing: RayTracingPipelineResult;
  temporal: TemporalAccumulationPipelineResult;
  blit: BlitPipelineResult;
  config: {
    particleCount: number;
    width: number;
    height: number;
    format: GPUTextureFormat;
  };
}

// ---------------------------------------------------------------------------
// Pipeline creation functions
// ---------------------------------------------------------------------------

/**
 * Create Particle Simulation Compute Pipeline
 */
export function createSimulationPipeline(device: GPUDevice, particleCount: number): SimulationPipelineResult {
  console.log('🔧 Creating particle simulation pipeline...');

  try {
    const shaderModule = createShaderModule(device, particleSimShader, 'Particle Simulation');

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
export function createBVHBuildPipeline(device: GPUDevice, particleCount: number): BVHBuildPipelineResult {
  console.log('🔧 Creating LBVH build pipeline...');

  try {
    const shaderModule = createShaderModule(device, bvhLbvhShader, 'LBVH Build');

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
    const sortSteps: SortStep[] = [];
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
    ] as const;
    const pipelines = {} as LBVHPipelines;
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
export function createRayTracingPipeline(device: GPUDevice, width: number, height: number): RayTracingPipelineResult {
  console.log('🔧 Creating ray tracing pipeline...');

  try {
    const shaderModule = createShaderModule(device, rayTraceShader, 'Ray Tracing');

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
 * Create Temporal Accumulation Pipeline
 */
export function createTemporalAccumulationPipeline(device: GPUDevice, width: number, height: number): TemporalAccumulationPipelineResult {
  console.log('🔧 Creating temporal accumulation pipeline...');

  try {
    const shaderModule = createShaderModule(device, temporalAccumulationShader, 'Temporal Accumulation');

  // Ping-pong temporal textures — each alternates between history (read) and output (write)
  const temporalUsage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
  const temporalTextureA = createTexture(device, {
    label: 'Temporal Texture A',
    size: { width, height },
    format: 'rgba16float',
    usage: temporalUsage,
  });

  const temporalTextureB = createTexture(device, {
    label: 'Temporal Texture B',
    size: { width, height },
    format: 'rgba16float',
    usage: temporalUsage,
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
        a: temporalTextureA,
        b: temporalTextureB,
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
export function createBlitPipeline(device: GPUDevice, format: GPUTextureFormat): BlitPipelineResult {
  console.log('🔧 Creating blit pipeline...');

  try {
    const shaderModule = createShaderModule(device, blitShader, 'Blit');

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
export function initializePipelines(device: GPUDevice, config: PipelineConfig): AllPipelines {
  console.log('🚀 Initializing all WebGPU pipelines...');

  const particleCount = config.particleCount || 65536;
  const width = config.width || 1920;
  const height = config.height || 1080;
  const format: GPUTextureFormat = config.format || 'bgra8unorm';

  const simulation = createSimulationPipeline(device, particleCount);
  const bvh = createBVHBuildPipeline(device, particleCount);
  const rayTracing = createRayTracingPipeline(device, width, height);
  const temporal = createTemporalAccumulationPipeline(device, width, height);
  const blit = createBlitPipeline(device, format);

  console.log('✅ All pipelines initialized!');

  return {
    simulation,
    bvh,
    rayTracing,
    temporal,
    blit,
    config: {
      particleCount,
      width,
      height,
      format
    }
  };
}

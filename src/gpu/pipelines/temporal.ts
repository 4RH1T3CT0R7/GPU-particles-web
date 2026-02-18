/**
 * Temporal Accumulation Pipeline
 */

import { createShaderModule, createBuffer, createTexture } from '../device.ts';
import { temporalAccumulationShader } from '../../wgsl/shaders.ts';
import type { TemporalAccumulationPipelineResult } from './types.ts';

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

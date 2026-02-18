/**
 * Blit Pipeline (Ray traced output to canvas)
 */

import { createShaderModule, createBuffer } from '../device.ts';
import { blitShader } from '../../wgsl/shaders.ts';
import type { BlitPipelineResult } from './types.ts';

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

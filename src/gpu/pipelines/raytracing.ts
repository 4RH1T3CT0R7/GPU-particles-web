/**
 * Ray Tracing Compute Pipeline
 */

import { createShaderModule, createBuffer, createTexture } from '../device.ts';
import { rayTraceShader } from '../../wgsl/shaders.ts';
import type { RayTracingPipelineResult } from './types.ts';

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

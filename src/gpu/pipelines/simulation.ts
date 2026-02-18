/**
 * Particle Simulation Compute Pipeline
 */

import { createShaderModule, createBuffer } from '../device.ts';
import { particleSimShader } from '../../wgsl/shaders.ts';
import type { SimulationPipelineResult } from './types.ts';

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

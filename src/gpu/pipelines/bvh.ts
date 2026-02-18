/**
 * LBVH Build Pipeline (Morton codes + Bitonic sort + Karras 2012)
 */

import { createShaderModule, createBuffer } from '../device.ts';
import { bvhLbvhShader } from '../../wgsl/shaders.ts';
import type { BVHBuildPipelineResult, LBVHPipelines, SortStep } from './types.ts';

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

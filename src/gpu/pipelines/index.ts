/**
 * WebGPU Pipeline Management
 * Compute and Render Pipelines for Particle System
 */

export type {
  SimulationPipelineResult,
  SortStep,
  LBVHPipelines,
  BVHBuildPipelineResult,
  WorkgroupCount2D,
  RayTracingPipelineResult,
  TemporalAccumulationPipelineResult,
  BlitPipelineResult,
  PipelineConfig,
  AllPipelines,
} from './types.ts';

export { createSimulationPipeline } from './simulation.ts';
export { createBVHBuildPipeline } from './bvh.ts';
export { createRayTracingPipeline } from './raytracing.ts';
export { createTemporalAccumulationPipeline } from './temporal.ts';
export { createBlitPipeline } from './blit.ts';

import type { PipelineConfig, AllPipelines } from './types.ts';
import { createSimulationPipeline } from './simulation.ts';
import { createBVHBuildPipeline } from './bvh.ts';
import { createRayTracingPipeline } from './raytracing.ts';
import { createTemporalAccumulationPipeline } from './temporal.ts';
import { createBlitPipeline } from './blit.ts';

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

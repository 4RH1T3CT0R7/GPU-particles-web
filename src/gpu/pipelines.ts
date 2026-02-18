/**
 * WebGPU Pipeline Management — barrel re-export
 *
 * All pipeline logic has been split into per-pipeline modules under ./pipelines/.
 * This file re-exports everything so that existing imports continue to work.
 */

export {
  // Types
  type SimulationPipelineResult,
  type SortStep,
  type LBVHPipelines,
  type BVHBuildPipelineResult,
  type WorkgroupCount2D,
  type RayTracingPipelineResult,
  type TemporalAccumulationPipelineResult,
  type BlitPipelineResult,
  type PipelineConfig,
  type AllPipelines,

  // Pipeline creation functions
  createSimulationPipeline,
  createBVHBuildPipeline,
  createRayTracingPipeline,
  createTemporalAccumulationPipeline,
  createBlitPipeline,

  // Aggregate initializer
  initializePipelines,
} from './pipelines/index.ts';

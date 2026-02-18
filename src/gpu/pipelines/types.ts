/**
 * Pipeline type interfaces
 */

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

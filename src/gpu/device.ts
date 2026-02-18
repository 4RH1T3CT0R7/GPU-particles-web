/**
 * WebGPU Device Initialization and Management
 */

/** Presentation info describing the canvas, its GPU context, format, and current size. */
export interface WebGPUPresentation {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  size: { width: number; height: number };
}

/** The full context object returned by initWebGPU on success. */
export interface WebGPUContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  presentation: WebGPUPresentation;
  features: GPUFeatureName[];
  limits: GPUSupportedLimits;
}

/** Options for the createBuffer helper. */
export interface CreateBufferOptions {
  label?: string;
  size: number;
  usage: GPUBufferUsageFlags;
  mappedAtCreation?: boolean;
}

/** Options for the createTexture helper. */
export interface CreateTextureOptions {
  label?: string;
  size: GPUExtent3DStrict;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  dimension?: GPUTextureDimension;
  mipLevelCount?: number;
  sampleCount?: number;
}

// Augment the Window interface for the emergency-stop properties used by WebGPU error handling.
declare global {
  interface Window {
    __webgpu_error_count?: number;
    __webgpu_render_stopped?: boolean;
  }
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUContext | null> {
  // Check WebGPU support
  if (!navigator.gpu) {
    console.error('❌ WebGPU not supported in this browser');
    return null;
  }

  console.log('🚀 Initializing WebGPU...');

  try {
    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      console.error('❌ No WebGPU adapter found');
      return null;
    }

    console.log('✓ WebGPU adapter acquired');
    console.log('  Adapter info:', adapter.info);

    // Check adapter limits
    const limits = adapter.limits;
    console.log('  Max buffer size:', (limits.maxBufferSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('  Max compute workgroup size X:', limits.maxComputeWorkgroupSizeX);
    console.log('  Max compute invocations per workgroup:', limits.maxComputeInvocationsPerWorkgroup);

    // Check for required features
    const requiredFeatures: GPUFeatureName[] = [];
    const optionalFeatures: GPUFeatureName[] = ['timestamp-query', 'indirect-first-instance'];
    const supportedFeatures: GPUFeatureName[] = [];

    for (const feature of optionalFeatures) {
      if (adapter.features.has(feature)) {
        supportedFeatures.push(feature);
        console.log('  ✓ Optional feature available:', feature);
      }
    }

    // Request device with features
    const device = await adapter.requestDevice({
      requiredFeatures: [...requiredFeatures, ...supportedFeatures],
      requiredLimits: {
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
        maxComputeWorkgroupSizeY: limits.maxComputeWorkgroupSizeY,
        maxComputeWorkgroupSizeZ: limits.maxComputeWorkgroupSizeZ,
        maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
        maxComputeWorkgroupStorageSize: limits.maxComputeWorkgroupStorageSize,
      }
    });

    if (!device) {
      console.error('❌ Failed to create WebGPU device');
      return null;
    }

    console.log('✓ WebGPU device created');

    // Handle device lost
    device.lost.then((info: GPUDeviceLostInfo) => {
      console.error('❌ WebGPU device lost:', info.message);
      if (info.reason !== 'destroyed') {
        console.error('  Device lost reason:', info.reason);
      }
    });

    // Emergency stop mechanism
    if (!window.__webgpu_error_count) {
      window.__webgpu_error_count = 0;
    }

    // Handle uncaptured errors
    device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
      const error = event.error;
      console.error('❌ WebGPU uncaptured error:', error.constructor.name);
      console.error('   Message:', error.message);

      // Emergency stop after too many errors
      window.__webgpu_error_count!++;
      if (window.__webgpu_error_count! >= 10) {
        window.__webgpu_render_stopped = true;
        console.error('🚨 EMERGENCY STOP: Too many WebGPU errors. Render loop stopped to prevent crash.');
        console.error('🚨 Please hard refresh the page (Ctrl+Shift+R) to clear browser cache.');
      }
    });

    // Configure canvas context
    const context = canvas.getContext('webgpu');
    if (!context) {
      console.error('❌ Failed to get WebGPU context');
      return null;
    }

    const canvasFormat: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    console.log('✓ Canvas context configured');
    console.log('  Canvas format:', canvasFormat);

    // Create presentation info
    const presentationInfo: WebGPUPresentation = {
      canvas,
      context,
      format: canvasFormat,
      size: {
        width: canvas.width,
        height: canvas.height,
      }
    };

    console.log('✅ WebGPU initialization complete!');

    return {
      adapter,
      device,
      presentation: presentationInfo,
      features: supportedFeatures,
      limits,
    };

  } catch (error) {
    console.error('❌ WebGPU initialization failed:', error);
    return null;
  }
}

/**
 * Resize canvas and update presentation
 */
export function resizeWebGPU(gpuContext: WebGPUContext, width: number, height: number): void {
  const { presentation } = gpuContext;

  presentation.canvas.width = width;
  presentation.canvas.height = height;

  presentation.size.width = width;
  presentation.size.height = height;

  console.log(`✓ WebGPU canvas resized: ${width}x${height}`);
}

/**
 * Create shader module helper
 */
export function createShaderModule(device: GPUDevice, code: string, label: string = 'Shader'): GPUShaderModule {
  try {
    const module = device.createShaderModule({
      label,
      code,
    });

    // Get compilation info
    module.getCompilationInfo().then((info: GPUCompilationInfo) => {
      for (const message of info.messages) {
        if (message.type === 'error') {
          console.error(`❌ Shader compilation error in ${label}:`, message.message);
          console.error(`  Line ${message.lineNum}:${message.linePos}`);
        } else if (message.type === 'warning') {
          console.warn(`⚠️ Shader warning in ${label}:`, message.message);
        }
      }
    });

    return module;
  } catch (error) {
    console.error(`❌ Failed to create shader module ${label}:`, error);
    throw error;
  }
}

/**
 * Create buffer helper
 */
export function createBuffer(device: GPUDevice, {
  label = 'Buffer',
  size,
  usage,
  mappedAtCreation = false,
}: CreateBufferOptions): GPUBuffer {
  return device.createBuffer({
    label,
    size,
    usage,
    mappedAtCreation,
  });
}

/**
 * Write data to buffer
 */
export function writeBuffer(device: GPUDevice, buffer: GPUBuffer, data: ArrayBuffer | ArrayBufferView, offset: number = 0): void {
  if (data instanceof ArrayBuffer) {
    device.queue.writeBuffer(buffer, offset, data);
  } else if (ArrayBuffer.isView(data)) {
    device.queue.writeBuffer(buffer, offset, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  } else {
    console.error('❌ Invalid data type for writeBuffer');
  }
}

/**
 * Create texture helper
 */
export function createTexture(device: GPUDevice, {
  label = 'Texture',
  size,
  format,
  usage,
  dimension = '2d',
  mipLevelCount = 1,
  sampleCount = 1,
}: CreateTextureOptions): GPUTexture {
  return device.createTexture({
    label,
    size,
    format,
    usage,
    dimension,
    mipLevelCount,
    sampleCount,
  });
}

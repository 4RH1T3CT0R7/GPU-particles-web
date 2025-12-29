/**
 * WebGPU Device Initialization and Management
 */

export async function initWebGPU(canvas) {
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
    const requiredFeatures = [];
    const optionalFeatures = ['timestamp-query', 'indirect-first-instance'];
    const supportedFeatures = [];

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
    device.lost.then((info) => {
      console.error('❌ WebGPU device lost:', info.message);
      if (info.reason !== 'destroyed') {
        console.error('  Device lost reason:', info.reason);
      }
    });

    // Handle uncaptured errors
    device.addEventListener('uncapturederror', (event) => {
      console.error('❌ WebGPU uncaptured error:', event.error);
    });

    // Configure canvas context
    const context = canvas.getContext('webgpu');
    if (!context) {
      console.error('❌ Failed to get WebGPU context');
      return null;
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    console.log('✓ Canvas context configured');
    console.log('  Canvas format:', canvasFormat);

    // Create presentation info
    const presentationInfo = {
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
export function resizeWebGPU(gpuContext, width, height) {
  const { canvas, presentation } = gpuContext;

  canvas.width = width;
  canvas.height = height;

  presentation.size.width = width;
  presentation.size.height = height;

  console.log(`✓ WebGPU canvas resized: ${width}x${height}`);
}

/**
 * Create shader module helper
 */
export function createShaderModule(device, code, label = 'Shader') {
  try {
    const module = device.createShaderModule({
      label,
      code,
    });

    // Get compilation info
    module.getCompilationInfo().then((info) => {
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
export function createBuffer(device, {
  label = 'Buffer',
  size,
  usage,
  mappedAtCreation = false,
}) {
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
export function writeBuffer(device, buffer, data, offset = 0) {
  if (data instanceof ArrayBuffer) {
    device.queue.writeBuffer(buffer, offset, data);
  } else if (ArrayBuffer.isView(data)) {
    device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
  } else {
    console.error('❌ Invalid data type for writeBuffer');
  }
}

/**
 * Create texture helper
 */
export function createTexture(device, {
  label = 'Texture',
  size,
  format,
  usage,
  dimension = '2d',
  mipLevelCount = 1,
  sampleCount = 1,
}) {
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

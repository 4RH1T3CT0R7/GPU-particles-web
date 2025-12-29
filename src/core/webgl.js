/**
 * WebGL2 initialization and context setup
 */

export function initWebGL() {
  const canvas = document.getElementById('gl');
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });

  if (!gl) {
    alert('WebGL2 not supported');
    return null;
  }
  console.log('✓ WebGL2 инициализирован');

  // Extensions (ensure float color attachments are supported)
  const extColorFloat = gl.getExtension('EXT_color_buffer_float');
  if (!extColorFloat) {
    alert('EXT_color_buffer_float not supported');
    return null;
  }

  // GPU limits (avoid creating buffers larger than the hardware can handle)
  const MAX_TEX_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const MAX_RB_SIZE = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const MAX_RT_SIZE = Math.min(MAX_TEX_SIZE, MAX_RB_SIZE);
  const MAX_VIEWPORT = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

  return {
    canvas,
    gl,
    limits: {
      MAX_TEX_SIZE,
      MAX_RB_SIZE,
      MAX_RT_SIZE,
      MAX_VIEWPORT
    }
  };
}

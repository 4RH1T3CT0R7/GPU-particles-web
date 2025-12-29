/**
 * Rendering pipeline
 */

import { createTex, createFBO } from '../core/utils.js';

export function createRenderPipeline(gl) {
  let renderTex = null;
  let renderFBO = null;
  let renderW = 1;
  let renderH = 1;

  const makeRenderTarget = (w, h) => {
    return createTex(gl, w, h, {
      internalFormat: gl.RGBA8,
      srcFormat: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.LINEAR,
      mag: gl.LINEAR
    });
  };

  const resize = (width, height) => {
    if (renderW === width && renderH === height) return;

    renderW = width;
    renderH = height;

    if (renderTex) gl.deleteTexture(renderTex);
    if (renderFBO) gl.deleteFramebuffer(renderFBO);

    renderTex = makeRenderTarget(width, height);
    renderFBO = createFBO(gl, [renderTex]);

    console.log(`✓ Render target resized: ${width}x${height}`);
  };

  const getRenderTarget = () => ({
    tex: renderTex,
    fbo: renderFBO,
    width: renderW,
    height: renderH
  });

  return {
    resize,
    getRenderTarget,
    get width() { return renderW; },
    get height() { return renderH; }
  };
}

export function createColorManager() {
  const MAX_COLOR_STOPS = 6;
  let colorStopCount = 3;
  const colorStops = new Float32Array(MAX_COLOR_STOPS * 3);
  const colorStopsBase = new Float32Array(MAX_COLOR_STOPS * 3);
  let currentPaletteIndex = 0;

  const rebuildColorStops = (palette) => {
    const wobble = Math.random() * Math.PI * 2;
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const t = colorStopCount <= 1 ? 0 : Math.min(1, i / (colorStopCount - 1));
      const vibrato = 0.9 + 0.12 * Math.sin(wobble + t * 4.1 + i * 0.3);
      colorStopsBase[i * 3 + 0] = (palette.a[0] * (1 - t) + palette.b[0] * t) * vibrato;
      colorStopsBase[i * 3 + 1] = (palette.a[1] * (1 - t) + palette.b[1] * t) * vibrato;
      colorStopsBase[i * 3 + 2] = (palette.a[2] * (1 - t) + palette.b[2] * t) * vibrato;
    }
  };

  const animateColorStops = (time) => {
    const breathe = 0.86 + 0.16 * Math.sin(time * 0.4);
    const shift = Math.sin(time * 0.2) * 0.08;
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const idx = i * 3;
      colorStops[idx + 0] = colorStopsBase[idx + 0] * breathe + shift;
      colorStops[idx + 1] = colorStopsBase[idx + 1] * breathe - shift * 0.5;
      colorStops[idx + 2] = colorStopsBase[idx + 2] * breathe + shift * 0.3;
    }
  };

  return {
    get colorStops() { return colorStops; },
    get colorStopCount() { return colorStopCount; },
    set colorStopCount(val) { colorStopCount = val; },
    get currentPaletteIndex() { return currentPaletteIndex; },
    set currentPaletteIndex(val) { currentPaletteIndex = val; },
    rebuildColorStops,
    animateColorStops
  };
}

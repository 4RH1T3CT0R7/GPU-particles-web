/**
 * Rendering pipeline
 */

import { createTex, createFBO } from '../core/utils.ts';
import type { RenderTarget, BloomTargets, RenderPipeline, ColorManager, ColorPalette } from '../types.ts';

export function createRenderPipeline(gl: WebGL2RenderingContext): RenderPipeline {
  let renderTex: WebGLTexture | null = null;
  let renderFBO: WebGLFramebuffer | null = null;
  let renderW: number = 1;
  let renderH: number = 1;

  // Bloom at quarter resolution (2-pass separable)
  let bloomTexA: WebGLTexture | null = null; // horizontal pass output
  let bloomTexB: WebGLTexture | null = null; // vertical pass output (final bloom)
  let bloomFBO_A: WebGLFramebuffer | null = null;
  let bloomFBO_B: WebGLFramebuffer | null = null;
  let bloomW: number = 1;
  let bloomH: number = 1;

  const makeRenderTarget = (w: number, h: number): WebGLTexture | null => {
    // HDR render target with RGBA16F for PBR values > 1.0
    return createTex(gl, w, h, {
      internalFormat: gl.RGBA16F,
      srcFormat: gl.RGBA,
      type: gl.HALF_FLOAT,
      min: gl.LINEAR,
      mag: gl.LINEAR
    });
  };

  const resize = (width: number, height: number): void => {
    if (renderW === width && renderH === height) return;

    renderW = width;
    renderH = height;

    if (renderTex) gl.deleteTexture(renderTex);
    if (renderFBO) gl.deleteFramebuffer(renderFBO);

    renderTex = makeRenderTarget(width, height);
    renderFBO = createFBO(gl, [renderTex!]);

    // Quarter-res bloom targets
    bloomW = Math.max(1, width >> 2);
    bloomH = Math.max(1, height >> 2);
    if (bloomTexA) gl.deleteTexture(bloomTexA);
    if (bloomTexB) gl.deleteTexture(bloomTexB);
    if (bloomFBO_A) gl.deleteFramebuffer(bloomFBO_A);
    if (bloomFBO_B) gl.deleteFramebuffer(bloomFBO_B);

    bloomTexA = makeRenderTarget(bloomW, bloomH);
    bloomTexB = makeRenderTarget(bloomW, bloomH);
    bloomFBO_A = createFBO(gl, [bloomTexA!]);
    bloomFBO_B = createFBO(gl, [bloomTexB!]);

    console.log(`✓ Render target resized: ${width}x${height} (bloom: ${bloomW}x${bloomH})`);
  };

  const getRenderTarget = (): RenderTarget => ({
    tex: renderTex!,
    fbo: renderFBO!,
    width: renderW,
    height: renderH
  });

  const getBloomTargets = (): BloomTargets => ({
    texA: bloomTexA!,
    texB: bloomTexB!,
    fboA: bloomFBO_A!,
    fboB: bloomFBO_B!,
    width: bloomW,
    height: bloomH
  });

  return {
    resize,
    getRenderTarget,
    getBloomTargets,
    get width(): number { return renderW; },
    get height(): number { return renderH; }
  };
}

export function createColorManager(): ColorManager {
  const MAX_COLOR_STOPS: number = 6;
  let colorStopCount: number = 3;
  const colorStops: Float32Array = new Float32Array(MAX_COLOR_STOPS * 3);
  const colorStopsBase: Float32Array = new Float32Array(MAX_COLOR_STOPS * 3);
  let currentPaletteIndex: number = 0;

  const rebuildColorStops = (palette: ColorPalette): void => {
    const wobble: number = Math.random() * Math.PI * 2;
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const t: number = colorStopCount <= 1 ? 0 : Math.min(1, i / (colorStopCount - 1));
      const vibrato: number = 0.9 + 0.12 * Math.sin(wobble + t * 4.1 + i * 0.3);
      colorStopsBase[i * 3 + 0] = (palette.a[0] * (1 - t) + palette.b[0] * t) * vibrato;
      colorStopsBase[i * 3 + 1] = (palette.a[1] * (1 - t) + palette.b[1] * t) * vibrato;
      colorStopsBase[i * 3 + 2] = (palette.a[2] * (1 - t) + palette.b[2] * t) * vibrato;
    }
  };

  const animateColorStops = (time: number): void => {
    const breathe: number = 0.86 + 0.16 * Math.sin(time * 0.4);
    const shift: number = Math.sin(time * 0.2) * 0.08;
    for (let i = 0; i < MAX_COLOR_STOPS; i++) {
      const idx: number = i * 3;
      colorStops[idx + 0] = colorStopsBase[idx + 0] * breathe + shift;
      colorStops[idx + 1] = colorStopsBase[idx + 1] * breathe - shift * 0.5;
      colorStops[idx + 2] = colorStopsBase[idx + 2] * breathe + shift * 0.3;
    }
  };

  return {
    get colorStops(): Float32Array { return colorStops; },
    get colorStopCount(): number { return colorStopCount; },
    set colorStopCount(val: number) { colorStopCount = val; },
    get currentPaletteIndex(): number { return currentPaletteIndex; },
    set currentPaletteIndex(val: number) { currentPaletteIndex = val; },
    rebuildColorStops,
    animateColorStops
  };
}

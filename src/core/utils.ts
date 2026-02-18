/**
 * WebGL utility functions
 */

export interface TexOptions {
  internalFormat?: GLenum;
  srcFormat?: GLenum;
  type?: GLenum;
  min?: GLenum;
  mag?: GLenum;
  wrapS?: GLenum;
  wrapT?: GLenum;
  data?: ArrayBufferView | null;
}

export function compile(gl: WebGL2RenderingContext, type: GLenum, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('Failed to create shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log + '\n--- SOURCE ---\n' + src);
  }
  return sh;
}

export function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  xfbVaryings?: string[],
): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('Failed to create program');
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (xfbVaryings) gl.transformFeedbackVaryings(prog, xfbVaryings, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(prog);
  // Detach and delete shaders after linking (prevent leak)
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(log ?? '');
  }
  return prog;
}

export function createTex(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  opts: TexOptions = {},
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const {
    internalFormat = gl.RGBA32F,
    srcFormat = gl.RGBA,
    type = gl.FLOAT,
    min = gl.NEAREST,
    mag = gl.NEAREST,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
    data = null,
  } = opts;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, srcFormat, type, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function createFBO(
  gl: WebGL2RenderingContext,
  attachments: WebGLTexture[],
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('Failed to create framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const bufs: GLenum[] = [];
  attachments.forEach((tex: WebGLTexture, i: number) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  gl.drawBuffers(bufs);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('FBO incomplete: ' + status.toString(16));
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

export function createQuadVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Failed to create vertex array');
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // full-screen triangle strip (2 triangles)
  const verts = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export function drawQuad(gl: WebGL2RenderingContext, quadVAO: WebGLVertexArrayObject): void {
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

export function bindTex(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  name: string,
  tex: WebGLTexture,
  unit: number,
  target: GLenum = gl.TEXTURE_2D,
): void {
  const loc = gl.getUniformLocation(prog, name);
  if (loc) {
    gl.uniform1i(loc, unit);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
  }
}

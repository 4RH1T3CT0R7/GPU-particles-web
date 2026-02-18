/**
 * Camera controls and matrix math
 */

import { CAMERA_DIST_DEFAULT } from '../config/physics.ts';
import type { Camera } from '../types.ts';

export function createCamera(): Camera {
  return {
    eye: [0, 0, CAMERA_DIST_DEFAULT],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: 50,
    aspect: 1,
    near: 0.1,
    far: 100,
    viewMat: new Float32Array(16),
    projMat: new Float32Array(16),
    angle: { x: 0.5, y: 0.5 },
    distance: CAMERA_DIST_DEFAULT,
    targetDistance: CAMERA_DIST_DEFAULT,
    _dirty: true,
    _prevAngleX: NaN, _prevAngleY: NaN,
    _prevDistance: NaN, _prevAspect: NaN,
  };
}

export function mat4perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  return out;
}

export function mat4lookAt(out: Float32Array, eye: number[], target: number[], up: number[]): Float32Array {
  const z0 = eye[0] - target[0], z1 = eye[1] - target[1], z2 = eye[2] - target[2];
  let len = 1 / Math.hypot(z0, z1, z2);
  const zx = z0 * len, zy = z1 * len, zz = z2 * len;

  const x0 = up[1] * zz - up[2] * zy;
  const x1 = up[2] * zx - up[0] * zz;
  const x2 = up[0] * zy - up[1] * zx;
  len = Math.hypot(x0, x1, x2);
  const xx = (len ? x0 / len : 0), xy = (len ? x1 / len : 0), xz = (len ? x2 / len : 0);

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export function updateCameraMatrix(camera: Camera): void {
  if (camera.angle.x === camera._prevAngleX &&
      camera.angle.y === camera._prevAngleY &&
      camera.distance === camera._prevDistance &&
      camera.aspect === camera._prevAspect) {
    return;
  }

  camera._prevAngleX = camera.angle.x;
  camera._prevAngleY = camera.angle.y;
  camera._prevDistance = camera.distance;
  camera._prevAspect = camera.aspect;

  const cx = Math.cos(camera.angle.x);
  const sx = Math.sin(camera.angle.x);
  const cy = Math.cos(camera.angle.y);
  const sy = Math.sin(camera.angle.y);

  camera.eye[0] = sy * cx * camera.distance;
  camera.eye[1] = sx * camera.distance;
  camera.eye[2] = cy * cx * camera.distance;

  mat4lookAt(camera.viewMat, camera.eye, camera.target, camera.up);
  mat4perspective(camera.projMat, camera.fov * Math.PI / 180, camera.aspect, camera.near, camera.far);
}

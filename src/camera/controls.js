/**
 * Camera controls and matrix math
 */

export function createCamera() {
  const camera = {
    eye: [0, 0, 3.5],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: 50,
    aspect: 1,
    near: 0.1,
    far: 100,
    viewMat: new Float32Array(16),
    projMat: new Float32Array(16)
  };

  return camera;
}

export function mat4perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

export function mat4lookAt(eye, target, up) {
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

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1
  ]);
}

export function updateCameraMatrix(camera) {
  // Update camera position based on angles and distance
  const cx = Math.cos(camera.angle.x);
  const sx = Math.sin(camera.angle.x);
  const cy = Math.cos(camera.angle.y);
  const sy = Math.sin(camera.angle.y);

  camera.eye[0] = sy * cx * camera.distance;
  camera.eye[1] = sx * camera.distance;
  camera.eye[2] = cy * cx * camera.distance;

  camera.viewMat = mat4lookAt(camera.eye, camera.target, camera.up);
  camera.projMat = mat4perspective(camera.fov * Math.PI / 180, camera.aspect, camera.near, camera.far);
}

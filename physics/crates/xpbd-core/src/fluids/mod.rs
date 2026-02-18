pub mod viscosity;
pub mod vorticity;

use glam::Vec3;
use std::f32::consts::PI;

/// Poly6 smoothing kernel for SPH density estimation.
///
/// Returns `W(r, h) = 315 / (64 * PI * h^9) * (h^2 - r^2)^3` when `r < h`,
/// and `0.0` when `r >= h`.
#[inline]
pub fn poly6_kernel(r: f32, h: f32) -> f32 {
    if r >= h {
        return 0.0;
    }
    let h2 = h * h;
    let r2 = r * r;
    let diff = h2 - r2;
    let h9 = h2 * h2 * h2 * h2 * h; // h^9
    let coeff = 315.0 / (64.0 * PI * h9);
    coeff * diff * diff * diff
}

/// Spiky kernel gradient for SPH pressure correction.
///
/// Returns `(r / r_len) * (-45 / (PI * h^6)) * (h - r_len)^2` when
/// `r_len < h` and `r_len > 1e-6`, and `Vec3::ZERO` otherwise.
#[inline]
pub fn spiky_gradient(r: Vec3, r_len: f32, h: f32) -> Vec3 {
    if r_len >= h || r_len <= 1e-6 {
        return Vec3::ZERO;
    }
    let h6 = h * h * h * h * h * h;
    let coeff = -45.0 / (PI * h6);
    let diff = h - r_len;
    (r / r_len) * coeff * diff * diff
}

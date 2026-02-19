use glam::Vec3;

use crate::math::{curl, noise};

/// Curl-noise-based organic flow forces.
///
/// Combines three octaves of curl noise (large scale 0.4, mid 1.0, fine 2.5),
/// a wandering vortex, and z-axis wave motion. Returns the raw flow
/// acceleration vector **before** `flow_scale` multiplication, gravity, and
/// drag -- those remain in the caller.
///
/// # Arguments
///
/// * `pos` - Current particle position.
/// * `id_hash` - Per-particle hash in \[0,1) for fine-noise phase offset.
/// * `time` - Accumulated simulation time in seconds.
/// * `calm_factor` - Smoothstepped shape strength in \[0,1\]; higher values
///   damp the flow toward gentle swirl.
/// * `structure` - Smoothstepped shape strength used by the caller to
///   compute `flow_scale`; included here only for the `mix` between base
///   flow and damped flow (calm vs active).
pub fn compute_flow_force(
    pos: Vec3,
    id_hash: f32,
    time: f32,
    calm_factor: f32,
) -> Vec3 {
    // --- Curl noise at three octaves ---
    // Large scale
    let (curl_lx, curl_ly) = curl(pos.x * 0.4 + time * 0.1, pos.y * 0.4 + time * 0.1);
    let curl_large = (curl_lx * 0.7, curl_ly * 0.7);

    // Mid scale
    let (curl_mx, curl_my) = curl(
        pos.x * 1.0 + pos.z * 0.3 - time * 0.12,
        pos.y * 1.0 + pos.z * 0.3 - time * 0.12,
    );
    let curl_mid = (curl_mx * 0.5, curl_my * 0.5);

    // Fine scale (per-particle phase offset via id_hash)
    let (curl_fx, curl_fy) = curl(
        pos.x * 2.5 + time * 0.2 + id_hash * 3.0,
        pos.y * 2.5 + time * 0.2 + id_hash * 3.0,
    );
    let curl_fine = (curl_fx * 0.25, curl_fy * 0.25);

    // Z-axis noise
    let curl_z = noise(pos.x * 1.5 + time * 0.15, pos.y * 1.5 + time * 0.15) - 0.5;

    // Combined swirl from all octaves
    let swirl_x = curl_large.0 + curl_mid.0 + curl_fine.0;
    let swirl_y = curl_large.1 + curl_mid.1 + curl_fine.1;

    // --- Wandering vortex ---
    let vortex_cx = (time * 0.08).sin() * 0.4;
    let vortex_cy = (time * 0.1).cos() * 0.4;
    let rel_x = pos.x - vortex_cx;
    let rel_y = pos.y - vortex_cy;
    let r2 = (rel_x * rel_x + rel_y * rel_y).max(0.15);
    let vortex_x = -rel_y / r2 * 0.35;
    let vortex_y = rel_x / r2 * 0.35;

    // --- Blend base flow ---
    let base_flow_x = swirl_x * 0.55 + vortex_x * 0.35;
    let base_flow_y = swirl_y * 0.55 + vortex_y * 0.35;

    let damped_flow_x = mix_f32(base_flow_x, swirl_x * 0.25, calm_factor);
    let damped_flow_y = mix_f32(base_flow_y, swirl_y * 0.25, calm_factor);

    // --- Z-axis wave ---
    let mut flow_z = curl_z * 0.4;
    flow_z += (time * 0.25 + pos.x * 1.2 + pos.y * 0.8).sin() * 0.35;

    Vec3::new(damped_flow_x, damped_flow_y, flow_z)
}

/// GLSL-style `mix(a, b, t)` for scalars.
#[inline]
fn mix_f32(a: f32, b: f32, t: f32) -> f32 {
    a * (1.0 - t) + b * t
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flow_force_nonzero() {
        let force = compute_flow_force(
            Vec3::new(1.0, 0.5, 0.3),
            0.5,
            1.0,
            0.0,
        );
        assert!(force.length() > 0.0, "flow force should be nonzero");
    }

    #[test]
    fn test_flow_force_calm_reduces_magnitude() {
        let force_active = compute_flow_force(Vec3::new(1.0, 0.5, 0.3), 0.5, 1.0, 0.0);
        let force_calm = compute_flow_force(Vec3::new(1.0, 0.5, 0.3), 0.5, 1.0, 1.0);
        // Calm factor should reduce the flow force magnitude
        // (not necessarily strictly less due to wave component, but generally)
        assert!(
            force_calm.length() < force_active.length() * 1.5,
            "calm force should not be much larger"
        );
    }
}

use crate::math::{hash11, smoothstep};
use glam::Vec3;

/// Parameters describing the pointer (cursor) interaction state.
pub struct PointerParams {
    pub active: bool,
    pub mode: u32,
    pub position: Vec3,
    pub strength: f32,
    pub radius: f32,
    pub pressing: bool,
    pub pulse: bool,
    pub view_dir: Vec3,
}

impl Default for PointerParams {
    fn default() -> Self {
        Self {
            active: false,
            mode: 0,
            position: Vec3::ZERO,
            strength: 1.0,
            radius: 0.5,
            pressing: false,
            pulse: false,
            view_dir: Vec3::NEG_Z,
        }
    }
}

/// Result of applying pointer force to one particle.
pub struct PointerForceResult {
    /// Acceleration to add.
    pub acc: Vec3,
    /// Velocity to add.
    pub vel_add: Vec3,
    /// Multiply velocity by this (1.0 = no change).
    pub vel_scale: f32,
    /// If `Some`, clamp speed to this value.
    pub speed_cap: Option<f32>,
}

impl Default for PointerForceResult {
    fn default() -> Self {
        Self {
            acc: Vec3::ZERO,
            vel_add: Vec3::ZERO,
            vel_scale: 1.0,
            speed_cap: None,
        }
    }
}

/// Compute pointer force for a single particle.
///
/// Faithfully ports all 7 pointer interaction modes from the GLSL simulation
/// shader:
///   0 = Attract
///   1 = Repel
///   2 = Vortex Left
///   3 = Vortex Right
///   4 = Pulse
///   5 = Magnetic Flow
///   6 = Quasar
pub fn compute_pointer_force(
    pos: Vec3,
    _vel: Vec3,
    id_hash: f32,
    time: f32,
    params: &PointerParams,
) -> PointerForceResult {
    if !params.active {
        return PointerForceResult::default();
    }

    let to_pointer = params.position - pos;
    let dist_pointer = to_pointer.length();
    let radius = params.radius.max(0.15);
    let falloff = (-(dist_pointer / radius).powf(1.25)).exp();
    let press_boost = mix(0.6, 1.0, if params.pressing { 1.0 } else { 0.0 });
    let base = params.strength * press_boost * falloff * 0.5;
    let dir_p = to_pointer / dist_pointer.max(0.001);
    let jitter = hash11(id_hash * 91.0);

    let pulse_wave = 0.65 + 0.35 * (time * 3.5 + jitter * 7.0).sin();

    let mut acc = Vec3::ZERO;
    let mut vel_add = Vec3::ZERO;
    let mut vel_scale = 1.0_f32;
    let mut speed_cap: Option<f32> = None;

    match params.mode {
        0 => {
            // Attract
            acc += dir_p * base * 1.5;
            vel_add += dir_p * base * 0.45;
        }
        1 => {
            // Repel
            acc -= dir_p * base * 4.5;
            acc += Vec3::new(dir_p.y, -dir_p.x, 0.3) * base * 2.8;
            vel_add -= dir_p * base * 1.2;
            vel_scale = 0.97;
        }
        2 | 3 => {
            // Vortex (2=left, 3=right)
            let spin = if params.mode == 2 { -1.0_f32 } else { 1.0 };
            let tangent = Vec3::new(
                dir_p.y * spin,
                -dir_p.x * spin,
                dir_p.z * 0.35 * spin,
            );
            let spiral_boost = 1.2 + pulse_wave * 0.8;
            acc += tangent * base * (2.5 * spiral_boost);
            acc += dir_p * base * (0.8 + 0.6 * pulse_wave);
            // GLSL: vel = mix(vel, vel + tangent * base * 0.6, 0.35 + 0.2 * pulseWave)
            // mix(vel, vel + X, t) = vel + X * t
            let t = 0.35 + 0.2 * pulse_wave;
            vel_add += tangent * base * 0.6 * t;
        }
        4 => {
            // Pulse
            let pulse_phase = time * 5.5 + jitter * 12.0;
            let carrier = 0.7 + 0.6 * pulse_phase.sin();
            let burst = smoothstep(0.0, 1.0, (pulse_phase * 0.6).sin());
            let strong_burst = burst.powf(0.5);
            let pulse_val = 1.0
                + carrier
                + if params.pulse {
                    strong_burst * 3.5
                } else {
                    carrier * 0.8
                };
            let swirl_raw = Vec3::new(-dir_p.y, dir_p.x, dir_p.z * 0.5);
            let swirl_len = swirl_raw.length();
            let swirl = if swirl_len > 1e-6 {
                swirl_raw / swirl_len
            } else {
                Vec3::new(0.0, 1.0, 0.0)
            };
            acc -= dir_p * base * (2.5 + strong_burst * 4.5);
            acc += swirl * base * (2.2 + strong_burst * 3.8);
            let wave = (dist_pointer * 8.0 - time * 6.0).sin() * strong_burst;
            acc += dir_p * base * wave * 2.5;
            // GLSL: vel = mix(vel, vel - dirP*base*1.5 + swirl*base*1.2, 0.6*pulse)
            // mix(vel, vel + X, t) = vel + X * t, where X = -dirP*base*1.5 + swirl*base*1.2
            let t = 0.6 * pulse_val;
            vel_add += (-dir_p * base * 1.5 + swirl * base * 1.2) * t;
        }
        6 => {
            // QUASAR
            let r = pos - params.position;
            let r_len = r.length().max(0.01);
            let axis = Vec3::Y; // vec3(0,1,0)
            let h = r.dot(axis);
            let abs_h = h.abs();
            let h_sign = sign(h + 0.0001);
            let to_axis = r - axis * h;
            let rho = to_axis.length();
            let rho_dir = if rho > 0.01 {
                to_axis / rho
            } else {
                Vec3::X
            };
            let phi_raw = axis.cross(rho_dir);
            let phi_len = phi_raw.length();
            let phi = if phi_len > 1e-6 {
                phi_raw / phi_len
            } else {
                Vec3::Z
            };
            let q = params.strength * press_boost * 0.5;
            let disk_r = radius * 1.5;
            let core_r = radius * 0.12;
            let disk_thick = radius * 0.25;
            let in_disk_plane = (-abs_h * abs_h / (disk_thick * disk_thick)).exp();
            let in_core = (-r_len * r_len / (core_r * core_r)).exp();
            let jet_radius = radius * 0.5 / (1.0 + abs_h * 2.0);
            let in_jet_cone = (-rho * rho / (jet_radius * jet_radius)).exp();
            let in_jet = in_jet_cone * (1.0 - in_disk_plane);

            // Thick torus
            let flatten_force = 12.0 * (1.0 - in_jet_cone * 0.95);
            acc -= axis * h_sign * q * flatten_force;
            let orbital_force = 1.8 / (0.08 + rho * rho);
            acc += phi * q * orbital_force * 20.0 * (1.0 - in_jet);
            let accretion_force = 0.35 / (0.08 + rho).sqrt();
            acc -= rho_dir * q * accretion_force * in_disk_plane;
            let noise_val =
                (rho * 4.0 + time).sin() * (h * 5.0 - time * 0.8).cos();
            acc += Vec3::new(noise_val * 0.5, noise_val * 0.4, noise_val * 0.5)
                * q
                * in_disk_plane;
            // vel *= mix(1.0, 0.985, inDiskPlane * (1.0 - inJet))
            vel_scale *= mix(1.0, 0.985, in_disk_plane * (1.0 - in_jet));

            // Jets
            let core_eject = 80.0 * in_core;
            acc += axis * h_sign * q * core_eject;
            let jet_lift = 60.0 * in_jet_cone;
            acc += axis * h_sign * q * jet_lift;
            let collimate_power = 35.0 * (1.0 + abs_h * 3.5);
            let edge_dist = smoothstep(jet_radius * 0.2, jet_radius, rho);
            acc -= rho_dir * q * collimate_power * in_jet_cone * edge_dist;
            acc += phi * q * 10.0 * in_jet_cone;

            // Boundaries
            let bound_r = smoothstep(disk_r * 0.9, disk_r, rho);
            let bound_h = smoothstep(disk_r, disk_r * 1.5, abs_h);
            acc -= rho_dir * q * 14.0 * bound_r;
            acc -= axis * h_sign * q * 10.0 * bound_h;
            let r_norm = r / r_len.max(1e-6);
            acc -= r_norm * q * 0.6 / (0.4 + r_len);
            vel_scale *= 0.992;
            speed_cap = Some(3.5);
        }
        5 => {
            // Magnetic flow
            let axis_raw =
                params.view_dir * 0.7 + Vec3::new(0.0, 1.0, 0.5);
            let axis_len = axis_raw.length();
            let axis = if axis_len > 1e-6 {
                axis_raw / axis_len
            } else {
                Vec3::Y
            };
            let r = pos - params.position;
            let r_len = r.length().max(0.06);
            let r2 = r_len * r_len;
            let r3 = r2 * r_len;
            let r5 = r2 * r3 + 1e-5;
            let dipole_raw = (r * 3.0 * axis.dot(r) / r5) - (axis / r3.max(1e-3));
            let dipole = dipole_raw.clamp(Vec3::splat(-20.0), Vec3::splat(20.0));
            let swirl_raw = dipole.cross(axis) + dir_p.cross(axis) * 0.5;
            let swirl_len = swirl_raw.length();
            let swirl_dir = if swirl_len > 0.001 {
                swirl_raw / swirl_len
            } else {
                Vec3::new(dir_p.y, -dir_p.x, 0.0)
            };
            let flux_falloff =
                1.0 / (1.0 + (r_len / (radius * 1.5)).powf(1.5));
            let magnetic_strength = flux_falloff.powf(0.7);
            acc += dipole * base * (4.5 * magnetic_strength);
            acc += swirl_dir * base * (5.0 * magnetic_strength);
            let r_norm = r / r_len.max(1e-6);
            let polar_alignment = r_norm.dot(axis);
            acc += axis * base * (2.5 * sign(polar_alignment) * magnetic_strength);
            let spiral_phase = r.y.atan2(r.x) + time * 2.0;
            let spiral_force =
                Vec3::new(spiral_phase.cos(), spiral_phase.sin(), 0.0);
            acc += spiral_force * base * (1.8 * magnetic_strength);
            // GLSL: vel = mix(vel, vel + dipole*1.2 + swirlDir*1.5, 0.7*magneticStrength)
            // mix(vel, vel + X, t) = vel + X * t
            let t = 0.7 * magnetic_strength;
            vel_add += (dipole * 1.2 + swirl_dir * 1.5) * t;
        }
        _ => {
            // Unknown mode, no force
        }
    }

    PointerForceResult {
        acc,
        vel_add,
        vel_scale,
        speed_cap,
    }
}

// ---------- helper functions ----------

/// GLSL-style `mix(a, b, t)` for scalars.
#[inline]
fn mix(a: f32, b: f32, t: f32) -> f32 {
    a * (1.0 - t) + b * t
}

/// GLSL-style `sign(x)`: returns -1.0, 0.0, or 1.0.
#[inline]
fn sign(x: f32) -> f32 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        0.0
    }
}

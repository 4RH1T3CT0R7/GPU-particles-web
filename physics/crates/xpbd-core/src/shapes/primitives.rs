//! Primitive 3D and 2D shape generators ported from GLSL (`shapes-primitives.ts`).
//!
//! Each 3D generator takes parameters `(t, s)` in `[0, 1]` and returns a `Vec3`.
//! The 2D generators return `(f32, f32)` and are lifted to 3D by the dispatcher.

use std::f32::consts::TAU;

use glam::Vec3;

use crate::math::{fract, smoothstep};

// ---------- 3D shapes ----------

/// Cube surface. Maps `(t, s)` onto six faces, each 1/6 of the `t` range.
pub fn shape_cube(t: f32, s: f32) -> Vec3 {
    let face = (t * 6.0).floor();
    let u = fract(t * 6.0);
    let v = s;
    let p = if face < 1.0 {
        Vec3::new(u * 2.0 - 1.0, v * 2.0 - 1.0, 1.0)
    } else if face < 2.0 {
        Vec3::new(u * 2.0 - 1.0, v * 2.0 - 1.0, -1.0)
    } else if face < 3.0 {
        Vec3::new(1.0, u * 2.0 - 1.0, v * 2.0 - 1.0)
    } else if face < 4.0 {
        Vec3::new(-1.0, u * 2.0 - 1.0, v * 2.0 - 1.0)
    } else if face < 5.0 {
        Vec3::new(u * 2.0 - 1.0, 1.0, v * 2.0 - 1.0)
    } else {
        Vec3::new(u * 2.0 - 1.0, -1.0, v * 2.0 - 1.0)
    };
    p * 0.6
}

/// Sphere via uniform angular parameterisation.
pub fn shape_sphere(t: f32, s: f32) -> Vec3 {
    let theta = t * TAU;
    let phi = (2.0 * s - 1.0).acos();
    Vec3::new(
        phi.sin() * theta.cos(),
        phi.sin() * theta.sin(),
        phi.cos(),
    ) * 0.7
}

/// Torus with major radius 0.6 and minor radius 0.25.
pub fn shape_torus(t: f32, s: f32) -> Vec3 {
    let big_r = 0.6_f32;
    let small_r = 0.25_f32;
    let theta = t * TAU;
    let phi = s * TAU;
    Vec3::new(
        (big_r + small_r * phi.cos()) * theta.cos(),
        (big_r + small_r * phi.cos()) * theta.sin(),
        small_r * phi.sin(),
    )
}

/// Expanding spiral helix with 5 turns.
pub fn shape_helix(t: f32, s: f32) -> Vec3 {
    let total_turns = 5.0_f32;
    let angle = s * TAU * total_turns;
    let height = (s * 2.0 - 1.0) * 1.4;
    let radius = 0.3 + s * 0.5;
    let wave = 0.08 * (angle * 2.0 + t * TAU).sin();
    Vec3::new(
        (radius + wave) * angle.cos(),
        height,
        (radius + wave) * angle.sin(),
    )
}

/// Regular octahedron via 8 triangular faces.
pub fn shape_octahedron(t: f32, s: f32) -> Vec3 {
    let face = (t * 8.0).floor();
    let u = fract(t * 8.0);
    let v = s;

    let (v0, v1, v2) = if face < 1.0 {
        (Vec3::X, Vec3::Z, Vec3::Y)
    } else if face < 2.0 {
        (Vec3::Z, Vec3::NEG_X, Vec3::Y)
    } else if face < 3.0 {
        (Vec3::NEG_X, Vec3::NEG_Z, Vec3::Y)
    } else if face < 4.0 {
        (Vec3::NEG_Z, Vec3::X, Vec3::Y)
    } else if face < 5.0 {
        (Vec3::X, Vec3::NEG_Z, Vec3::NEG_Y)
    } else if face < 6.0 {
        (Vec3::NEG_Z, Vec3::NEG_X, Vec3::NEG_Y)
    } else if face < 7.0 {
        (Vec3::NEG_X, Vec3::Z, Vec3::NEG_Y)
    } else {
        (Vec3::Z, Vec3::X, Vec3::NEG_Y)
    };

    let sqrt_v = v.sqrt();
    let p = v0 * (1.0 - sqrt_v) + v1.lerp(v2, u) * sqrt_v;
    p.normalize_or_zero() * 0.75
}

/// 3D wave shape.
pub fn shape_wave(t: f32, s: f32) -> Vec3 {
    let x = (t - 0.5) * 2.0;
    let y = (t * TAU * 3.0).sin() * 0.5;
    let z = (t * TAU).cos() * (s - 0.5);
    Vec3::new(x * 0.5, y, z) * 0.7
}

/// Moebius ribbon with half-twist.
pub fn shape_ribbon(t: f32, s: f32) -> Vec3 {
    let angle = t * TAU;

    let strip_width = 0.4_f32;
    let w = (s - 0.5) * strip_width;

    let big_r = 0.8_f32;
    let twist = angle * 0.5;

    let thickness = 0.05_f32;
    let s_local = fract(s * 3.0);
    let layer = (s_local - 0.5) * thickness;

    let base_x = big_r * angle.cos();
    let base_z = big_r * angle.sin();

    let offset_x = w * twist.cos() * angle.cos();
    let offset_y = w * twist.sin();
    let offset_z = w * twist.cos() * angle.sin();

    let thick_x = layer * twist.sin() * angle.cos();
    let thick_y = layer * twist.cos();
    let thick_z = layer * twist.sin() * angle.sin();

    let x = base_x + offset_x + thick_x;
    let mut y = offset_y + thick_y;
    let z = base_z + offset_z + thick_z;

    let wave_amp = 0.03_f32;
    y += (angle * 4.0).sin() * wave_amp * (1.0 - w.abs() / strip_width);

    Vec3::new(x, y, z) * 0.9
}

/// Approximate icosahedron (ring-based parameterisation).
pub fn shape_icosahedron(t: f32, s: f32) -> Vec3 {
    let angle = t * TAU;
    let rings = (s * 5.0).floor();
    // Offset rings by 0.5 so no ring sits at a pole (avoids r=0 collapse)
    let lat = std::f32::consts::PI * (rings + 0.5) / 5.0;
    let r = 0.6 * lat.sin();
    Vec3::new(r * angle.cos(), (s - 0.5) * 1.4, r * angle.sin())
}

// ---------- Audio-reactive equalizer ----------

/// Audio-reactive equalizer bars.
///
/// Creates 16 frequency-distributed bars with wireframe edges and animation.
/// `bass`, `mid`, `treble` are audio energy bands in `[0, 1]`; `time` drives
/// the demo animation when no audio is present.
pub fn shape_equalizer(t: f32, s: f32, bass: f32, mid: f32, treble: f32, time: f32) -> Vec3 {
    let num_bars = 16.0_f32;
    let bar_width = 3.0 / num_bars;
    let gap_ratio = 0.15_f32;

    let x_range = 3.0_f32;

    let bar_index = (t * num_bars).floor();
    let bar_center = (bar_index + 0.5) / num_bars;
    let local_t = fract(t * num_bars);

    let in_bar = smoothstep(0.0, gap_ratio, local_t) * smoothstep(1.0, 1.0 - gap_ratio, local_t);
    let bar_edge = in_bar.sqrt();

    let mut x = (bar_center - 0.5) * x_range;

    let z_range = 1.8_f32;
    let z = (s - 0.5) * z_range;

    let _depth_edge = smoothstep(0.0, 0.1, s) * smoothstep(1.0, 0.9, s);

    let total_energy = bass + mid + treble;
    let has_audio = total_energy > 0.01;

    let demo_wave1 = 0.5 + 0.5 * (time * 2.0 + bar_index * 0.5).sin();
    let demo_wave2 = 0.5 + 0.5 * (time * 2.5 + bar_index * 0.8 + 2.0).sin();
    let demo_wave3 = 0.5 + 0.5 * (time * 3.0 + bar_index * 1.2 + 4.0).sin();

    let use_bass = if has_audio { bass * 3.5 } else { demo_wave1 };
    let use_mid = if has_audio { mid * 3.2 } else { demo_wave2 };
    let use_treble = if has_audio { treble * 2.8 } else { demo_wave3 };

    let norm_bar = bar_index / (num_bars - 1.0);

    let mut bass_zone = smoothstep(0.45, 0.0, norm_bar);
    let mut mid_zone = (1.0 - (norm_bar - 0.5).abs() * 3.0).max(0.0);
    let mut treble_zone = smoothstep(0.55, 1.0, norm_bar);

    let total_zone = bass_zone + mid_zone + treble_zone;
    if total_zone > 0.01 {
        bass_zone /= total_zone;
        mid_zone /= total_zone;
        treble_zone /= total_zone;
    }

    let bar_height = (use_bass * bass_zone + use_mid * mid_zone + use_treble * treble_zone) * 0.85;

    let base_y = -0.9_f32;
    let column_height = bar_height * 2.0;
    let height_factor = s;
    let mut y = base_y + height_factor * column_height;

    let top_concentration = smoothstep(0.6, 1.0, height_factor);

    let x_offset = (local_t - 0.5) * bar_width * 0.9;
    x += x_offset;

    let wobble = (time * 2.0 + bar_index * 1.5).sin() * 0.02 * bar_edge;
    y += wobble;

    let top_pulse = (time * 4.0 + bar_index * 0.8).sin() * 0.05 * top_concentration;
    y += top_pulse;

    Vec3::new(x, y, z)
}

// ---------- 2D shapes ----------

/// Superformula (Johan Gielis). Returns a 2D point on the parametric curve.
pub fn shape_superformula(t: f32, m: f32, n1: f32, n2: f32, n3: f32) -> (f32, f32) {
    let a = 1.0_f32;
    let b = 1.0_f32;
    let r = ((((m * t / 4.0).cos() / a).abs()).powf(n2)
        + (((m * t / 4.0).sin() / b).abs()).powf(n3))
    .powf(-1.0 / n1);
    (r * t.cos(), r * t.sin())
}

/// Rose curve: `r = cos(k * t)`.
pub fn shape_rose(t: f32, k: f32) -> (f32, f32) {
    let r = (k * t).cos();
    (r * t.cos(), r * t.sin())
}

/// Regular polygon with `n` sides (quantised angles).
pub fn shape_polygon(t: f32, n: f32) -> (f32, f32) {
    let a = TAU / n;
    let k = (t / a).floor();
    let ang = (k + 0.5) * a;
    (ang.cos(), ang.sin())
}

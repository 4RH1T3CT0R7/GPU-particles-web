//! Shape dispatcher ported from GLSL (`shapes-dispatcher.ts`).
//!
//! Selects one of 13 shapes by `sid` and returns the target position for a
//! particle identified by `(id_x, id_y)`.

use std::f32::consts::TAU;

use glam::{Mat3, Vec3};

use crate::math::{curl, fract, noise};
use crate::shapes::fractal::fractal_flow;
use crate::shapes::primitives::*;

/// Compute the target position for particle `(id_x, id_y)` on shape `sid`.
///
/// * `sid` -- shape index (0..=12).
/// * `id_x`, `id_y` -- normalised particle UV coordinates.
/// * `time` -- animation time in seconds.
/// * `rot` -- pre-computed rotation matrix (applied to the shape).
/// * `fractal_seed` -- four-component seed forwarded to `fractal_flow`.
/// * `audio_bass`, `audio_mid`, `audio_treble` -- audio energy bands for the equalizer.
pub fn target_for(
    sid: u32,
    id_x: f32,
    id_y: f32,
    time: f32,
    rot: &Mat3,
    fractal_seed: &[f32; 4],
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
) -> Vec3 {
    // Derive pseudo-random s and angle from particle id, matching the GLSL
    let s = fract(id_x + id_y * 1.618 + noise(id_x * 17.0, id_y * 17.0));
    let angle = (id_x + noise(id_x * 3.1, id_y * 3.1)) * TAU;
    let t = angle / TAU; // normalised angle in [0,1)

    match sid {
        0 => {
            // Cube
            *rot * shape_cube(t, s)
        }
        1 => {
            // Sphere
            *rot * shape_sphere(t, s)
        }
        2 => {
            // Torus
            *rot * shape_torus(t, s)
        }
        3 => {
            // Helix
            *rot * shape_helix(t, s)
        }
        4 => {
            // Octahedron
            *rot * shape_octahedron(t, s)
        }
        5 => {
            // Superformula (2D -> 3D)
            let m = 6.0 + 2.0 * (time * 0.2).sin();
            let n1 = 0.3 + 0.2 * (time * 0.13).sin();
            let n2 = 1.7 + 0.7 * (time * 0.17).sin();
            let n3 = 1.7 + 0.7 * (time * 0.11).cos();
            let (px, py) = shape_superformula(angle, m, n1, n2, n3);
            let scale = 0.3 + 0.7 * s.sqrt();
            let pz = (noise(id_x * 9.0, id_y * 9.0) - 0.5) * 0.6;
            *rot * Vec3::new(px * scale, py * scale, pz)
        }
        6 => {
            // Rose (2D -> 3D)
            let k = 5.0 + ((time * 0.15) % 3.0).floor();
            let (px, py) = shape_rose(angle, k);
            let scale = 0.3 + 0.7 * s.sqrt();
            let pz = (noise(id_x * 7.3, id_y * 7.3) - 0.5) * 0.8;
            *rot * Vec3::new(px * scale, py * scale, pz)
        }
        7 => {
            // Wave (note: arguments swapped in GLSL -- shape_wave(s, angle/TAU))
            *rot * shape_wave(s, t)
        }
        8 => {
            // Ribbon
            *rot * shape_ribbon(t, s)
        }
        9 => {
            // Icosahedron
            *rot * shape_icosahedron(t, s)
        }
        10 => {
            // Polygon / star (default in GLSL)
            let n = 5.0 + ((time * 0.2) % 4.0).floor();
            let (px, py) = shape_polygon(angle, n);
            let scale = 0.5 + 0.5 * s.sqrt();
            let pz = (noise(id_x * 4.7, id_y * 4.7) - 0.5) * 0.4;
            *rot * Vec3::new(px * scale, py * scale, pz)
        }
        11 => {
            // Fractal
            let f = fractal_flow(id_x, id_y, time, *fractal_seed);
            let shells = 0.4 + 0.35 * (time * 0.3 + fractal_seed[3]).sin();
            let mut p = *rot * (f * (0.9 + shells));
            let (cx, cy) = curl(
                id_x * 8.5 + fractal_seed[0] * 2.7 + time * 0.2,
                id_y * 8.5 + fractal_seed[1] * 2.7 + time * 0.2,
            );
            p.x += cx * 0.15;
            p.y += cy * 0.15;
            p.z += (angle * 0.6 + fractal_seed[2] + time * 0.2).sin() * 0.18;
            p
        }
        12 => {
            // Equalizer
            shape_equalizer(id_x, id_y, audio_bass, audio_mid, audio_treble, time)
        }
        _ => {
            // Fallback: polygon / star (same as sid == 10)
            let n = 5.0 + ((time * 0.2) % 4.0).floor();
            let (px, py) = shape_polygon(angle, n);
            let scale = 0.5 + 0.5 * s.sqrt();
            let pz = (noise(id_x * 4.7, id_y * 4.7) - 0.5) * 0.4;
            *rot * Vec3::new(px * scale, py * scale, pz)
        }
    }
}

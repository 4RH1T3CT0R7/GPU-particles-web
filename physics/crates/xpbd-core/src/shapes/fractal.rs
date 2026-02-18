//! Fractal flow generator ported from GLSL (`shapes-fractal.ts`).
//!
//! Implements 10 fractal types (Mandelbrot, Julia, Burning Ship, Tricorn,
//! Newton, Phoenix, Multibrot-4, Celtic, Perpendicular Mandelbrot, Buffalo)
//! and maps the escape-time result onto a 3D spiral structure.

use glam::Vec3;

const MAX_ITER: u32 = 48;

/// Compute the fractal flow position for a particle.
///
/// * `id_x`, `id_y` -- normalised particle coordinates in `[0, 1]`.
/// * `time` -- animation time in seconds.
/// * `seed` -- four-component seed: `[zoom_bias, center_x_bias, center_y_bias, type_selector]`.
///
/// The fractal type is determined by `(seed[3] * 10.0) mod 10`.
pub fn fractal_flow(id_x: f32, id_y: f32, time: f32, seed: [f32; 4]) -> Vec3 {
    let px = id_x * 2.0 - 1.0;
    let py = id_y * 2.0 - 1.0;

    let fractal_type = ((seed[3] * 10.0) % 10.0).floor() as i32;
    // Handle negative modulo edge case
    let fractal_type = ((fractal_type % 10) + 10) % 10;

    let zoom = 1.0 + seed[0] * 0.3;
    let center_x = -0.5 + seed[1] * 0.2;
    let center_y = seed[2] * 0.15;

    let mut zx: f32;
    let mut zy: f32;
    let mut smooth_iter: f32 = 0.0;
    let mut escaped = false;
    // `_color_mod` is computed in the Newton branch for potential future colour
    // mapping but is not consumed here -- kept for parity with the GLSL source.
    let mut _color_mod: f32 = 0.0;

    match fractal_type {
        0 => {
            // Mandelbrot
            let cx = px * zoom + center_x;
            let cy = py * zoom + center_y;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx;
                zy = 2.0 * zx * zy + cy;
                zx = new_zx;
                smooth_iter = i as f32;
            }
        }
        1 => {
            // Julia (animated parameter)
            let j_time = time * 0.08;
            let julia_cx = -0.7 + j_time.sin() * 0.25;
            let julia_cy = 0.270_15 + (j_time * 1.3).cos() * 0.12;
            zx = px * zoom * 1.5;
            zy = py * zoom * 1.5;
            let cx = julia_cx;
            let cy = julia_cy;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx;
                zy = 2.0 * zx * zy + cy;
                zx = new_zx;
                smooth_iter = i as f32;
            }
        }
        2 => {
            // Burning Ship
            let cx = px * zoom - 0.5;
            let cy = py * zoom - 0.5;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx;
                zy = 2.0 * (zx * zy).abs() + cy;
                zx = new_zx;
                smooth_iter = i as f32;
            }
        }
        3 => {
            // Tricorn (Mandelbar)
            let cx = px * zoom + center_x;
            let cy = py * zoom + center_y;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx;
                zy = -2.0 * zx * zy + cy;
                zx = new_zx;
                smooth_iter = i as f32;
            }
        }
        4 => {
            // Newton (z^3 - 1)
            _color_mod = 0.0;
            zx = px * zoom * 2.0;
            zy = py * zoom * 2.0;
            for i in 0..MAX_ITER {
                // z^2
                let z2x = zx * zx - zy * zy;
                let z2y = 2.0 * zx * zy;
                // z^3
                let z3x = z2x * zx - z2y * zy;
                let z3y = z2x * zy + z2y * zx;
                // f(z) = z^3 - 1
                let fzx = z3x - 1.0;
                let fzy = z3y;
                // f'(z) = 3 z^2
                let fpzx = 3.0 * z2x;
                let fpzy = 3.0 * z2y;
                let denom = fpzx * fpzx + fpzy * fpzy + 0.0001;
                let ratio_x = (fzx * fpzx + fzy * fpzy) / denom;
                let ratio_y = (fzy * fpzx - fzx * fpzy) / denom;
                zx -= ratio_x;
                zy -= ratio_y;
                // Check convergence to roots
                let d1 = ((zx - 1.0) * (zx - 1.0) + zy * zy).sqrt();
                let d2 = ((zx + 0.5) * (zx + 0.5) + (zy - 0.866) * (zy - 0.866)).sqrt();
                let d3 = ((zx + 0.5) * (zx + 0.5) + (zy + 0.866) * (zy + 0.866)).sqrt();
                let min_dist = d1.min(d2.min(d3));
                if min_dist < 0.01 {
                    smooth_iter = i as f32 + (1.0 - min_dist * 100.0);
                    _color_mod = if d1 < d2 && d1 < d3 {
                        0.0
                    } else if d2 < d3 {
                        0.33
                    } else {
                        0.66
                    };
                    escaped = true;
                    break;
                }
                smooth_iter = i as f32;
            }
        }
        5 => {
            // Phoenix fractal
            let mut z_prev_x = 0.0_f32;
            let mut z_prev_y = 0.0_f32;
            let p_param = -0.5 + (time * 0.1).sin() * 0.2;
            let cx = px * zoom - 0.5;
            let cy = py * zoom;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx + p_param * z_prev_x;
                let new_zy = 2.0 * zx * zy + cy + p_param * z_prev_y;
                z_prev_x = zx;
                z_prev_y = zy;
                zx = new_zx;
                zy = new_zy;
                smooth_iter = i as f32;
            }
        }
        6 => {
            // Multibrot z^4
            let cx = px * zoom * 0.8 + center_x;
            let cy = py * zoom * 0.8 + center_y;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                // z^2
                let z2x = zx * zx - zy * zy;
                let z2y = 2.0 * zx * zy;
                // z^4 = (z^2)^2
                let new_zx = z2x * z2x - z2y * z2y + cx;
                let new_zy = 2.0 * z2x * z2y + cy;
                zx = new_zx;
                zy = new_zy;
                smooth_iter = i as f32;
            }
        }
        7 => {
            // Celtic fractal
            let cx = px * zoom - 0.3;
            let cy = py * zoom;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = (zx * zx - zy * zy).abs() + cx;
                let new_zy = 2.0 * zx * zy + cy;
                zx = new_zx;
                zy = new_zy;
                smooth_iter = i as f32;
            }
        }
        8 => {
            // Perpendicular Mandelbrot
            let cx = px * zoom + center_x;
            let cy = py * zoom + center_y;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = zx * zx - zy * zy + cx;
                let new_zy = -2.0 * zx.abs() * zy + cy;
                zx = new_zx;
                zy = new_zy;
                smooth_iter = i as f32;
            }
        }
        _ => {
            // Buffalo fractal (type 9 and fallback)
            let cx = px * zoom - 0.4;
            let cy = py * zoom - 0.3;
            zx = 0.0;
            zy = 0.0;
            for i in 0..MAX_ITER {
                let z_len = zx * zx + zy * zy;
                if z_len > 4.0 {
                    smooth_iter =
                        i as f32 - (z_len.ln() / 4.0_f32.ln()).log2();
                    escaped = true;
                    break;
                }
                let new_zx = (zx * zx - zy * zy).abs() - (2.0 * zx * zy).abs() + cx;
                let new_zy = (2.0 * zx * zy).abs() + cy;
                zx = new_zx;
                zy = new_zy;
                smooth_iter = i as f32;
            }
        }
    }

    // Normalise
    let max_iter_f = MAX_ITER as f32;
    let mut fractal_val = (smooth_iter / max_iter_f).clamp(0.0, 1.0);

    // Interior points
    if !escaped {
        let z_len = (zx * zx + zy * zy).sqrt();
        fractal_val = 0.5 + 0.5 * (z_len * 10.0 + time).sin();
    }

    // 3D spiral structure
    let base_angle = py.atan2(px);
    let dist = (px * px + py * py).sqrt();

    let type_f = fractal_type as f32;
    let arms = 3.0 + (type_f * 1.7) % 5.0;
    let spiral_speed = 0.2 + (type_f * 0.13) % 0.3;
    let spiral = base_angle * arms + fractal_val * std::f32::consts::TAU + time * spiral_speed;
    let wave = 0.5 + 0.5 * (spiral * (1.0 + type_f * 0.15)).sin();

    let mut r = (0.3 + fractal_val * 0.7) * (0.6 + 0.4 * wave);
    let mut h = (fractal_val - 0.5) * 1.6;
    h += (spiral * 0.5).sin() * 0.25 * fractal_val;

    // Per-type geometry tweaks
    match fractal_type {
        4 | 5 => {
            // Newton / Phoenix -- three-fold symmetry
            h += (base_angle * 3.0 + time * 0.5).sin() * 0.2 * fractal_val;
        }
        6 => {
            // Multibrot z^4 -- four-fold symmetry
            r *= 1.0 + 0.2 * (base_angle * 4.0 + fractal_val * 8.0).sin();
        }
        7 | 8 | 9 => {
            // Celtic / Perpendicular / Buffalo
            h += (fractal_val * 15.0 + base_angle * 2.0).sin() * 0.15;
            r *= 1.0 + 0.15 * (fractal_val * 12.0 - time * 0.4).cos();
        }
        _ => {}
    }

    let rot_angle = base_angle + time * spiral_speed + seed[3] * std::f32::consts::TAU;
    let mut pos = Vec3::new(rot_angle.cos() * r, h, rot_angle.sin() * r);

    // Organic motion
    pos.x += (fractal_val * 10.0 + time * 0.7).sin() * 0.1 * fractal_val;
    pos.z += (fractal_val * 8.0 - time * 0.5).cos() * 0.08 * fractal_val;
    pos.y += (dist * 5.0 + time * 0.4).sin() * 0.06;

    pos
}

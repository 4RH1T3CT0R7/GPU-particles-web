use glam::Vec3;

use crate::fluids::{poly6_kernel, spiky_gradient};
use crate::grid::SpatialHashGrid;
use crate::particle::{ParticleSet, Phase};

/// Relaxation parameter (epsilon) for the lambda denominator.
/// Prevents division by zero and controls constraint stiffness.
const EPSILON: f32 = 600.0;

/// Tensile instability correction coefficient (k in the paper).
const TENSILE_K: f32 = 0.001;

/// Tensile instability correction exponent (n in the paper).
const TENSILE_N: i32 = 4;

/// Fraction of smoothing radius used as the tensile reference distance.
const TENSILE_DQ_FACTOR: f32 = 0.3;

/// Returns true if the phase participates in PBF density constraints.
#[inline]
fn is_fluid_phase(phase: Phase) -> bool {
    matches!(phase, Phase::Fluid | Phase::Gas)
}

/// Solve PBF density constraints for fluid/gas particles.
///
/// Reference: "Position Based Fluids", Macklin & Muller, SIGGRAPH 2013
///
/// Three phases:
/// 1. Compute density for each fluid particle using the poly6 kernel.
/// 2. Compute lambda (Lagrange multiplier) with epsilon relaxation.
/// 3. Compute position corrections with optional tensile instability fix.
///
/// Position corrections are accumulated into `particles.corrections` and
/// `particles.correction_counts` using Jacobi-style updates, so the caller
/// is responsible for zeroing these buffers before the first constraint
/// solve in each iteration and for applying the averaged corrections
/// afterwards.
pub fn solve_density_constraints(
    particles: &mut ParticleSet,
    grid: &SpatialHashGrid,
    rest_density: f32,
    smoothing_radius: f32,
    tensile_correction: bool,
) {
    let count = particles.count;
    let h = smoothing_radius;
    let inv_rho0 = 1.0 / rest_density;

    // Precompute the tensile reference kernel value (poly6 at delta_q distance).
    let poly6_dq = if tensile_correction {
        let dq = h * TENSILE_DQ_FACTOR;
        poly6_kernel(dq, h)
    } else {
        1.0 // unused, but avoids a branch later
    };

    // ------------------------------------------------------------------
    // Phase 1: Compute density for every fluid/gas particle.
    // ------------------------------------------------------------------
    for i in 0..count {
        if !is_fluid_phase(particles.phase[i]) {
            continue;
        }

        let pos_i = particles.predicted[i];
        let mut rho = 0.0_f32;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            let r_len = (pos_i - particles.predicted[j]).length();
            if r_len < h {
                // NOTE: Assumes unit mass for all particles. If per-particle mass
                // is added (via inv_mass field), multiply by mass_j here.
                rho += poly6_kernel(r_len, h);
            }
        });

        particles.density[i] = rho;
    }

    // ------------------------------------------------------------------
    // Phase 2: Compute lambda_i for every fluid/gas particle.
    // ------------------------------------------------------------------
    for i in 0..count {
        if !is_fluid_phase(particles.phase[i]) {
            continue;
        }

        let pos_i = particles.predicted[i];
        let rho_i = particles.density[i];

        // Constraint value: C_i = rho_i / rho_0 - 1
        let c_i = rho_i * inv_rho0 - 1.0;

        // Accumulate gradient magnitude squared and the self-gradient.
        let mut grad_sum_sq = 0.0_f32;
        let mut grad_self = Vec3::ZERO;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            if j == i {
                return;
            }
            let r = pos_i - particles.predicted[j];
            let r_len = r.length();
            if r_len < h {
                let grad_j = spiky_gradient(r, r_len, h) * inv_rho0;
                grad_sum_sq += grad_j.length_squared();
                grad_self += grad_j;
            }
        });

        grad_sum_sq += grad_self.length_squared();

        particles.lambda[i] = -c_i / (grad_sum_sq + EPSILON);
    }

    // ------------------------------------------------------------------
    // Phase 3: Compute position corrections.
    // ------------------------------------------------------------------
    for i in 0..count {
        if !is_fluid_phase(particles.phase[i]) {
            continue;
        }

        let pos_i = particles.predicted[i];
        let lambda_i = particles.lambda[i];
        let mut delta_p = Vec3::ZERO;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            if j == i {
                return;
            }
            let r = pos_i - particles.predicted[j];
            let r_len = r.length();
            if r_len >= h {
                return;
            }

            // Use neighbor lambda if it is a fluid/gas particle, otherwise 0.
            let lambda_j = if is_fluid_phase(particles.phase[j]) {
                particles.lambda[j]
            } else {
                0.0
            };

            // Optional tensile instability correction (s_corr).
            let s_corr = if tensile_correction {
                let ratio = poly6_kernel(r_len, h) / poly6_dq;
                -TENSILE_K * ratio.powi(TENSILE_N)
            } else {
                0.0
            };

            delta_p += (lambda_i + lambda_j + s_corr) * spiky_gradient(r, r_len, h) * inv_rho0;
        });

        particles.corrections[i] += delta_p;
        particles.correction_counts[i] += 1;
    }
}

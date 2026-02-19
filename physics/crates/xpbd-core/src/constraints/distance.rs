use crate::particle::ParticleSet;

/// XPBD distance constraint for cloth edges.
///
/// Maintains a rest length between two particles using XPBD
/// (Extended Position-Based Dynamics) with compliance.
///
/// Reference: "XPBD: Position-Based Simulation of Compliant Constrained Dynamics",
/// Macklin et al., 2016
pub struct DistanceConstraint {
    /// Particle index A.
    pub i: u32,
    /// Particle index B.
    pub j: u32,
    /// Rest length (initial distance between the two particles).
    pub rest_length: f32,
    /// Compliance (inverse stiffness). Higher values produce softer constraints.
    pub compliance: f32,
    /// Accumulated Lagrange multiplier (reset each substep).
    pub lambda: f32,
}

impl DistanceConstraint {
    /// Create a new distance constraint between particles `i` and `j`.
    pub fn new(i: u32, j: u32, rest_length: f32, compliance: f32) -> Self {
        Self {
            i,
            j,
            rest_length,
            compliance,
            lambda: 0.0,
        }
    }
}

/// Solve all distance constraints using XPBD.
///
/// For each constraint:
/// 1. Compute constraint value C = |p_i - p_j| - rest_length
/// 2. Compute XPBD correction: alpha_tilde = compliance / dt^2
/// 3. Compute delta_lambda = -(C + alpha_tilde * lambda) / (w_i + w_j + alpha_tilde)
/// 4. Apply corrections weighted by inverse mass
///
/// Corrections are accumulated into `particles.corrections` and
/// `particles.correction_counts` (Jacobi-style averaging).
pub fn solve_distance_constraints(
    constraints: &mut [DistanceConstraint],
    particles: &mut ParticleSet,
    dt: f32,
) {
    let dt_sq = dt * dt;

    for c in constraints.iter_mut() {
        let i = c.i as usize;
        let j = c.j as usize;

        // Inverse mass from particle data (0.0 = static/immovable)
        let w_i = particles.inv_mass[i];
        let w_j = particles.inv_mass[j];
        let w_sum = w_i + w_j;
        if w_sum < 1e-10 {
            continue;
        }

        let p_i = particles.predicted[i];
        let p_j = particles.predicted[j];
        let diff = p_i - p_j;
        let dist = diff.length();
        if dist < 1e-10 {
            continue;
        }

        // Constraint value: should be zero when at rest length
        let c_val = dist - c.rest_length;

        // Constraint gradient direction (unit vector from j to i)
        let n = diff / dist;

        // XPBD: alpha_tilde = alpha / dt^2
        let alpha_tilde = c.compliance / dt_sq;

        // XPBD Lagrange multiplier update
        let delta_lambda = -(c_val + alpha_tilde * c.lambda) / (w_sum + alpha_tilde);
        c.lambda += delta_lambda;

        // Apply corrections weighted by inverse mass
        let correction = n * delta_lambda;

        particles.corrections[i] += correction * w_i;
        particles.corrections[j] -= correction * w_j;
        particles.correction_counts[i] += 1;
        particles.correction_counts[j] += 1;
    }
}

/// Reset all Lagrange multipliers to zero.
/// Call this at the beginning of each substep.
pub fn reset_lambdas(constraints: &mut [DistanceConstraint]) {
    for c in constraints.iter_mut() {
        c.lambda = 0.0;
    }
}

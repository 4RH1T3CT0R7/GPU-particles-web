use glam::Vec3;

use crate::particle::ParticleSet;

/// Dihedral bending constraint for cloth simulation.
///
/// Constrains the angle between two adjacent triangles sharing edge (i, j),
/// with opposite vertices k and l:
///
/// ```text
///     k
///    / \
///   i---j
///    \ /
///     l
/// ```
///
/// The constraint measures the dihedral angle between the two triangle normals
/// and applies corrections to maintain it at a rest angle. Higher compliance
/// values produce softer bending; zero compliance produces a rigid hinge.
pub struct BendingConstraint {
    /// Shared edge vertex A.
    pub i: u32,
    /// Shared edge vertex B.
    pub j: u32,
    /// Opposite vertex, triangle 1.
    pub k: u32,
    /// Opposite vertex, triangle 2.
    pub l: u32,
    /// Rest dihedral angle in radians.
    pub rest_angle: f32,
    /// XPBD compliance (inverse stiffness). Higher values produce softer bending.
    pub compliance: f32,
    /// Lagrange multiplier accumulator, reset each simulation step.
    pub lambda: f32,
}

impl BendingConstraint {
    /// Create a new bending constraint.
    ///
    /// `i` and `j` are the indices of the shared edge vertices. `k` and `l`
    /// are the opposite vertices of the two adjacent triangles. `rest_angle`
    /// is the target dihedral angle in radians. `compliance` controls
    /// softness (0 = rigid, larger = softer).
    pub fn new(i: u32, j: u32, k: u32, l: u32, rest_angle: f32, compliance: f32) -> Self {
        Self {
            i,
            j,
            k,
            l,
            rest_angle,
            compliance,
            lambda: 0.0,
        }
    }
}

/// Compute the dihedral angle between two triangles sharing edge (p1, p2),
/// with opposite vertices p3 (triangle 1) and p4 (triangle 2).
///
/// Returns the signed angle in radians. A flat configuration returns 0.
/// Degenerate triangles (zero-area) return 0 to avoid NaN propagation.
fn dihedral_angle(p1: Vec3, p2: Vec3, p3: Vec3, p4: Vec3) -> f32 {
    let e = p2 - p1;
    let e_len = e.length();
    if e_len < 1e-8 {
        return 0.0;
    }
    let e_norm = e / e_len;

    // Normals of the two triangles (unnormalized).
    let n1 = (p3 - p1).cross(p3 - p2);
    let n2 = (p4 - p2).cross(p4 - p1);

    let n1_len = n1.length();
    let n2_len = n2.length();
    if n1_len < 1e-8 || n2_len < 1e-8 {
        return 0.0;
    }

    let n1 = n1 / n1_len;
    let n2 = n2 / n2_len;

    let cos_angle = n1.dot(n2).clamp(-1.0, 1.0);
    let sin_angle = n1.cross(n2).dot(e_norm);

    sin_angle.atan2(cos_angle)
}

/// Solve all bending constraints using XPBD with Jacobi-style corrections.
///
/// Position corrections are accumulated into `particles.corrections` and
/// `particles.correction_counts`. The caller is responsible for zeroing
/// these buffers before the first constraint solve in each iteration and
/// for applying the averaged corrections afterwards.
///
/// All non-static particles are treated as having inverse mass 1.0.
/// Static particles have inverse mass 0.0 and are never moved.
pub fn solve_bending_constraints(
    constraints: &mut [BendingConstraint],
    particles: &mut ParticleSet,
    dt: f32,
) {
    let dt_sq = dt * dt;

    for c in constraints.iter_mut() {
        let ii = c.i as usize;
        let jj = c.j as usize;
        let kk = c.k as usize;
        let ll = c.l as usize;

        let p1 = particles.predicted[ii];
        let p2 = particles.predicted[jj];
        let p3 = particles.predicted[kk];
        let p4 = particles.predicted[ll];

        let current_angle = dihedral_angle(p1, p2, p3, p4);
        let angle_error = current_angle - c.rest_angle;

        // Skip if constraint is nearly satisfied.
        if angle_error.abs() < 1e-6 {
            continue;
        }

        // Inverse masses from particle data (0.0 = static/immovable).
        let w_i = particles.inv_mass[ii];
        let w_j = particles.inv_mass[jj];
        let w_k = particles.inv_mass[kk];
        let w_l = particles.inv_mass[ll];
        let w_sum = w_i + w_j + w_k + w_l;
        if w_sum < 1e-10 {
            continue;
        }

        // Shared edge vector and triangle normals.
        let e = p2 - p1;
        let e_len = e.length();
        if e_len < 1e-8 {
            continue;
        }
        let e_len_sq = e_len * e_len;

        // Unnormalized triangle normals (magnitude = 2 * triangle area).
        let n1 = (p3 - p1).cross(p3 - p2);
        let n2 = (p4 - p2).cross(p4 - p1);
        let n1_len_sq = n1.length_squared();
        let n2_len_sq = n2.length_squared();
        if n1_len_sq < 1e-16 || n2_len_sq < 1e-16 {
            continue;
        }

        // Analytical gradients of the dihedral angle with respect to each vertex.
        //
        // For opposite vertices (perpendicular to their respective triangle plane):
        //   grad_k = -|e| * n1 / |n1|^2
        //   grad_l = -|e| * n2 / |n2|^2
        //
        // For shared edge vertices (cotangent-weighted blend):
        //   t_k = dot(p3 - p1, e) / |e|^2   (projection parameter of p3 onto edge)
        //   t_l = dot(p4 - p1, e) / |e|^2   (projection parameter of p4 onto edge)
        //   grad_i = -(1 - t_k) * grad_k - (1 - t_l) * grad_l
        //   grad_j = -t_k * grad_k - t_l * grad_l
        let grad_k = n1 * (-e_len / n1_len_sq);
        let grad_l = n2 * (-e_len / n2_len_sq);

        let t_k = (p3 - p1).dot(e) / e_len_sq;
        let t_l = (p4 - p1).dot(e) / e_len_sq;
        let grad_i = grad_k * (-(1.0 - t_k)) + grad_l * (-(1.0 - t_l));
        let grad_j = grad_k * (-t_k) + grad_l * (-t_l);

        // XPBD denominator: sum of w * |grad|^2.
        let denom = w_k * grad_k.length_squared()
            + w_l * grad_l.length_squared()
            + w_i * grad_i.length_squared()
            + w_j * grad_j.length_squared();

        if denom < 1e-10 {
            continue;
        }

        // XPBD: compliance-scaled Lagrange multiplier update.
        let alpha_tilde = c.compliance / dt_sq;
        let delta_lambda = -(angle_error + alpha_tilde * c.lambda) / (denom + alpha_tilde);
        c.lambda += delta_lambda;

        // Apply position corrections: delta_x = w * delta_lambda * grad.
        particles.corrections[kk] += grad_k * (delta_lambda * w_k);
        particles.corrections[ll] += grad_l * (delta_lambda * w_l);
        particles.corrections[ii] += grad_i * (delta_lambda * w_i);
        particles.corrections[jj] += grad_j * (delta_lambda * w_j);
        particles.correction_counts[kk] += 1;
        particles.correction_counts[ll] += 1;
        particles.correction_counts[ii] += 1;
        particles.correction_counts[jj] += 1;
    }
}

/// Reset all Lagrange multipliers to zero.
///
/// Must be called at the beginning of each simulation step before the
/// constraint solver iterations begin.
pub fn reset_lambdas(constraints: &mut [BendingConstraint]) {
    for c in constraints.iter_mut() {
        c.lambda = 0.0;
    }
}

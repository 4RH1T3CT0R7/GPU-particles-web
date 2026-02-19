use glam::{Mat3, Vec3};

use crate::particle::ParticleSet;

/// Rigid body shape matching group.
///
/// Stores particle indices and their rest-state positions relative to the
/// rest center of mass. During simulation, the algorithm:
/// 1. Computes current center of mass
/// 2. Builds cross-covariance matrix A_pq
/// 3. Extracts rotation via polar decomposition
/// 4. Moves particles toward their rotated rest positions
///
/// Reference: "Meshless Deformations Based on Shape Matching", Mueller et al., 2005
pub struct ShapeMatchGroup {
    pub particle_indices: Vec<u32>,
    /// Rest positions relative to rest center of mass.
    pub rest_positions: Vec<Vec3>,
    pub rest_com: Vec3,
    /// Stiffness in `[0..1]`. A value of `1.0` means fully rigid.
    pub stiffness: f32,
}

impl ShapeMatchGroup {
    /// Create a shape match group from particle indices.
    ///
    /// Computes rest positions relative to center of mass from current
    /// positions (assuming uniform mass for all particles).
    pub fn from_particles(indices: Vec<u32>, positions: &[Vec3], stiffness: f32) -> Self {
        let n = indices.len();
        if n == 0 {
            return Self {
                particle_indices: indices,
                rest_positions: Vec::new(),
                rest_com: Vec3::ZERO,
                stiffness,
            };
        }

        // Compute rest CoM (uniform mass)
        let mut com = Vec3::ZERO;
        for &idx in &indices {
            com += positions[idx as usize];
        }
        com /= n as f32;

        // Compute rest positions relative to CoM
        let rest_pos: Vec<Vec3> = indices
            .iter()
            .map(|&idx| positions[idx as usize] - com)
            .collect();

        Self {
            particle_indices: indices,
            rest_positions: rest_pos,
            rest_com: com,
            stiffness,
        }
    }
}

/// Solve shape matching constraints for all groups.
///
/// For each group:
/// 1. Compute current center of mass from predicted positions
/// 2. Build A_pq cross-covariance matrix
/// 3. Extract rotation R via iterative polar decomposition
/// 4. Compute goal = R * rest_pos + com, apply correction
pub fn solve_shape_matching(groups: &[ShapeMatchGroup], particles: &mut ParticleSet) {
    for group in groups {
        if group.particle_indices.is_empty() {
            continue;
        }

        // Step 1: Current center of mass (mass-weighted, skip static particles)
        let mut com = Vec3::ZERO;
        let mut total_mass = 0.0_f32;
        for &idx in &group.particle_indices {
            let i = idx as usize;
            if particles.inv_mass[i] == 0.0 {
                continue;
            }
            let mass = 1.0 / particles.inv_mass[i];
            com += particles.predicted[i] * mass;
            total_mass += mass;
        }
        if total_mass < 1e-10 {
            continue;
        }
        com /= total_mass;

        // Step 2: Build A_pq cross-covariance matrix (mass-weighted)
        let mut a_pq = Mat3::ZERO;
        for (k, &idx) in group.particle_indices.iter().enumerate() {
            let i = idx as usize;
            if particles.inv_mass[i] == 0.0 {
                continue;
            }
            let mass = 1.0 / particles.inv_mass[i];
            let q = particles.predicted[i] - com; // current relative position
            let p = group.rest_positions[k]; // rest relative position
            // A_pq += q * mass * p^T (mass-weighted outer product)
            a_pq += mat3_outer(q * mass, p);
        }

        // Regularise A_pq so that degenerate configurations (e.g. all
        // particles coplanar) do not produce a singular matrix.  A small
        // identity contribution keeps the unused axis at identity rotation.
        let a_pq = a_pq + Mat3::IDENTITY * 1e-6;

        // Step 3: Extract rotation via polar decomposition
        let r = polar_decomposition_iterative(a_pq);

        // Step 4: Apply corrections
        let stiffness = group.stiffness;
        for (k, &idx) in group.particle_indices.iter().enumerate() {
            let i = idx as usize;
            if particles.inv_mass[i] == 0.0 {
                continue;
            }

            let goal = r * group.rest_positions[k] + com;
            let correction = (goal - particles.predicted[i]) * stiffness;

            particles.corrections[i] += correction;
            particles.correction_counts[i] += 1;
        }
    }
}

/// Outer product of two `Vec3`: returns a `Mat3` where M = a * b^T.
fn mat3_outer(a: Vec3, b: Vec3) -> Mat3 {
    Mat3::from_cols(a * b.x, a * b.y, a * b.z)
}

/// Iterative polar decomposition: extract rotation from A = R * S.
///
/// Uses 10 iterations of: R_{k+1} = 0.5 * (R_k + R_k^{-T})
///
/// Converges to the rotation component of the polar decomposition.
/// If the matrix is singular, returns identity.
fn polar_decomposition_iterative(a: Mat3) -> Mat3 {
    let mut r = a;
    for _ in 0..10 {
        let det = r.determinant();
        if det.abs() < 1e-10 {
            return Mat3::IDENTITY;
        }
        let r_inv_t = r.inverse().transpose();
        r = (r + r_inv_t) * 0.5;
    }
    r
}

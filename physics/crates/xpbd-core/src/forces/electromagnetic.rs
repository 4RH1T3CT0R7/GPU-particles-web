use glam::Vec3;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

/// Apply electromagnetic forces (Coulomb + Lorentz) to all particles.
///
/// Coulomb force: F = k * q_i * q_j / r^2 * r_hat
///   - Like charges repel, unlike charges attract
///   - Uses spatial locality: only computes forces within `max_range`
///
/// Lorentz force: F = q * (v x B)
///   - Charged particles spiral in external magnetic field
///   - Produces helix motion perpendicular to B
///
/// `charges` contains per-particle charge values (positive or negative).
/// Particles with charge 0.0 are unaffected.
pub fn apply_electromagnetic_forces(
    positions: &[Vec3],
    velocities: &mut [Vec3],
    charges: &[f32],
    count: usize,
    coulomb_k: f32,
    magnetic_field: Vec3,
    softening: f32,
    max_range: f32,
    dt: f32,
) {
    let softening_sq = softening * softening;
    let max_range_sq = max_range * max_range;
    let has_magnetic = magnetic_field.length_squared() > 1e-10;

    // Snapshot velocities for Lorentz force (avoids borrow conflict)
    let vel_snapshot: Vec<Vec3> = if has_magnetic {
        velocities[..count].to_vec()
    } else {
        Vec::new()
    };

    // Compute per-particle acceleration (parallelizable)
    let compute_acc = |i: usize| -> Vec3 {
        let q_i = charges[i];
        if q_i.abs() < 1e-10 {
            return Vec3::ZERO;
        }

        let pos_i = positions[i];
        let mut acc = Vec3::ZERO;

        for j in 0..count {
            if i == j {
                continue;
            }
            let q_j = charges[j];
            if q_j.abs() < 1e-10 {
                continue;
            }

            let diff = positions[j] - pos_i;
            let dist_sq = diff.length_squared();

            if dist_sq > max_range_sq {
                continue;
            }

            let dist_sq_soft = dist_sq + softening_sq;
            let dist = dist_sq_soft.sqrt();

            let force_mag = coulomb_k * q_i * q_j / (dist_sq_soft * dist);
            acc -= diff * force_mag;
        }

        // Lorentz force: F = q * (v x B)
        if has_magnetic {
            let lorentz = q_i * vel_snapshot[i].cross(magnetic_field);
            acc += lorentz;
        }

        acc
    };

    #[cfg(feature = "parallel")]
    {
        let accels: Vec<Vec3> = (0..count).into_par_iter().map(compute_acc).collect();
        for i in 0..count {
            velocities[i] += accels[i] * dt;
        }
    }

    #[cfg(not(feature = "parallel"))]
    {
        for i in 0..count {
            velocities[i] += compute_acc(i) * dt;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_like_charges_repel() {
        let positions = vec![Vec3::new(-0.5, 0.0, 0.0), Vec3::new(0.5, 0.0, 0.0)];
        let mut velocities = vec![Vec3::ZERO; 2];
        let charges = vec![1.0, 1.0]; // same sign

        apply_electromagnetic_forces(
            &positions, &mut velocities, &charges, 2,
            1.0, Vec3::ZERO, 0.01, 10.0, 1.0,
        );

        // Like charges should repel: particle 0 pushed left, particle 1 pushed right
        assert!(velocities[0].x < 0.0, "Like charges should repel: particle 0 should go left");
        assert!(velocities[1].x > 0.0, "Like charges should repel: particle 1 should go right");
    }

    #[test]
    fn test_unlike_charges_attract() {
        let positions = vec![Vec3::new(-0.5, 0.0, 0.0), Vec3::new(0.5, 0.0, 0.0)];
        let mut velocities = vec![Vec3::ZERO; 2];
        let charges = vec![1.0, -1.0]; // opposite signs

        apply_electromagnetic_forces(
            &positions, &mut velocities, &charges, 2,
            1.0, Vec3::ZERO, 0.01, 10.0, 1.0,
        );

        // Unlike charges should attract: particle 0 pulled right, particle 1 pulled left
        assert!(velocities[0].x > 0.0, "Unlike charges should attract: particle 0 should go right");
        assert!(velocities[1].x < 0.0, "Unlike charges should attract: particle 1 should go left");
    }

    #[test]
    fn test_lorentz_force_perpendicular() {
        // A charged particle moving in +X with B-field in +Z should experience
        // Lorentz force in +Y (right-hand rule: v×B = X×Z = -Y, but F=q(v×B))
        let positions = vec![Vec3::ZERO];
        let mut velocities = vec![Vec3::new(1.0, 0.0, 0.0)];
        let charges = vec![1.0];

        apply_electromagnetic_forces(
            &positions, &mut velocities, &charges, 1,
            0.0, Vec3::new(0.0, 0.0, 1.0), 0.01, 10.0, 1.0,
        );

        // v × B = (1,0,0) × (0,0,1) = (0*1 - 0*0, 0*0 - 1*1, 1*0 - 0*0) = (0, -1, 0)
        // F = q * (v × B) = 1.0 * (0, -1, 0) = (0, -1, 0)
        assert!(
            velocities[0].y < 0.0,
            "Lorentz force should deflect in -Y: got {:?}",
            velocities[0]
        );
        // X component should remain ~unchanged (Lorentz is perpendicular)
        assert!(
            (velocities[0].x - 1.0).abs() < 0.01,
            "X velocity should be largely unchanged"
        );
    }

    #[test]
    fn test_zero_charge_unaffected() {
        let positions = vec![Vec3::ZERO, Vec3::new(1.0, 0.0, 0.0)];
        let mut velocities = vec![Vec3::ZERO; 2];
        let charges = vec![0.0, 1.0];

        apply_electromagnetic_forces(
            &positions, &mut velocities, &charges, 2,
            1.0, Vec3::new(0.0, 0.0, 1.0), 0.01, 10.0, 1.0,
        );

        // Particle 0 has zero charge, should not be affected
        assert_eq!(velocities[0], Vec3::ZERO, "Zero-charge particle should not move");
    }
}

use crate::particle::ParticleSet;

/// Solve shape target constraints as XPBD position constraints.
///
/// Each particle is attracted toward its computed shape target position
/// (`target_pos`) with a per-particle compliance that varies based on:
/// - Global `shape_strength` (0 = very soft, 1 = near-rigid)
/// - Per-particle `target_weight` (affinity, 0 = unaffected, 1 = full strength)
///
/// The compliance is interpolated between `compliance_at_zero` (very soft)
/// and `compliance_at_one` (very stiff), then scaled inversely by affinity.
///
/// Corrections are accumulated into `particles.corrections` / `correction_counts`
/// (Jacobi-style averaging).
pub fn solve_shape_targets(
    particles: &mut ParticleSet,
    shape_strength: f32,
    compliance_at_zero: f32,
    compliance_at_one: f32,
    dt: f32,
) {
    if shape_strength < 0.001 {
        return;
    }

    let dt_sq = dt * dt;

    // Variable compliance: strength=1 -> very stiff, strength=0 -> very soft
    let base_compliance = compliance_at_zero + (compliance_at_one - compliance_at_zero) * shape_strength;

    for i in 0..particles.count {
        let w_i = particles.inv_mass[i];
        if w_i == 0.0 {
            continue;
        }

        let affinity = particles.target_weight[i];
        if affinity < 0.01 {
            continue;
        }

        let target = particles.target_pos[i];
        let predicted = particles.predicted[i];
        let diff = predicted - target;
        let dist = diff.length();
        if dist < 1e-6 {
            continue;
        }

        // Per-particle compliance scaled by affinity (lower affinity = softer)
        let compliance = base_compliance / affinity.max(0.01);
        let alpha_tilde = compliance / dt_sq;

        let delta_lambda = -dist / (w_i + alpha_tilde);
        let correction = (diff / dist) * delta_lambda * w_i;

        particles.corrections[i] += correction;
        particles.correction_counts[i] += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec3;

    #[test]
    fn test_shape_targets_pull_toward_target() {
        let mut particles = ParticleSet::new(2);
        particles.predicted[0] = Vec3::new(1.0, 0.0, 0.0);
        particles.target_pos[0] = Vec3::new(0.0, 0.0, 0.0);
        particles.target_weight[0] = 1.0;

        particles.predicted[1] = Vec3::new(0.0, 1.0, 0.0);
        particles.target_pos[1] = Vec3::new(0.0, 0.0, 0.0);
        particles.target_weight[1] = 1.0;

        solve_shape_targets(&mut particles, 0.9, 100.0, 0.0001, 1.0 / 240.0);

        // Both particles should be pulled toward origin
        assert!(
            particles.corrections[0].x < 0.0,
            "particle 0 should be pulled left toward target"
        );
        assert!(
            particles.corrections[1].y < 0.0,
            "particle 1 should be pulled down toward target"
        );
        // Same distance and affinity -> similar correction magnitude
        let diff = (particles.corrections[0].length() - particles.corrections[1].length()).abs();
        assert!(
            diff < 0.001,
            "same distance/affinity should produce similar corrections"
        );
    }

    #[test]
    fn test_shape_targets_affinity_scales_correction() {
        // Same distance, different affinity -> higher affinity = stiffer = larger correction
        let mut p1 = ParticleSet::new(1);
        p1.predicted[0] = Vec3::new(1.0, 0.0, 0.0);
        p1.target_pos[0] = Vec3::ZERO;
        p1.target_weight[0] = 1.0;
        solve_shape_targets(&mut p1, 0.9, 100.0, 0.0001, 1.0 / 240.0);

        let mut p2 = ParticleSet::new(1);
        p2.predicted[0] = Vec3::new(1.0, 0.0, 0.0);
        p2.target_pos[0] = Vec3::ZERO;
        p2.target_weight[0] = 0.1;
        solve_shape_targets(&mut p2, 0.9, 100.0, 0.0001, 1.0 / 240.0);

        assert!(
            p1.corrections[0].length() > p2.corrections[0].length(),
            "higher affinity should produce larger correction: high={}, low={}",
            p1.corrections[0].length(),
            p2.corrections[0].length()
        );
    }

    #[test]
    fn test_shape_targets_zero_strength_no_effect() {
        let mut particles = ParticleSet::new(1);
        particles.predicted[0] = Vec3::new(1.0, 0.0, 0.0);
        particles.target_pos[0] = Vec3::ZERO;
        particles.target_weight[0] = 1.0;

        solve_shape_targets(&mut particles, 0.0, 100.0, 0.0001, 1.0 / 240.0);

        assert_eq!(
            particles.corrections[0],
            Vec3::ZERO,
            "zero shape_strength should produce no corrections"
        );
    }

    #[test]
    fn test_shape_targets_static_particle_unaffected() {
        let mut particles = ParticleSet::new(1);
        particles.inv_mass[0] = 0.0; // static
        particles.predicted[0] = Vec3::new(1.0, 0.0, 0.0);
        particles.target_pos[0] = Vec3::ZERO;
        particles.target_weight[0] = 1.0;

        solve_shape_targets(&mut particles, 0.9, 100.0, 0.0001, 1.0 / 240.0);

        assert_eq!(
            particles.corrections[0],
            Vec3::ZERO,
            "static particle should not be corrected"
        );
    }
}

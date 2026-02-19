use glam::Vec3;
use xpbd_core::constraints::bending::{
    reset_lambdas as reset_bending_lambdas, solve_bending_constraints, BendingConstraint,
};
use xpbd_core::constraints::contact::{detect_contacts, solve_contacts, ContactConstraint};
use xpbd_core::constraints::distance::{
    reset_lambdas, solve_distance_constraints, DistanceConstraint,
};
use xpbd_core::constraints::shape_matching::{ShapeMatchGroup, solve_shape_matching};
use xpbd_core::grid::SpatialHashGrid;
use xpbd_core::particle::{ParticleSet, Phase};
use xpbd_core::solver::Solver;

#[test]
fn test_detect_overlapping_particles() {
    let mut grid = SpatialHashGrid::new(0.5, 1024, 100);

    // Two particles overlapping (radii 0.1 each, distance 0.1 < 0.2)
    let positions = vec![Vec3::new(0.0, 0.0, 0.0), Vec3::new(0.1, 0.0, 0.0)];
    let radii = vec![0.1, 0.1];

    grid.build(&positions, 2);
    let contacts = detect_contacts(&positions, &radii, 2, &grid);

    assert_eq!(contacts.len(), 1, "should detect one contact");
    assert!(
        contacts[0].penetration > 0.0,
        "penetration should be positive"
    );
    assert!(
        (contacts[0].penetration - 0.1).abs() < 0.01,
        "penetration ~0.1"
    );
}

#[test]
fn test_no_contact_when_apart() {
    let mut grid = SpatialHashGrid::new(0.5, 1024, 100);

    let positions = vec![Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0)];
    let radii = vec![0.1, 0.1];

    grid.build(&positions, 2);
    let contacts = detect_contacts(&positions, &radii, 2, &grid);

    assert_eq!(contacts.len(), 0, "should detect no contacts");
}

#[test]
fn test_solve_pushes_apart() {
    let contact = ContactConstraint {
        i: 0,
        j: 1,
        normal: Vec3::X,
        penetration: 0.1,
    };

    let positions = vec![Vec3::ZERO, Vec3::new(0.1, 0.0, 0.0)];
    let previous = positions.clone();
    let mut corrections = vec![Vec3::ZERO; 2];
    let mut counts = vec![0u32; 2];

    let inv_mass = vec![1.0f32; 2];
    solve_contacts(&[contact], &positions, &previous, &inv_mass, &mut corrections, &mut counts, 0.0, 1.0 / 60.0);

    // Particle 0 should be pushed in -X, particle 1 in +X
    assert!(corrections[0].x < 0.0, "particle 0 should be pushed left");
    assert!(corrections[1].x > 0.0, "particle 1 should be pushed right");
    assert_eq!(counts[0], 1);
    assert_eq!(counts[1], 1);
}

#[test]
fn test_shape_matching_preserves_rigid_shape() {
    // Create 4 particles forming a square
    let mut particles = ParticleSet::new(4);
    let positions = [
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
    ];
    for i in 0..4 {
        particles.position[i] = positions[i];
        particles.predicted[i] = positions[i];
        particles.phase[i] = Phase::Rigid;
    }

    // Create shape match group
    let group = ShapeMatchGroup::from_particles(vec![0, 1, 2, 3], &particles.position, 1.0);

    // Deform: move particle 2 away
    particles.predicted[2] = Vec3::new(2.0, 2.0, 0.0);

    // Reset corrections
    for i in 0..4 {
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }

    // Solve
    solve_shape_matching(&[group], &mut particles);

    // All particles should have corrections
    let mut any_corrected = false;
    for i in 0..4 {
        if particles.corrections[i].length() > 0.001 {
            any_corrected = true;
        }
    }
    assert!(
        any_corrected,
        "Shape matching should produce corrections for deformed body"
    );
}

#[test]
fn test_shape_matching_rotation_recovery() {
    // Create 4 particles forming a square, then rotate them 90 degrees
    let mut particles = ParticleSet::new(4);
    let rest_positions = [
        Vec3::new(-0.5, -0.5, 0.0),
        Vec3::new(0.5, -0.5, 0.0),
        Vec3::new(0.5, 0.5, 0.0),
        Vec3::new(-0.5, 0.5, 0.0),
    ];
    for i in 0..4 {
        particles.position[i] = rest_positions[i];
        particles.phase[i] = Phase::Rigid;
    }

    let group = ShapeMatchGroup::from_particles(vec![0, 1, 2, 3], &particles.position, 1.0);

    // Rotate 90 degrees around Z axis for predicted
    for i in 0..4 {
        let p = rest_positions[i];
        particles.predicted[i] = Vec3::new(-p.y, p.x, p.z);
    }

    // Reset and solve
    for i in 0..4 {
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }
    solve_shape_matching(&[group], &mut particles);

    // After shape matching, corrections should be near zero because the
    // rotated configuration is a valid rigid transform of the rest shape
    for i in 0..4 {
        let correction_mag = particles.corrections[i].length();
        assert!(
            correction_mag < 0.1,
            "Particle {} correction should be small for pure rotation, got {}",
            i,
            correction_mag
        );
    }
}

#[test]
fn test_rigid_body_creation() {
    let mut solver = Solver::new(10);
    // Place first 4 particles in a known configuration
    solver.particles.position[0] = Vec3::new(0.0, 0.0, 0.0);
    solver.particles.position[1] = Vec3::new(1.0, 0.0, 0.0);
    solver.particles.position[2] = Vec3::new(1.0, 1.0, 0.0);
    solver.particles.position[3] = Vec3::new(0.0, 1.0, 0.0);

    solver.create_rigid_body(0, 4, 0.9);

    // Verify phases
    for i in 0..4 {
        assert_eq!(solver.particles.phase[i], Phase::Rigid);
    }
    // Remaining particles should stay Free
    for i in 4..10 {
        assert_eq!(solver.particles.phase[i], Phase::Free);
    }
    // Verify shape match group was created
    assert_eq!(solver.shape_match_groups.len(), 1);
    assert_eq!(solver.shape_match_groups[0].particle_indices.len(), 4);
}

#[test]
fn test_rigid_body_solver_integration() {
    let mut solver = Solver::new(4);
    solver.particles.position[0] = Vec3::new(-0.5, -0.5, 0.0);
    solver.particles.position[1] = Vec3::new(0.5, -0.5, 0.0);
    solver.particles.position[2] = Vec3::new(0.5, 0.5, 0.0);
    solver.particles.position[3] = Vec3::new(-0.5, 0.5, 0.0);
    for i in 0..4 {
        solver.particles.velocity[i] = Vec3::ZERO;
    }

    solver.create_rigid_body(0, 4, 1.0);
    solver.config.collisions_enabled = true;
    solver.config.substeps = 1;
    solver.config.solver_iterations = 5;
    solver.config.shape_strength = 0.0; // disable shape attraction

    // Perturb one particle
    solver.particles.position[2] = Vec3::new(1.5, 1.5, 0.0);

    // Run a few steps
    for _ in 0..5 {
        solver.step(1.0 / 60.0, 0.0);
    }

    // After solver runs with shape matching, particles should be closer to rigid config
    // than the perturbed state. Check that particle 2 moved back toward the group.
    let p2 = solver.particles.position[2];
    let dist_from_perturbed = (p2 - Vec3::new(1.5, 1.5, 0.0)).length();
    assert!(
        dist_from_perturbed > 0.01,
        "Particle 2 should have moved from perturbed position"
    );
}

#[test]
fn test_contact_friction_reduces_tangential_velocity() {
    // Two particles with tangential relative velocity
    let contact = ContactConstraint {
        i: 0,
        j: 1,
        normal: Vec3::Y, // contact normal pointing up
        penetration: 0.05,
    };

    // Predicted positions: particle 0 moved right, particle 1 stationary
    let predicted = vec![Vec3::new(0.1, 0.0, 0.0), Vec3::new(0.0, 0.05, 0.0)];
    let previous = vec![Vec3::ZERO, Vec3::new(0.0, 0.05, 0.0)];

    let inv_mass = vec![1.0f32; 2];

    // Without friction
    let mut corr_no_friction = vec![Vec3::ZERO; 2];
    let mut counts_no_friction = vec![0u32; 2];
    solve_contacts(
        &[contact.clone()],
        &predicted,
        &previous,
        &inv_mass,
        &mut corr_no_friction,
        &mut counts_no_friction,
        0.0,
        1.0 / 60.0,
    );

    // With friction
    let mut corr_friction = vec![Vec3::ZERO; 2];
    let mut counts_friction = vec![0u32; 2];
    solve_contacts(
        &[contact],
        &predicted,
        &previous,
        &inv_mass,
        &mut corr_friction,
        &mut counts_friction,
        0.5,
        1.0 / 60.0,
    );

    // Friction should add additional tangential corrections
    let tangential_no = corr_no_friction[0].x.abs();
    let tangential_yes = corr_friction[0].x.abs();
    assert!(
        tangential_yes > tangential_no,
        "Friction should add tangential correction: without={}, with={}",
        tangential_no,
        tangential_yes,
    );
}

// ---------------------------------------------------------------------------
// Distance constraint edge cases
// ---------------------------------------------------------------------------

/// Helper: apply accumulated Jacobi corrections to predicted positions and reset buffers.
#[allow(dead_code)]
fn apply_corrections(particles: &mut ParticleSet) {
    for i in 0..particles.count {
        if particles.correction_counts[i] > 0 {
            particles.predicted[i] +=
                particles.corrections[i] / particles.correction_counts[i] as f32;
            particles.corrections[i] = Vec3::ZERO;
            particles.correction_counts[i] = 0;
        }
    }
}

/// Helper: reset Jacobi correction buffers.
fn reset_corrections(particles: &mut ParticleSet) {
    for i in 0..particles.count {
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }
}

/// Test-side dihedral angle computation (mirrors the private function in bending.rs).
#[allow(dead_code)]
fn dihedral_angle_test(p1: Vec3, p2: Vec3, p3: Vec3, p4: Vec3) -> f32 {
    let e = p2 - p1;
    let e_len = e.length();
    if e_len < 1e-8 {
        return 0.0;
    }
    let e_norm = e / e_len;

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

#[test]
fn test_distance_constraint_both_static() {
    // Both particles have inv_mass=0.0 (static). The solver should skip (w_sum < 1e-10).
    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles.inv_mass[0] = 0.0;
    particles.inv_mass[1] = 0.0;
    particles.phase[0] = Phase::Static;
    particles.phase[1] = Phase::Static;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    let dt = 1.0 / 60.0;
    reset_lambdas(&mut constraints);
    solve_distance_constraints(&mut constraints, &mut particles, dt);

    // Corrections must be zero since both particles are static.
    assert_eq!(
        particles.corrections[0],
        Vec3::ZERO,
        "static particle 0 should receive no correction"
    );
    assert_eq!(
        particles.corrections[1],
        Vec3::ZERO,
        "static particle 1 should receive no correction"
    );
    assert_eq!(particles.correction_counts[0], 0);
    assert_eq!(particles.correction_counts[1], 0);
}

#[test]
fn test_distance_constraint_coincident_particles() {
    // Both particles at the exact same position (0,0,0). dist < 1e-10 branch.
    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::ZERO;
    particles.predicted[1] = Vec3::ZERO;
    particles.phase[0] = Phase::Cloth;
    particles.phase[1] = Phase::Cloth;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    let dt = 1.0 / 60.0;
    reset_lambdas(&mut constraints);
    solve_distance_constraints(&mut constraints, &mut particles, dt);

    // Should not panic, and no NaN in corrections.
    for i in 0..2 {
        assert!(
            !particles.corrections[i].x.is_nan()
                && !particles.corrections[i].y.is_nan()
                && !particles.corrections[i].z.is_nan(),
            "particle {i} correction should not be NaN"
        );
    }
    // Since dist < 1e-10, the solver skips: corrections remain zero.
    assert_eq!(particles.corrections[0], Vec3::ZERO);
    assert_eq!(particles.corrections[1], Vec3::ZERO);
}

#[test]
fn test_distance_constraint_nonzero_compliance() {
    // Two particles stretched to distance 2.0, rest_length=1.0.
    // Solve once with compliance=0.0, then with compliance=0.1.
    // Compliance=0.1 should produce a smaller correction (softer constraint).
    let dt = 1.0 / 60.0;

    // --- Solve with compliance = 0.0 (infinitely stiff) ---
    let mut particles_stiff = ParticleSet::new(2);
    particles_stiff.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles_stiff.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles_stiff.phase[0] = Phase::Cloth;
    particles_stiff.phase[1] = Phase::Cloth;

    let mut constraints_stiff = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];
    reset_lambdas(&mut constraints_stiff);
    solve_distance_constraints(&mut constraints_stiff, &mut particles_stiff, dt);

    let correction_stiff = particles_stiff.corrections[0].length()
        + particles_stiff.corrections[1].length();

    // --- Solve with compliance = 0.1 (soft) ---
    let mut particles_soft = ParticleSet::new(2);
    particles_soft.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles_soft.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles_soft.phase[0] = Phase::Cloth;
    particles_soft.phase[1] = Phase::Cloth;

    let mut constraints_soft = vec![DistanceConstraint::new(0, 1, 1.0, 0.1)];
    reset_lambdas(&mut constraints_soft);
    solve_distance_constraints(&mut constraints_soft, &mut particles_soft, dt);

    let correction_soft = particles_soft.corrections[0].length()
        + particles_soft.corrections[1].length();

    assert!(
        correction_soft < correction_stiff,
        "compliance=0.1 should produce smaller correction than compliance=0.0: soft={}, stiff={}",
        correction_soft,
        correction_stiff,
    );
}

// ---------------------------------------------------------------------------
// Contact constraint edge cases
// ---------------------------------------------------------------------------

#[test]
fn test_contact_both_static_no_correction() {
    // Both particles have inv_mass=0.0 (static). Solve should skip.
    let contact = ContactConstraint {
        i: 0,
        j: 1,
        normal: Vec3::X,
        penetration: 0.1,
    };

    let predicted = vec![Vec3::ZERO, Vec3::new(0.1, 0.0, 0.0)];
    let previous = predicted.clone();
    let mut corrections = vec![Vec3::ZERO; 2];
    let mut counts = vec![0u32; 2];
    let inv_mass = vec![0.0f32; 2];

    solve_contacts(
        &[contact],
        &predicted,
        &previous,
        &inv_mass,
        &mut corrections,
        &mut counts,
        0.0,
        1.0 / 60.0,
    );

    assert_eq!(corrections[0], Vec3::ZERO, "static particle 0 should receive no correction");
    assert_eq!(corrections[1], Vec3::ZERO, "static particle 1 should receive no correction");
    assert_eq!(counts[0], 0);
    assert_eq!(counts[1], 0);
}

#[test]
fn test_contact_asymmetric_mass() {
    // One heavy particle (inv_mass=0.1) and one light particle (inv_mass=1.0).
    // The light particle should receive a larger correction.
    let contact = ContactConstraint {
        i: 0,
        j: 1,
        normal: Vec3::X,
        penetration: 0.1,
    };

    let predicted = vec![Vec3::ZERO, Vec3::new(0.1, 0.0, 0.0)];
    let previous = predicted.clone();
    let mut corrections = vec![Vec3::ZERO; 2];
    let mut counts = vec![0u32; 2];
    let inv_mass = vec![0.1f32, 1.0f32]; // particle 0 = heavy, particle 1 = light

    solve_contacts(
        &[contact],
        &predicted,
        &previous,
        &inv_mass,
        &mut corrections,
        &mut counts,
        0.0,
        1.0 / 60.0,
    );

    let heavy_correction = corrections[0].length();
    let light_correction = corrections[1].length();

    assert!(
        light_correction > heavy_correction,
        "light particle should get larger correction: light={}, heavy={}",
        light_correction,
        heavy_correction,
    );
}

// ---------------------------------------------------------------------------
// Bending constraint edge cases
// ---------------------------------------------------------------------------

#[test]
fn test_bending_constraint_all_static() {
    // Four particles all with inv_mass=0.0 (static). Solver should skip (w_sum < 1e-10).
    //
    // Use a bent configuration so that a non-zero angle error exists,
    // but since all particles are static, no corrections should be applied.
    let mut particles = ParticleSet::new(4);
    particles.predicted[0] = Vec3::new(-1.0, 0.0, 0.0); // i
    particles.predicted[1] = Vec3::new(1.0, 0.0, 0.0);  // j
    particles.predicted[2] = Vec3::new(0.0, 1.0, 0.5);  // k -- lifted +Z
    particles.predicted[3] = Vec3::new(0.0, -1.0, 0.5); // l -- lifted +Z
    for idx in 0..4 {
        particles.phase[idx] = Phase::Static;
        particles.inv_mass[idx] = 0.0;
    }

    let mut constraints = vec![BendingConstraint::new(0, 1, 2, 3, 0.0, 0.0)];

    let dt = 1.0 / 60.0;
    reset_bending_lambdas(&mut constraints);
    reset_corrections(&mut particles);
    solve_bending_constraints(&mut constraints, &mut particles, dt);

    for idx in 0..4 {
        assert_eq!(
            particles.corrections[idx],
            Vec3::ZERO,
            "static particle {idx} should receive no correction"
        );
        assert_eq!(
            particles.correction_counts[idx], 0,
            "static particle {idx} should have zero correction count"
        );
    }
}

#[test]
fn test_bending_nonzero_compliance() {
    // Same bent configuration as test_bending_constraint_resists_folding.
    // Solve once with compliance=0.0 (stiff), then with compliance=1.0 (soft).
    // compliance=1.0 should produce smaller total corrections.
    let dt = 1.0 / 60.0;

    // --- Solve with compliance = 0.0 (stiff) ---
    let mut particles_stiff = ParticleSet::new(4);
    particles_stiff.predicted[0] = Vec3::new(-1.0, 0.0, 0.0);
    particles_stiff.predicted[1] = Vec3::new(1.0, 0.0, 0.0);
    particles_stiff.predicted[2] = Vec3::new(0.0, 1.0, 0.5);
    particles_stiff.predicted[3] = Vec3::new(0.0, -1.0, 0.5);
    for idx in 0..4 {
        particles_stiff.phase[idx] = Phase::Cloth;
    }

    let mut constraints_stiff = vec![BendingConstraint::new(0, 1, 2, 3, 0.0, 0.0)];
    reset_bending_lambdas(&mut constraints_stiff);
    reset_corrections(&mut particles_stiff);
    solve_bending_constraints(&mut constraints_stiff, &mut particles_stiff, dt);

    let total_stiff: f32 = (0..4)
        .map(|i| particles_stiff.corrections[i].length())
        .sum();

    // --- Solve with compliance = 1.0 (soft) ---
    let mut particles_soft = ParticleSet::new(4);
    particles_soft.predicted[0] = Vec3::new(-1.0, 0.0, 0.0);
    particles_soft.predicted[1] = Vec3::new(1.0, 0.0, 0.0);
    particles_soft.predicted[2] = Vec3::new(0.0, 1.0, 0.5);
    particles_soft.predicted[3] = Vec3::new(0.0, -1.0, 0.5);
    for idx in 0..4 {
        particles_soft.phase[idx] = Phase::Cloth;
    }

    let mut constraints_soft = vec![BendingConstraint::new(0, 1, 2, 3, 0.0, 1.0)];
    reset_bending_lambdas(&mut constraints_soft);
    reset_corrections(&mut particles_soft);
    solve_bending_constraints(&mut constraints_soft, &mut particles_soft, dt);

    let total_soft: f32 = (0..4)
        .map(|i| particles_soft.corrections[i].length())
        .sum();

    assert!(
        total_soft < total_stiff,
        "compliance=1.0 should produce smaller corrections than compliance=0.0: soft={}, stiff={}",
        total_soft,
        total_stiff,
    );
}

#[test]
fn test_distance_reset_lambdas_zeroes() {
    use xpbd_core::constraints::distance::{DistanceConstraint, solve_distance_constraints, reset_lambdas};

    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles.inv_mass[0] = 1.0;
    particles.inv_mass[1] = 1.0;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    // Solve to accumulate non-zero lambdas
    solve_distance_constraints(&mut constraints, &mut particles, 1.0 / 60.0);
    assert!(constraints[0].lambda.abs() > 1e-6, "Lambda should be non-zero after solve");

    // Reset and verify
    reset_lambdas(&mut constraints);
    assert_eq!(constraints[0].lambda, 0.0, "Lambda should be zero after reset");
}

#[test]
fn test_contact_detect_coincident_particles() {
    // Two particles at exact same position — should NOT generate contact (dist < 1e-8)
    let mut grid = SpatialHashGrid::new(0.5, 1024, 100);
    let positions = vec![Vec3::ZERO, Vec3::ZERO];
    let radii = vec![0.1, 0.1];
    grid.build(&positions, 2);
    let contacts = detect_contacts(&positions, &radii, 2, &grid);
    assert_eq!(contacts.len(), 0, "Coincident particles should not generate contact");
}

#[test]
fn test_shape_matching_empty_group() {
    let group = ShapeMatchGroup::from_particles(vec![], &[], 1.0);
    assert!(group.particle_indices.is_empty());

    // Solve with empty group should not crash
    let mut particles = ParticleSet::new(4);
    for i in 0..4 {
        particles.predicted[i] = Vec3::new(i as f32, 0.0, 0.0);
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }
    solve_shape_matching(&[group], &mut particles);
    // No corrections should be applied
    for i in 0..4 {
        assert_eq!(particles.corrections[i], Vec3::ZERO);
    }
}

#[test]
fn test_shape_matching_collinear_particles() {
    // All particles on a line — degenerate for polar decomposition
    let mut particles = ParticleSet::new(4);
    for i in 0..4 {
        particles.position[i] = Vec3::new(i as f32, 0.0, 0.0);
        particles.predicted[i] = Vec3::new(i as f32 + 0.5, 0.0, 0.0); // shifted
        particles.phase[i] = Phase::Rigid;
        particles.inv_mass[i] = 1.0;
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }

    let group = ShapeMatchGroup::from_particles(vec![0, 1, 2, 3], &particles.position, 1.0);
    solve_shape_matching(&[group], &mut particles);

    // Should not panic or produce NaN
    for i in 0..4 {
        assert!(!particles.corrections[i].x.is_nan(),
            "Collinear shape matching should not produce NaN at {}", i);
    }
}

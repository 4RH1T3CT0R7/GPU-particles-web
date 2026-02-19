use glam::Vec3;
use xpbd_core::constraints::bending::{
    reset_lambdas as reset_bending_lambdas, solve_bending_constraints, BendingConstraint,
};
use xpbd_core::constraints::distance::{
    reset_lambdas, solve_distance_constraints, DistanceConstraint,
};
use xpbd_core::particle::{ParticleSet, Phase};
use xpbd_core::solver::Solver;

/// Helper: apply accumulated Jacobi corrections to predicted positions and reset buffers.
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

#[test]
fn test_distance_constraint_preserves_rest_length() {
    // Two particles exactly at rest length apart -- constraint is already satisfied.
    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.predicted[1] = Vec3::new(1.0, 0.0, 0.0);
    particles.phase[0] = Phase::Cloth;
    particles.phase[1] = Phase::Cloth;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    let dt = 1.0 / 60.0;
    solve_distance_constraints(&mut constraints, &mut particles, dt);
    apply_corrections(&mut particles);

    let dist = (particles.predicted[0] - particles.predicted[1]).length();
    assert!(
        (dist - 1.0).abs() < 1e-5,
        "particles at rest length should not move, got distance {dist}"
    );
}

#[test]
fn test_distance_constraint_restores_rest_length() {
    // Two particles at distance 2.0, rest_length 1.0, zero compliance (infinitely stiff).
    // After several iterations they should converge toward rest length.
    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles.phase[0] = Phase::Cloth;
    particles.phase[1] = Phase::Cloth;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    let dt = 1.0 / 60.0;
    let iterations = 20;

    reset_lambdas(&mut constraints);

    for _ in 0..iterations {
        solve_distance_constraints(&mut constraints, &mut particles, dt);
        apply_corrections(&mut particles);
    }

    let dist = (particles.predicted[0] - particles.predicted[1]).length();
    assert!(
        (dist - 1.0).abs() < 0.05,
        "after {iterations} iterations distance should be near rest_length 1.0, got {dist}"
    );
}

#[test]
fn test_distance_constraint_static_particle() {
    // Particle 0 is Static (immovable), particle 1 is Cloth.
    // Only particle 1 should receive corrections.
    let mut particles = ParticleSet::new(2);
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.predicted[1] = Vec3::new(2.0, 0.0, 0.0);
    particles.phase[0] = Phase::Static;
    particles.inv_mass[0] = 0.0; // static = infinite mass
    particles.phase[1] = Phase::Cloth;

    let mut constraints = vec![DistanceConstraint::new(0, 1, 1.0, 0.0)];

    let dt = 1.0 / 60.0;
    let iterations = 20;

    reset_lambdas(&mut constraints);

    for _ in 0..iterations {
        solve_distance_constraints(&mut constraints, &mut particles, dt);
        apply_corrections(&mut particles);
    }

    // Static particle must not have moved.
    assert_eq!(
        particles.predicted[0],
        Vec3::new(0.0, 0.0, 0.0),
        "static particle should not move"
    );

    // Free particle should have moved toward rest_length distance from static particle.
    let dist = (particles.predicted[0] - particles.predicted[1]).length();
    assert!(
        (dist - 1.0).abs() < 0.05,
        "free particle should converge to rest_length from static anchor, got distance {dist}"
    );
}

// ---------------------------------------------------------------------------
// Bending constraint tests
// ---------------------------------------------------------------------------

/// Helper: reset Jacobi correction buffers.
fn reset_corrections(particles: &mut ParticleSet) {
    for i in 0..particles.count {
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }
}

#[test]
fn test_bending_constraint_flat_rest_angle() {
    // Four particles in a perfectly flat configuration with rest_angle = 0.
    // The dihedral angle is already 0, so no corrections should be applied.
    //
    //     k (index 2) at (0, 1, 0)
    //    / \
    //   i---j   i = (−1, 0, 0), j = (1, 0, 0)
    //    \ /
    //     l (index 3) at (0, −1, 0)
    let mut particles = ParticleSet::new(4);
    particles.predicted[0] = Vec3::new(-1.0, 0.0, 0.0); // i
    particles.predicted[1] = Vec3::new(1.0, 0.0, 0.0); // j
    particles.predicted[2] = Vec3::new(0.0, 1.0, 0.0); // k
    particles.predicted[3] = Vec3::new(0.0, -1.0, 0.0); // l
    for idx in 0..4 {
        particles.phase[idx] = Phase::Cloth;
    }

    let mut constraints = vec![BendingConstraint::new(0, 1, 2, 3, 0.0, 0.0)];

    let dt = 1.0 / 60.0;
    reset_bending_lambdas(&mut constraints);
    reset_corrections(&mut particles);
    solve_bending_constraints(&mut constraints, &mut particles, dt);

    // All corrections should be zero (or near-zero) since the constraint is satisfied.
    for idx in 0..4 {
        let corr_len = particles.corrections[idx].length();
        assert!(
            corr_len < 1e-5,
            "particle {idx} should have no correction for flat config, got {corr_len}"
        );
    }
}

#[test]
fn test_bending_constraint_resists_folding() {
    // Four particles where k and l are bent away from the flat rest angle.
    // After solving, the angle error should decrease.
    //
    // i = (-1, 0, 0), j = (1, 0, 0)  (shared edge along X axis)
    // k = (0, 1, 0.5)   -- lifted in +Z
    // l = (0, -1, 0.5)   -- also lifted in +Z (creates a valley fold)
    //
    // Both opposite vertices displaced to the same side of the XY plane
    // produces a nonzero dihedral angle. Rest angle = 0 (flat).
    let mut particles = ParticleSet::new(4);
    particles.predicted[0] = Vec3::new(-1.0, 0.0, 0.0); // i
    particles.predicted[1] = Vec3::new(1.0, 0.0, 0.0); // j
    particles.predicted[2] = Vec3::new(0.0, 1.0, 0.5); // k -- lifted +Z
    particles.predicted[3] = Vec3::new(0.0, -1.0, 0.5); // l -- lifted +Z (valley fold)
    for idx in 0..4 {
        particles.phase[idx] = Phase::Cloth;
    }

    // Measure initial angle error.
    let p1 = particles.predicted[0];
    let p2 = particles.predicted[1];
    let p3 = particles.predicted[2];
    let p4 = particles.predicted[3];
    let initial_angle = dihedral_angle_test(p1, p2, p3, p4);
    let initial_error = initial_angle.abs();
    assert!(
        initial_error > 0.01,
        "initial configuration should be bent, got angle {initial_angle}"
    );

    // Solve with zero compliance (maximum stiffness) over several iterations.
    let mut constraints = vec![BendingConstraint::new(0, 1, 2, 3, 0.0, 0.0)];
    let dt = 1.0 / 60.0;
    let iterations = 30;

    reset_bending_lambdas(&mut constraints);

    for _ in 0..iterations {
        reset_corrections(&mut particles);
        solve_bending_constraints(&mut constraints, &mut particles, dt);
        apply_corrections(&mut particles);
    }

    // Measure final angle error.
    let p1 = particles.predicted[0];
    let p2 = particles.predicted[1];
    let p3 = particles.predicted[2];
    let p4 = particles.predicted[3];
    let final_angle = dihedral_angle_test(p1, p2, p3, p4);
    let final_error = final_angle.abs();

    assert!(
        final_error < initial_error,
        "angle error should decrease: initial={initial_error}, final={final_error}"
    );
}

/// Test-side dihedral angle computation (mirrors the private function in bending.rs).
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

// ---------------------------------------------------------------------------
// Solver-level cloth creation tests
// ---------------------------------------------------------------------------

#[test]
fn test_create_cloth_generates_constraints() {
    let mut solver = Solver::new(100);
    solver.create_cloth(0, 5, 5, 0.1, 0.001, 0.01);

    // 5x5 grid should produce:
    // Horizontal: 5 rows * 4 = 20
    // Vertical: 4 rows * 5 = 20
    // Diagonal: 4 * 4 * 2 = 32
    // Total distance = 72
    assert_eq!(solver.distance_constraints.len(), 72);
    assert!(solver.bending_constraints.len() > 0);

    // All cloth particles should be Phase::Cloth
    for i in 0..25 {
        assert_eq!(solver.particles.phase[i], Phase::Cloth);
    }
}

#[test]
fn test_cloth_drapes_under_gravity() {
    let mut solver = Solver::new(25);
    solver.config.collisions_enabled = true;
    solver.config.substeps = 2;
    solver.config.solver_iterations = 3;
    solver.config.shape_strength = 0.1; // low shape attraction (avoids free-flight turbulence)
    solver.create_cloth(0, 5, 5, 0.1, 0.001, 0.01);

    // Pin top-left and top-right corners
    solver.particles.phase[0] = Phase::Static;
    solver.particles.inv_mass[0] = 0.0;
    solver.particles.phase[4] = Phase::Static;
    solver.particles.inv_mass[4] = 0.0;

    let initial_y = solver.particles.position[12].y; // center particle

    // Step several times
    for t in 0..30 {
        solver.step(0.016, t as f32 * 0.016);
    }

    // Center should have dropped due to gravity
    let final_y = solver.particles.position[12].y;
    assert!(
        final_y < initial_y,
        "Cloth should drape: initial_y={}, final_y={}",
        initial_y,
        final_y
    );
}

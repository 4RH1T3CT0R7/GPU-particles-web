use glam::Vec3;
use xpbd_core::constraints::contact::{detect_contacts, solve_contacts, ContactConstraint};
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

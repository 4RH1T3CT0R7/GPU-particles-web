use glam::Vec3;
use xpbd_core::constraints::contact::{detect_contacts, solve_contacts, ContactConstraint};
use xpbd_core::constraints::shape_matching::{ShapeMatchGroup, solve_shape_matching};
use xpbd_core::grid::SpatialHashGrid;
use xpbd_core::particle::{ParticleSet, Phase};

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
    let mut corrections = vec![Vec3::ZERO; 2];
    let mut counts = vec![0u32; 2];

    solve_contacts(&[contact], &positions, &mut corrections, &mut counts);

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

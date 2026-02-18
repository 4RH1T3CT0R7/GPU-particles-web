use glam::Vec3;
use xpbd_core::constraints::contact::{detect_contacts, solve_contacts, ContactConstraint};
use xpbd_core::grid::SpatialHashGrid;

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

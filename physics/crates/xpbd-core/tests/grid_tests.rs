use glam::Vec3;
use xpbd_core::grid::SpatialHashGrid;

#[test]
fn test_grid_build_and_query() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);

    // Place 3 particles: two close, one far
    let positions = vec![
        Vec3::new(0.1, 0.1, 0.1),
        Vec3::new(0.2, 0.2, 0.2),
        Vec3::new(10.0, 10.0, 10.0),
    ];

    grid.build(&positions, 3);

    // Query around first particle — should find both nearby particles
    let mut neighbors = Vec::new();
    grid.query_neighbors(positions[0], |idx| neighbors.push(idx));

    assert!(neighbors.contains(&0), "should find self");
    assert!(neighbors.contains(&1), "should find nearby particle");
    assert!(!neighbors.contains(&2), "should NOT find far particle");
}

#[test]
fn test_grid_all_particles_found() {
    let mut grid = SpatialHashGrid::new(0.2, 131072, 1000);

    // Scatter particles randomly in a sphere
    let mut positions = Vec::new();
    for i in 0..1000 {
        let t = i as f32 / 1000.0;
        let angle = t * std::f32::consts::TAU * 20.0;
        let r = 0.5 + t * 2.0;
        positions.push(Vec3::new(
            angle.cos() * r,
            (t - 0.5) * 3.0,
            angle.sin() * r,
        ));
    }

    grid.build(&positions, 1000);

    // Every particle should be found when querying its own cell
    for i in 0..1000 {
        let mut found_self = false;
        grid.query_neighbors(positions[i], |idx| {
            if idx == i as u32 {
                found_self = true;
            }
        });
        assert!(found_self, "particle {} not found in its own cell query", i);
    }
}

#[test]
fn test_grid_empty() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);
    let positions: Vec<Vec3> = vec![];
    grid.build(&positions, 0);

    let mut count = 0;
    grid.query_neighbors(Vec3::ZERO, |_| count += 1);
    assert_eq!(count, 0);
}

#[test]
fn test_grid_rebuild() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);

    // Build with one layout
    let pos1 = vec![Vec3::new(0.0, 0.0, 0.0), Vec3::new(5.0, 5.0, 5.0)];
    grid.build(&pos1, 2);

    // Rebuild with different layout
    let pos2 = vec![Vec3::new(5.0, 5.0, 5.0), Vec3::new(0.0, 0.0, 0.0)];
    grid.build(&pos2, 2);

    let mut neighbors = Vec::new();
    grid.query_neighbors(Vec3::ZERO, |idx| neighbors.push(idx));
    assert!(
        neighbors.contains(&1),
        "should find particle 1 at origin after rebuild"
    );
}

#[test]
fn test_grid_negative_positions() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);

    let positions = vec![
        Vec3::new(-1.0, -1.0, -1.0),
        Vec3::new(-0.9, -1.0, -1.0),
        Vec3::new(5.0, 5.0, 5.0),
    ];

    grid.build(&positions, 3);

    let mut neighbors = Vec::new();
    grid.query_neighbors(Vec3::new(-1.0, -1.0, -1.0), |idx| neighbors.push(idx));

    assert!(
        neighbors.contains(&0),
        "should find particle 0 at negative position"
    );
    assert!(
        neighbors.contains(&1),
        "should find nearby particle 1 at negative position"
    );
    assert!(
        !neighbors.contains(&2),
        "should NOT find distant particle 2"
    );
}

#[test]
fn test_grid_large_positions() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);

    let positions = vec![Vec3::new(1000.0, 1000.0, 1000.0)];

    grid.build(&positions, 1);

    let mut neighbors = Vec::new();
    grid.query_neighbors(Vec3::new(1000.0, 1000.0, 1000.0), |idx| {
        neighbors.push(idx);
    });

    assert!(
        neighbors.contains(&0),
        "should find particle 0 at large position"
    );
}

#[test]
fn test_grid_single_particle() {
    let mut grid = SpatialHashGrid::new(1.0, 1024, 100);

    let positions = vec![Vec3::new(0.0, 0.0, 0.0)];

    grid.build(&positions, 1);

    let mut neighbors = Vec::new();
    grid.query_neighbors(Vec3::ZERO, |idx| neighbors.push(idx));

    assert!(
        neighbors.contains(&0),
        "should find single particle at origin"
    );
}

use xpbd_core::solver::Solver;

#[test]
fn test_particles_move_toward_sphere() {
    let mut solver = Solver::new(100);
    solver.shape_params.shape_a = 1; // sphere
    solver.shape_params.shape_b = 1; // sphere
    solver.config.shape_strength = 0.9;

    for step in 0..200 {
        solver.step(0.016, step as f32 * 0.016);
    }

    let avg_dist: f32 = (0..solver.particles.count)
        .map(|i| solver.particles.position[i].length())
        .sum::<f32>()
        / solver.particles.count as f32;

    assert!(
        avg_dist > 0.3 && avg_dist < 1.5,
        "avg distance from origin: {} (expected ~0.7 for sphere)",
        avg_dist
    );
}

#[test]
fn test_boundary_containment() {
    let mut solver = Solver::new(100);
    solver.config.shape_strength = 0.0;
    solver.config.boundary_radius = 4.5;

    for step in 0..500 {
        solver.step(0.016, step as f32 * 0.016);
    }

    for i in 0..solver.particles.count {
        let dist = solver.particles.position[i].length();
        assert!(dist < 8.0, "particle {} escaped: dist={}", i, dist);
    }
}

#[test]
fn test_velocity_cap() {
    let mut solver = Solver::new(10);
    solver.config.shape_strength = 0.0;
    solver.particles.velocity[0] = glam::Vec3::new(100.0, 0.0, 0.0);

    solver.step(0.016, 0.0);

    let speed = solver.particles.velocity[0].length();
    assert!(speed <= 18.1, "velocity cap failed: speed={}", speed);
}

#[test]
fn test_no_nan_after_stepping() {
    let mut solver = Solver::new(1000);
    solver.config.shape_strength = 0.85;
    solver.shape_params.shape_a = 2; // torus
    solver.shape_params.shape_b = 11; // fractal

    for step in 0..100 {
        solver.step(0.016, step as f32 * 0.016);
    }

    for i in 0..solver.particles.count {
        let p = solver.particles.position[i];
        let v = solver.particles.velocity[i];
        assert!(
            !p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
            "NaN position at particle {}",
            i
        );
        assert!(
            !v.x.is_nan() && !v.y.is_nan() && !v.z.is_nan(),
            "NaN velocity at particle {}",
            i
        );
    }
}

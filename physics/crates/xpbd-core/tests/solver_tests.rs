use glam::Vec3;
use xpbd_core::forces::pointer::PointerParams;
use xpbd_core::particle::Phase;
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
        avg_dist > 0.4 && avg_dist < 1.2,
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
        assert!(dist < 5.5, "particle {} escaped: dist={}", i, dist);
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

#[test]
fn test_attract_moves_toward_pointer() {
    let mut solver = Solver::new(10);
    solver.config.shape_strength = 0.0;
    solver.pointer_params = PointerParams {
        active: true,
        mode: 0,
        position: Vec3::new(2.0, 0.0, 0.0),
        strength: 1.0,
        radius: 5.0,
        pressing: true,
        pulse: false,
        view_dir: Vec3::NEG_Z,
    };
    solver.particles.position[0] = Vec3::ZERO;
    solver.particles.velocity[0] = Vec3::ZERO;

    for _ in 0..50 {
        solver.step(0.016, 1.0);
    }

    assert!(
        solver.particles.position[0].x > 0.1,
        "particle didn't move toward pointer: {:?}",
        solver.particles.position[0]
    );
}

#[test]
fn test_repel_pushes_away() {
    let mut solver = Solver::new(10);
    solver.config.shape_strength = 0.0;
    solver.pointer_params = PointerParams {
        active: true,
        mode: 1,
        position: Vec3::new(2.0, 0.0, 0.0),
        strength: 1.0,
        radius: 5.0,
        pressing: true,
        pulse: false,
        view_dir: Vec3::NEG_Z,
    };
    solver.particles.position[0] = Vec3::new(1.0, 0.0, 0.0);
    solver.particles.velocity[0] = Vec3::ZERO;

    for _ in 0..50 {
        solver.step(0.016, 1.0);
    }

    // Should have moved away from pointer (x < 1.0)
    assert!(
        solver.particles.position[0].x < 0.5,
        "particle didn't move away from pointer: {:?}",
        solver.particles.position[0]
    );
}

#[test]
fn test_collisions_push_apart() {
    let mut solver = Solver::new(2);
    solver.config.shape_strength = 0.0;
    solver.config.collisions_enabled = true;
    solver.config.substeps = 1;
    solver.config.solver_iterations = 3;

    // Place two particles overlapping
    solver.particles.position[0] = Vec3::new(0.0, 0.0, 0.0);
    solver.particles.position[1] = Vec3::new(0.05, 0.0, 0.0);
    solver.particles.velocity[0] = Vec3::ZERO;
    solver.particles.velocity[1] = Vec3::ZERO;
    solver.particles.radius[0] = 0.05;
    solver.particles.radius[1] = 0.05;
    solver.particles.hash[0] = 0.5;
    solver.particles.hash[1] = 0.6;

    solver.step(0.016, 1.0);

    // After collision resolution, particles should be pushed apart
    let dist = (solver.particles.position[1] - solver.particles.position[0]).length();
    assert!(dist > 0.08, "particles should be pushed apart: dist={}", dist);
}

#[test]
fn test_fluid_particles_get_density_corrections() {
    // Create a solver with collisions enabled
    let mut solver = Solver::new(8);
    solver.config.collisions_enabled = true;
    solver.config.substeps = 1;
    solver.config.solver_iterations = 1;

    // Set all particles to Fluid phase, place in a tight cluster
    for i in 0..8 {
        solver.particles.phase[i] = Phase::Fluid;
        let x = (i % 2) as f32 * 0.05;
        let y = ((i / 2) % 2) as f32 * 0.05;
        let z = (i / 4) as f32 * 0.05;
        solver.particles.position[i] = Vec3::new(x, y, z);
    }

    solver.step(0.016, 0.0);

    // Verify particles moved (corrections were applied)
    let mut any_moved = false;
    for i in 0..8 {
        let pos = solver.particles.position[i];
        let orig_x = (i % 2) as f32 * 0.05;
        let orig_y = ((i / 2) % 2) as f32 * 0.05;
        let orig_z = (i / 4) as f32 * 0.05;
        let orig = Vec3::new(orig_x, orig_y, orig_z);
        if (pos - orig).length() > 0.001 {
            any_moved = true;
        }
    }
    assert!(any_moved, "Fluid particles should have moved due to density corrections");
}

// ---------------------------------------------------------------------------
// Solver integration paths
// ---------------------------------------------------------------------------

#[test]
fn test_zero_dt_no_change() {
    let mut solver = Solver::new(50);

    // Save all positions before the step
    let saved: Vec<Vec3> = solver.particles.position[..solver.particles.count]
        .to_vec();

    solver.step(0.0, 0.0);

    for i in 0..solver.particles.count {
        assert_eq!(
            solver.particles.position[i], saved[i],
            "particle {} moved with dt=0: {:?} -> {:?}",
            i, saved[i], solver.particles.position[i]
        );
    }
}

#[test]
fn test_nbody_gravity_through_solver() {
    let mut solver = Solver::new(2);
    solver.config.collisions_enabled = true;
    solver.config.nbody_enabled = true;
    solver.config.nbody_g = 1.0;
    solver.config.shape_strength = 0.0;

    solver.particles.position[0] = Vec3::new(-1.0, 0.0, 0.0);
    solver.particles.position[1] = Vec3::new(1.0, 0.0, 0.0);
    solver.particles.velocity[0] = Vec3::ZERO;
    solver.particles.velocity[1] = Vec3::ZERO;

    let initial_dist = (solver.particles.position[1] - solver.particles.position[0]).length();

    for step in 0..10 {
        solver.step(0.016, step as f32 * 0.016);
    }

    let final_dist = (solver.particles.position[1] - solver.particles.position[0]).length();
    assert!(
        final_dist < initial_dist,
        "n-body gravity should pull particles closer: initial={}, final={}",
        initial_dist,
        final_dist
    );
}

#[test]
fn test_em_forces_through_solver() {
    let mut solver = Solver::new(2);
    solver.config.collisions_enabled = true;
    solver.config.em_enabled = true;
    solver.config.em_coulomb_k = 10.0;
    solver.config.shape_strength = 0.0;

    // Like charges repel
    solver.particles.charge[0] = 1.0;
    solver.particles.charge[1] = 1.0;
    solver.particles.position[0] = Vec3::new(-0.5, 0.0, 0.0);
    solver.particles.position[1] = Vec3::new(0.5, 0.0, 0.0);
    solver.particles.velocity[0] = Vec3::ZERO;
    solver.particles.velocity[1] = Vec3::ZERO;

    let initial_dist = (solver.particles.position[1] - solver.particles.position[0]).length();

    for step in 0..10 {
        solver.step(0.016, step as f32 * 0.016);
    }

    let final_dist = (solver.particles.position[1] - solver.particles.position[0]).length();
    assert!(
        final_dist > initial_dist,
        "like charges should repel: initial={}, final={}",
        initial_dist,
        final_dist
    );
}

#[test]
fn test_static_particles_dont_move() {
    let mut solver = Solver::new(5);
    solver.config.collisions_enabled = true;
    solver.config.shape_strength = 0.0;

    // Set all particles to infinite mass (static)
    for i in 0..5 {
        solver.particles.inv_mass[i] = 0.0;
    }

    let saved: Vec<Vec3> = solver.particles.position[..5].to_vec();

    for step in 0..20 {
        solver.step(0.016, step as f32 * 0.016);
    }

    for i in 0..5 {
        assert_eq!(
            solver.particles.position[i], saved[i],
            "static particle {} should not move: {:?} -> {:?}",
            i, saved[i], solver.particles.position[i]
        );
    }
}

#[test]
fn test_free_flight_particles_spread() {
    let mut solver = Solver::new(50);
    solver.config.shape_strength = 0.0; // free-flight mode

    // Cluster all particles at origin
    for i in 0..50 {
        solver.particles.position[i] = Vec3::ZERO;
        solver.particles.velocity[i] = Vec3::ZERO;
    }

    let avg_dist_before: f32 = (0..50)
        .map(|i| solver.particles.position[i].length())
        .sum::<f32>()
        / 50.0;

    for step in 0..100 {
        solver.step(0.016, step as f32 * 0.016);
    }

    let avg_dist_after: f32 = (0..50)
        .map(|i| solver.particles.position[i].length())
        .sum::<f32>()
        / 50.0;

    assert!(
        avg_dist_after > avg_dist_before,
        "free-flight particles should spread: before={}, after={}",
        avg_dist_before,
        avg_dist_after
    );
}

#[test]
fn test_audio_equalizer_mode() {
    let mut solver = Solver::new(10);
    solver.shape_params.shape_a = 12; // equalizer mode
    solver.shape_params.audio_energy = 1.0;
    solver.shape_params.audio_bass = 0.8;

    let saved: Vec<Vec3> = solver.particles.position[..10].to_vec();

    for step in 0..20 {
        solver.step(0.016, step as f32 * 0.016);
    }

    let any_moved = (0..10).any(|i| {
        (solver.particles.position[i] - saved[i]).length() > 1e-6
    });
    assert!(any_moved, "audio equalizer mode should move particles");
}

// ---------------------------------------------------------------------------
// Solver utilities
// ---------------------------------------------------------------------------

#[test]
fn test_clear_constraints_resets_phase() {
    let mut solver = Solver::new(20);

    // Create a 4x4 cloth from particles 0..16
    solver.create_cloth(0, 4, 4, 0.1, 0.001, 0.01);
    // Create a rigid body from particles 16..20
    solver.create_rigid_body(16, 4, 0.9);

    // Verify some phases are Cloth/Rigid
    let has_cloth = solver.particles.phase[..16].iter().any(|p| *p == Phase::Cloth);
    let has_rigid = solver.particles.phase[16..20].iter().any(|p| *p == Phase::Rigid);
    assert!(has_cloth, "should have Cloth particles after create_cloth");
    assert!(has_rigid, "should have Rigid particles after create_rigid_body");

    solver.clear_constraints();

    // All phases should be Free
    for i in 0..20 {
        assert_eq!(
            solver.particles.phase[i],
            Phase::Free,
            "particle {} should be Phase::Free after clear_constraints, got {:?}",
            i,
            solver.particles.phase[i]
        );
    }
    assert!(
        solver.distance_constraints.is_empty(),
        "distance_constraints should be empty after clear_constraints"
    );
    assert!(
        solver.bending_constraints.is_empty(),
        "bending_constraints should be empty after clear_constraints"
    );
    assert!(
        solver.shape_match_groups.is_empty(),
        "shape_match_groups should be empty after clear_constraints"
    );
}

#[test]
fn test_reinitialize_resets_positions() {
    let mut solver = Solver::new(10);

    // Corrupt all particle state
    for i in 0..10 {
        solver.particles.position[i] = Vec3::new(999.0, 999.0, 999.0);
        solver.particles.velocity[i] = Vec3::new(50.0, 50.0, 50.0);
        solver.particles.inv_mass[i] = 0.0;
    }

    solver.reinitialize(0);

    for i in 0..10 {
        assert_ne!(
            solver.particles.position[i],
            Vec3::new(999.0, 999.0, 999.0),
            "particle {} position should be reset after reinitialize",
            i
        );
        assert_eq!(
            solver.particles.velocity[i],
            Vec3::ZERO,
            "particle {} velocity should be zero after reinitialize",
            i
        );
        assert_eq!(
            solver.particles.inv_mass[i],
            1.0,
            "particle {} inv_mass should be 1.0 after reinitialize",
            i
        );
    }
}

#[test]
fn test_create_cloth_overflow_guard() {
    let mut solver = Solver::new(20);
    // 15 + 3*3 = 24 > 20, should early return
    solver.create_cloth(15, 3, 3, 0.1, 0.001, 0.01);
    assert!(solver.distance_constraints.is_empty(),
        "Overflow should prevent cloth creation");
    for i in 0..20 {
        assert_eq!(solver.particles.phase[i], Phase::Free,
            "Overflow should not change phases");
    }
}

#[test]
fn test_create_rigid_body_overflow_guard() {
    let mut solver = Solver::new(10);
    solver.create_rigid_body(8, 5, 0.9); // 8+5=13 > 10
    assert!(solver.shape_match_groups.is_empty(),
        "Overflow should prevent rigid body creation");
    for i in 0..10 {
        assert_eq!(solver.particles.phase[i], Phase::Free);
    }
}

#[test]
fn test_speed_multiplier_affects_motion() {
    // Normal speed
    let mut solver1 = Solver::new(5);
    solver1.config.shape_strength = 0.0;
    solver1.particles.position[0] = Vec3::ZERO;
    solver1.particles.velocity[0] = Vec3::new(1.0, 0.0, 0.0);
    solver1.shape_params.speed_multiplier = 1.0;
    solver1.step(0.016, 0.0);
    let pos1 = solver1.particles.position[0];

    // Double speed
    let mut solver2 = Solver::new(5);
    solver2.config.shape_strength = 0.0;
    solver2.particles.position[0] = Vec3::ZERO;
    solver2.particles.velocity[0] = Vec3::new(1.0, 0.0, 0.0);
    solver2.shape_params.speed_multiplier = 2.0;
    solver2.step(0.016, 0.0);
    let pos2 = solver2.particles.position[0];

    // Double speed should move further in X
    assert!(pos2.x > pos1.x * 1.3,
        "2x speed should move further: pos1.x={}, pos2.x={}", pos1.x, pos2.x);
}

#[test]
fn test_morph_blending_differs() {
    let mut solver_a = Solver::new(10);
    solver_a.shape_params.shape_a = 0; // cube
    solver_a.shape_params.shape_b = 1; // sphere
    solver_a.shape_params.morph = 0.0;
    solver_a.config.shape_strength = 0.9;
    solver_a.step(0.016, 1.0);
    let targets_a: Vec<Vec3> = solver_a.particles.target_pos[..10].to_vec();

    let mut solver_b = Solver::new(10);
    solver_b.shape_params.shape_a = 0;
    solver_b.shape_params.shape_b = 1;
    solver_b.shape_params.morph = 1.0;
    solver_b.config.shape_strength = 0.9;
    solver_b.step(0.016, 1.0);
    let targets_b: Vec<Vec3> = solver_b.particles.target_pos[..10].to_vec();

    // morph=0 vs morph=1 should produce different targets
    let mut diff_count = 0;
    for i in 0..10 {
        if (targets_a[i] - targets_b[i]).length() > 0.01 {
            diff_count += 1;
        }
    }
    assert!(diff_count > 3, "morph=0 vs morph=1 should produce different targets: {} differ", diff_count);
}

#[test]
fn test_combined_xpbd_all_constraints() {
    // Test that all constraint types coexist without NaN or panic
    let mut solver = Solver::new(50);
    solver.config.collisions_enabled = true;
    solver.config.substeps = 2;
    solver.config.solver_iterations = 2;
    solver.config.shape_strength = 0.5;
    solver.config.nbody_enabled = true;
    solver.config.nbody_g = 0.001;
    solver.config.em_enabled = true;
    solver.config.em_coulomb_k = 0.1;

    // Cloth patch (first 16 particles)
    solver.create_cloth(0, 4, 4, 0.2, 0.001, 0.01);

    // Rigid body (particles 16-19)
    solver.particles.position[16] = Vec3::new(2.0, 0.0, 0.0);
    solver.particles.position[17] = Vec3::new(2.5, 0.0, 0.0);
    solver.particles.position[18] = Vec3::new(2.5, 0.5, 0.0);
    solver.particles.position[19] = Vec3::new(2.0, 0.5, 0.0);
    solver.create_rigid_body(16, 4, 0.9);

    // Some fluid particles
    for i in 20..30 {
        solver.particles.phase[i] = Phase::Fluid;
        solver.particles.position[i] = Vec3::new(-1.0 + (i - 20) as f32 * 0.05, 0.0, 0.0);
    }

    // Some charged particles
    for i in 30..35 {
        solver.particles.charge[i] = if i % 2 == 0 { 1.0 } else { -1.0 };
    }

    // Step several times
    for step in 0..20 {
        solver.step(1.0 / 60.0, step as f32 / 60.0);
    }

    // Verify no NaN
    for i in 0..50 {
        let p = solver.particles.position[i];
        let v = solver.particles.velocity[i];
        assert!(!p.x.is_nan() && !p.y.is_nan() && !p.z.is_nan(),
            "NaN position at particle {}", i);
        assert!(!v.x.is_nan() && !v.y.is_nan() && !v.z.is_nan(),
            "NaN velocity at particle {}", i);
    }
}

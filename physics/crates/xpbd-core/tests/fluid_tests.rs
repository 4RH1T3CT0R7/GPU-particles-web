use glam::Vec3;
use std::f32::consts::PI;
use xpbd_core::constraints::density::solve_density_constraints;
use xpbd_core::fluids::{poly6_kernel, spiky_gradient};
use xpbd_core::fluids::viscosity::apply_xsph_viscosity;
use xpbd_core::fluids::vorticity::apply_vorticity_confinement;
use xpbd_core::grid::SpatialHashGrid;
use xpbd_core::particle::{ParticleSet, Phase};

#[test]
fn test_poly6_kernel_zero_distance() {
    let h = 0.1_f32;
    let result = poly6_kernel(0.0, h);
    let h9 = h.powi(9);
    let expected = 315.0 / (64.0 * PI * h9);
    // At r=0 the (h^2 - r^2)^3 term equals h^6, so peak = coeff * h^6
    let peak = expected * h.powi(6);
    assert!(
        (result - peak).abs() < peak * 1e-5,
        "poly6(0, {h}) = {result}, expected {peak}"
    );
}

#[test]
fn test_poly6_kernel_at_boundary() {
    let h = 0.1_f32;
    let result = poly6_kernel(h, h);
    assert_eq!(result, 0.0, "poly6(h, h) should be 0.0");
}

#[test]
fn test_poly6_kernel_beyond_boundary() {
    let h = 0.1_f32;
    let result = poly6_kernel(h + 0.01, h);
    assert_eq!(result, 0.0, "poly6(h+0.01, h) should be 0.0");
}

#[test]
fn test_poly6_kernel_midpoint() {
    let h = 0.1_f32;
    let mid = poly6_kernel(h / 2.0, h);
    let h9 = h.powi(9);
    let peak = 315.0 / (64.0 * PI * h9) * h.powi(6);
    assert!(mid > 0.0, "poly6(h/2, h) should be positive");
    assert!(mid < peak, "poly6(h/2, h) should be less than peak");
}

#[test]
fn test_spiky_gradient_zero_distance() {
    let r = Vec3::new(1e-7, 0.0, 0.0);
    let r_len = r.length();
    let result = spiky_gradient(r, r_len, 0.1);
    assert_eq!(result, Vec3::ZERO, "spiky_gradient with near-zero r_len should return ZERO");
}

#[test]
fn test_spiky_gradient_at_boundary() {
    let h = 0.1_f32;
    let r = Vec3::new(h, 0.0, 0.0);
    let result = spiky_gradient(r, h, h);
    assert_eq!(result, Vec3::ZERO, "spiky_gradient at boundary should return ZERO");
}

#[test]
fn test_spiky_gradient_direction() {
    let h = 0.1_f32;
    let r = Vec3::new(0.05, 0.0, 0.0);
    let r_len = r.length();
    let grad = spiky_gradient(r, r_len, h);

    // The coefficient -45/(PI*h^6) is negative, so the gradient points
    // opposite to r (toward the neighbor). The x component should be negative
    // since r points in +x and the coefficient is negative.
    assert!(
        grad.x < 0.0,
        "gradient x should be negative (pointing toward neighbor), got {}",
        grad.x
    );
    assert!(
        grad.y.abs() < 1e-10,
        "gradient y should be ~0, got {}",
        grad.y
    );
    assert!(
        grad.z.abs() < 1e-10,
        "gradient z should be ~0, got {}",
        grad.z
    );
}

// ---------------------------------------------------------------------------
// Density constraint tests
// ---------------------------------------------------------------------------

/// Place 27 fluid particles in a tight 3x3x3 grid within smoothing radius.
/// After one density solve pass, every particle should have a non-zero density.
#[test]
fn test_density_constraint_uniform_density() {
    let h = 0.2_f32;
    let spacing = h * 0.4; // well within smoothing radius
    let rest_density = 1000.0_f32;

    // 3x3x3 grid of fluid particles
    let n = 3_usize;
    let count = n * n * n; // 27
    let mut particles = ParticleSet::new(count);

    let mut idx = 0;
    for ix in 0..n {
        for iy in 0..n {
            for iz in 0..n {
                let pos = Vec3::new(
                    ix as f32 * spacing,
                    iy as f32 * spacing,
                    iz as f32 * spacing,
                );
                particles.predicted[idx] = pos;
                particles.position[idx] = pos;
                particles.phase[idx] = Phase::Fluid;
                idx += 1;
            }
        }
    }

    // Build spatial grid (cell_size >= smoothing radius)
    let mut grid = SpatialHashGrid::new(h, 1024, count);
    grid.build(&particles.predicted, count);

    // Run density constraint solver
    solve_density_constraints(&mut particles, &grid, rest_density, h, false);

    // Every fluid particle should have received a non-zero density value
    for i in 0..count {
        assert!(
            particles.density[i] > 0.0,
            "particle {} should have non-zero density, got {}",
            i,
            particles.density[i]
        );
    }
}

/// Place overlapping fluid particles and verify that density constraints
/// produce non-zero position corrections that push particles apart.
#[test]
fn test_density_constraint_generates_corrections() {
    let h = 0.2_f32;
    let rest_density = 1000.0_f32;

    // Place 8 particles very close together so density > rest_density
    let count = 8_usize;
    let mut particles = ParticleSet::new(count);

    let spacing = h * 0.15; // very tight packing
    let mut idx = 0;
    for ix in 0..2_usize {
        for iy in 0..2_usize {
            for iz in 0..2_usize {
                let pos = Vec3::new(
                    ix as f32 * spacing,
                    iy as f32 * spacing,
                    iz as f32 * spacing,
                );
                particles.predicted[idx] = pos;
                particles.position[idx] = pos;
                particles.phase[idx] = Phase::Fluid;
                idx += 1;
            }
        }
    }

    let mut grid = SpatialHashGrid::new(h, 1024, count);
    grid.build(&particles.predicted, count);

    // Zero out corrections before solve
    for i in 0..count {
        particles.corrections[i] = Vec3::ZERO;
        particles.correction_counts[i] = 0;
    }

    solve_density_constraints(&mut particles, &grid, rest_density, h, true);

    // At least some particles should have non-zero corrections
    let has_corrections = (0..count).any(|i| particles.corrections[i].length() > 0.0);
    assert!(
        has_corrections,
        "overlapping fluid particles should receive non-zero position corrections"
    );

    // Every fluid particle should have been processed (correction_count > 0)
    for i in 0..count {
        assert!(
            particles.correction_counts[i] > 0,
            "particle {} should have correction_count > 0",
            i
        );
    }
}

// ---------------------------------------------------------------------------
// XSPH viscosity tests
// ---------------------------------------------------------------------------

/// Place two fluid particles close together with opposing velocities.
/// After applying XSPH viscosity, their velocities should be closer to each
/// other (the difference should shrink).
#[test]
fn test_xsph_viscosity_smooths_velocities() {
    let h = 0.2_f32;
    let count = 2_usize;
    let mut particles = ParticleSet::new(count);

    // Particle 0 at origin moving right
    particles.predicted[0] = Vec3::new(0.0, 0.0, 0.0);
    particles.velocity[0] = Vec3::new(1.0, 0.0, 0.0);
    particles.phase[0] = Phase::Fluid;
    particles.density[0] = 1000.0;

    // Particle 1 nearby moving left
    particles.predicted[1] = Vec3::new(0.05, 0.0, 0.0);
    particles.velocity[1] = Vec3::new(-1.0, 0.0, 0.0);
    particles.phase[1] = Phase::Fluid;
    particles.density[1] = 1000.0;

    let vel_diff_before = (particles.velocity[0] - particles.velocity[1]).length();

    let mut grid = SpatialHashGrid::new(h, 1024, count);
    grid.build(&particles.predicted, count);

    apply_xsph_viscosity(&mut particles, &grid, 0.1, h);

    let vel_diff_after = (particles.velocity[0] - particles.velocity[1]).length();

    assert!(
        vel_diff_after < vel_diff_before,
        "XSPH viscosity should reduce velocity difference: before={}, after={}",
        vel_diff_before,
        vel_diff_after
    );
}

// ---------------------------------------------------------------------------
// Vorticity confinement tests
// ---------------------------------------------------------------------------

/// Create several fluid particles with varied velocities and run vorticity
/// confinement. The output velocities must contain no NaN or Inf values.
#[test]
fn test_vorticity_confinement_no_crash() {
    let h = 0.2_f32;
    let n = 3_usize;
    let count = n * n * n; // 27
    let mut particles = ParticleSet::new(count);

    let spacing = h * 0.4;
    let mut idx = 0;
    for ix in 0..n {
        for iy in 0..n {
            for iz in 0..n {
                let pos = Vec3::new(
                    ix as f32 * spacing,
                    iy as f32 * spacing,
                    iz as f32 * spacing,
                );
                particles.predicted[idx] = pos;
                particles.position[idx] = pos;
                particles.phase[idx] = Phase::Fluid;
                particles.density[idx] = 1000.0;
                // Give each particle a slightly different velocity to create curl
                particles.velocity[idx] = Vec3::new(
                    iy as f32 * 0.5 - 0.5,
                    iz as f32 * 0.3 - 0.3,
                    ix as f32 * 0.2 - 0.2,
                );
                idx += 1;
            }
        }
    }

    let mut grid = SpatialHashGrid::new(h, 1024, count);
    grid.build(&particles.predicted, count);

    let dt = 1.0 / 60.0;
    apply_vorticity_confinement(&mut particles, &grid, 0.1, h, dt);

    for i in 0..count {
        let v = particles.velocity[i];
        assert!(
            v.x.is_finite() && v.y.is_finite() && v.z.is_finite(),
            "particle {} has non-finite velocity after vorticity confinement: {:?}",
            i,
            v
        );
    }
}

use glam::Vec3;
use xpbd_core::config::PhysicsConfig;
use xpbd_core::particle::{ParticleSet, Phase};

#[test]
fn test_particle_set_new_initializes_correctly() {
    let particles = ParticleSet::new(10);

    assert_eq!(particles.count, 10);

    for i in 0..10 {
        assert_eq!(particles.position[i], Vec3::ZERO, "position[{i}] should be ZERO");
        assert_eq!(particles.velocity[i], Vec3::ZERO, "velocity[{i}] should be ZERO");
        assert_eq!(particles.inv_mass[i], 1.0, "inv_mass[{i}] should be 1.0");
        assert_eq!(particles.phase[i], Phase::Free, "phase[{i}] should be Free");
        assert_eq!(particles.radius[i], 0.05, "radius[{i}] should be 0.05");
        assert_eq!(particles.hash[i], 0.0, "hash[{i}] should be 0.0");
        assert_eq!(particles.target_pos[i], Vec3::ZERO, "target_pos[{i}] should be ZERO");
        assert_eq!(particles.target_weight[i], 0.0, "target_weight[{i}] should be 0.0");
        assert_eq!(particles.predicted[i], Vec3::ZERO, "predicted[{i}] should be ZERO");
        assert_eq!(particles.corrections[i], Vec3::ZERO, "corrections[{i}] should be ZERO");
        assert_eq!(
            particles.correction_counts[i], 0,
            "correction_counts[{i}] should be 0"
        );
        assert_eq!(particles.lambda[i], 0.0, "lambda[{i}] should be 0.0");
        assert_eq!(particles.density[i], 0.0, "density[{i}] should be 0.0");
        assert_eq!(particles.vorticity[i], Vec3::ZERO, "vorticity[{i}] should be ZERO");
        assert_eq!(particles.charge[i], 0.0, "charge[{i}] should be 0.0");
    }
}

#[test]
fn test_particle_set_zero_count() {
    let particles = ParticleSet::new(0);

    assert_eq!(particles.count, 0);
    assert_eq!(particles.position.len(), 0);
    assert_eq!(particles.velocity.len(), 0);
    assert_eq!(particles.inv_mass.len(), 0);
    assert_eq!(particles.phase.len(), 0);
    assert_eq!(particles.radius.len(), 0);
    assert_eq!(particles.hash.len(), 0);
    assert_eq!(particles.target_pos.len(), 0);
    assert_eq!(particles.target_weight.len(), 0);
    assert_eq!(particles.predicted.len(), 0);
    assert_eq!(particles.corrections.len(), 0);
    assert_eq!(particles.correction_counts.len(), 0);
    assert_eq!(particles.lambda.len(), 0);
    assert_eq!(particles.density.len(), 0);
    assert_eq!(particles.vorticity.len(), 0);
    assert_eq!(particles.charge.len(), 0);
}

#[test]
fn test_config_default_values() {
    let config = PhysicsConfig::default();

    assert_eq!(config.substeps, 4);
    assert_eq!(config.solver_iterations, 3);
    assert_eq!(config.gravity, Vec3::new(0.0, -9.81, 0.0));
    assert_eq!(config.global_damping, 0.99);
    assert_eq!(config.max_velocity, 18.0);
    assert_eq!(config.boundary_radius, 4.5);
    assert_eq!(config.shape_strength, 0.85);
    assert_eq!(config.collisions_enabled, false);
    assert_eq!(config.fluid_rest_density, 1000.0);
    assert_eq!(config.fluid_viscosity, 0.01);
    assert_eq!(config.fluid_vorticity, 0.1);
    assert_eq!(config.smoothing_radius, 0.1);
    assert_eq!(config.tensile_correction, true);
    assert_eq!(config.cloth_stiffness, 0.001);
    assert_eq!(config.cloth_bending, 0.01);
    assert_eq!(config.friction, 0.3);
    assert_eq!(config.restitution, 0.2);
    assert_eq!(config.shape_matching_stiffness, 0.9);
    assert_eq!(config.grid_cell_size, 0.0);
    assert_eq!(config.grid_table_size, 131072);
    assert_eq!(config.shape_compliance_at_zero, 100.0);
    assert_eq!(config.shape_compliance_at_one, 0.0001);
    assert_eq!(config.boundary_stiffness, 100.0);
    assert_eq!(config.nbody_enabled, false);
    assert_eq!(config.nbody_g, 0.001);
    assert_eq!(config.nbody_softening, 0.01);
    assert_eq!(config.nbody_theta, 0.7);
    assert_eq!(config.em_enabled, false);
    assert_eq!(config.em_coulomb_k, 1.0);
    assert_eq!(config.em_magnetic_field, Vec3::ZERO);
}

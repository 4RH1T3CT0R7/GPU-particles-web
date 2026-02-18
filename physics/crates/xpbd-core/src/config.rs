use glam::Vec3;

pub struct PhysicsConfig {
    pub substeps: u32,
    pub solver_iterations: u32,
    pub gravity: Vec3,
    pub global_damping: f32,
    pub max_velocity: f32,
    pub boundary_radius: f32,
    pub shape_strength: f32,
    /// Enable particle-particle collision constraints (opt-in).
    /// When false, the solver uses the original integration path.
    pub collisions_enabled: bool,
    /// Rest density for fluid particles (rho_0, kg/m^3).
    pub fluid_rest_density: f32,
    /// XSPH viscosity coefficient for fluid smoothing.
    pub fluid_viscosity: f32,
    /// Vorticity confinement strength for fluid particles.
    pub fluid_vorticity: f32,
    /// SPH smoothing kernel radius h.
    pub smoothing_radius: f32,
    /// Enable Macklin tensile instability correction.
    pub tensile_correction: bool,
    /// Compliance for cloth distance constraints (lower = stiffer).
    pub cloth_stiffness: f32,
    /// Compliance for cloth bending constraints (lower = stiffer).
    pub cloth_bending: f32,
}

impl Default for PhysicsConfig {
    fn default() -> Self {
        Self {
            substeps: 4,
            solver_iterations: 3,
            gravity: Vec3::new(0.0, -9.81, 0.0),
            global_damping: 0.99,
            max_velocity: 18.0,
            boundary_radius: 4.5,
            shape_strength: 0.85,
            collisions_enabled: false,
            fluid_rest_density: 1000.0,
            fluid_viscosity: 0.01,
            fluid_vorticity: 0.1,
            smoothing_radius: 0.1,
            tensile_correction: true,
            cloth_stiffness: 0.001,
            cloth_bending: 0.01,
        }
    }
}

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
    /// Coulomb friction coefficient for contact constraints.
    pub friction: f32,
    /// Coefficient of restitution (bounciness) for contacts.
    pub restitution: f32,
    /// Shape matching stiffness for rigid bodies [0..1].
    pub shape_matching_stiffness: f32,
    /// Spatial hash grid cell size (0 = auto-compute from particle radius).
    pub grid_cell_size: f32,
    /// Spatial hash table size.
    pub grid_table_size: usize,
    /// XPBD compliance when shape_strength = 0 (very soft attraction).
    pub shape_compliance_at_zero: f32,
    /// XPBD compliance when shape_strength = 1 (near-rigid attraction).
    pub shape_compliance_at_one: f32,
    /// Boundary stiffness (how hard the boundary pushes back).
    pub boundary_stiffness: f32,
    /// Enable N-body gravitational interaction.
    pub nbody_enabled: bool,
    /// Gravitational constant for N-body.
    pub nbody_g: f32,
    /// Softening parameter to prevent singularity at r=0.
    pub nbody_softening: f32,
    /// Barnes-Hut opening angle. 0.0 = exact O(N^2), 0.7 = typical, higher = faster.
    pub nbody_theta: f32,
    /// Enable electromagnetic forces.
    pub em_enabled: bool,
    /// Coulomb electrostatic constant.
    pub em_coulomb_k: f32,
    /// External magnetic field vector for Lorentz force.
    pub em_magnetic_field: Vec3,
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
            friction: 0.3,
            restitution: 0.2,
            shape_matching_stiffness: 0.9,
            grid_cell_size: 0.0,
            grid_table_size: 131072,
            shape_compliance_at_zero: 100.0,
            shape_compliance_at_one: 0.0001,
            boundary_stiffness: 100.0,
            nbody_enabled: false,
            nbody_g: 0.001,
            nbody_softening: 0.01,
            nbody_theta: 0.7,
            em_enabled: false,
            em_coulomb_k: 1.0,
            em_magnetic_field: Vec3::ZERO,
        }
    }
}

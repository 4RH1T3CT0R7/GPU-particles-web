use glam::Vec3;

pub struct PhysicsConfig {
    pub substeps: u32,
    pub solver_iterations: u32,
    pub gravity: Vec3,
    pub global_damping: f32,
    pub max_velocity: f32,
    pub boundary_radius: f32,
    pub shape_strength: f32,
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
        }
    }
}

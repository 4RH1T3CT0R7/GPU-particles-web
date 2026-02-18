use glam::Vec3;

/// SoA particle storage
pub struct ParticleSet {
    pub count: usize,
    pub position: Vec<Vec3>,
    pub velocity: Vec<Vec3>,
    pub radius: Vec<f32>,
    pub hash: Vec<f32>,
}

impl ParticleSet {
    pub fn new(count: usize) -> Self {
        Self {
            count,
            position: vec![Vec3::ZERO; count],
            velocity: vec![Vec3::ZERO; count],
            radius: vec![0.05; count],
            hash: vec![0.0; count],
        }
    }
}

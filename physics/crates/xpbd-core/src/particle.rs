use glam::Vec3;

/// SoA particle storage
pub struct ParticleSet {
    pub count: usize,
    pub position: Vec<Vec3>,
    pub velocity: Vec<Vec3>,
    pub radius: Vec<f32>,
    pub hash: Vec<f32>,
    /// Morphing target position (computed each step from shape generators)
    pub target_pos: Vec<Vec3>,
    /// Per-particle affinity to shape [0..1]
    pub target_weight: Vec<f32>,
    // XPBD solver buffers
    /// Predicted positions for constraint solving
    pub predicted: Vec<Vec3>,
    /// Accumulated position corrections (Jacobi)
    pub corrections: Vec<Vec3>,
    /// Number of corrections per particle (for averaging)
    pub correction_counts: Vec<u32>,
}

impl ParticleSet {
    pub fn new(count: usize) -> Self {
        Self {
            count,
            position: vec![Vec3::ZERO; count],
            velocity: vec![Vec3::ZERO; count],
            radius: vec![0.05; count],
            hash: vec![0.0; count],
            target_pos: vec![Vec3::ZERO; count],
            target_weight: vec![0.0; count],
            predicted: vec![Vec3::ZERO; count],
            corrections: vec![Vec3::ZERO; count],
            correction_counts: vec![0u32; count],
        }
    }
}

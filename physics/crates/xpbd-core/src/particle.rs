use glam::Vec3;

/// Phase determines which constraint groups apply to this particle.
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Free     = 0, // No constraints, just forces (default visual mode)
    Fluid    = 1, // SPH/PBF density constraints
    Cloth    = 2, // Distance + bending constraints
    Rigid    = 3, // Shape matching constraints
    Granular = 4, // Friction-dominated contacts
    Gas      = 5, // Low-density fluid (smoke/fire)
    Static   = 6, // Infinite mass, immovable (boundary)
}

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
    /// Per-particle phase tag
    pub phase: Vec<Phase>,
    /// PBF Lagrange multiplier (fluid solver)
    pub lambda: Vec<f32>,
    /// Current SPH density estimate
    pub density: Vec<f32>,
    /// Vorticity vector for vorticity confinement
    pub vorticity: Vec<Vec3>,
    /// Per-particle electric charge for electromagnetic forces
    pub charge: Vec<f32>,
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
            phase: vec![Phase::Free; count],
            lambda: vec![0.0; count],
            density: vec![0.0; count],
            vorticity: vec![Vec3::ZERO; count],
            charge: vec![0.0; count],
        }
    }
}

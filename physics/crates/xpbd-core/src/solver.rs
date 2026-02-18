use crate::particle::ParticleSet;
use crate::config::PhysicsConfig;
use crate::math::hash12;
use glam::Vec3;

pub struct Solver {
    pub particles: ParticleSet,
    pub config: PhysicsConfig,
}

impl Solver {
    pub fn new(particle_count: usize) -> Self {
        let mut particles = ParticleSet::new(particle_count);

        // Initialize with spiral ring (matches existing init in index-webgpu.ts)
        let tex_size = (particle_count as f32).sqrt().ceil() as usize;
        for i in 0..particle_count {
            let t = i as f32 / particle_count as f32;
            let angle = t * std::f32::consts::TAU * 20.0;
            let r = 0.5 + t * 1.5;
            particles.position[i] = Vec3::new(
                angle.cos() * r,
                (t - 0.5) * 2.0,
                angle.sin() * r,
            );
            let ux = (i % tex_size) as f32 / tex_size as f32;
            let uy = (i / tex_size) as f32 / tex_size as f32;
            particles.radius[i] = 0.05 + hash12(ux, uy) * 0.05;
            particles.hash[i] = hash12(ux, uy);
        }

        Self {
            particles,
            config: PhysicsConfig::default(),
        }
    }

    /// Step physics. Currently a no-op stub.
    pub fn step(&mut self, _dt: f32, _time: f32) {
        // Phase 0: no-op — just output initial positions
    }
}

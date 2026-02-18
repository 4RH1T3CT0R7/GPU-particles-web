use glam::Vec3;
use crate::fluids::poly6_kernel;
use crate::particle::{ParticleSet, Phase};
use crate::grid::SpatialHashGrid;

/// Apply XSPH viscosity to fluid particle velocities.
///
/// XSPH smooths velocities by blending each particle's velocity toward
/// the weighted average of its neighbors' velocities. This produces
/// more coherent fluid motion.
///
/// Formula: v_i += c * sum_j { (v_j - v_i) * poly6(|x_i - x_j|, h) / rho_j }
/// where c = viscosity coefficient
///
/// This is a POST-velocity-update step (applied after positions are finalized
/// and velocities are computed from position change).
pub fn apply_xsph_viscosity(
    particles: &mut ParticleSet,
    grid: &SpatialHashGrid,
    viscosity: f32,
    smoothing_radius: f32,
) {
    let count = particles.count;
    let h = smoothing_radius;

    // Collect velocity corrections first, then apply (to avoid read/write conflict)
    let mut vel_corrections: Vec<Vec3> = vec![Vec3::ZERO; count];

    for i in 0..count {
        if particles.phase[i] != Phase::Fluid && particles.phase[i] != Phase::Gas {
            continue;
        }

        let pos_i = particles.predicted[i];
        let vel_i = particles.velocity[i];
        let mut correction = Vec3::ZERO;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            if j == i { return; }

            let r = pos_i - particles.predicted[j];
            let r_len = r.length();
            if r_len < h {
                let w = poly6_kernel(r_len, h);
                let rho_j = particles.density[j].max(1e-6);
                correction += (particles.velocity[j] - vel_i) * w / rho_j;
            }
        });

        vel_corrections[i] = correction * viscosity;
    }

    // Apply corrections (only to fluid/gas particles)
    for i in 0..count {
        if vel_corrections[i] != Vec3::ZERO {
            particles.velocity[i] += vel_corrections[i];
        }
    }
}

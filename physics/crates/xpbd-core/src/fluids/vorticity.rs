use glam::Vec3;
use crate::fluids::spiky_gradient;
use crate::particle::{ParticleSet, Phase};
use crate::grid::SpatialHashGrid;

/// Apply vorticity confinement to counteract numerical dissipation.
///
/// Two phases:
/// 1. Compute vorticity (curl of velocity field) at each fluid particle
/// 2. Apply corrective force in the direction of the vorticity gradient
///
/// This adds energy back into the simulation where the discrete solver
/// has lost it, producing more lively, swirling fluid motion.
pub fn apply_vorticity_confinement(
    particles: &mut ParticleSet,
    grid: &SpatialHashGrid,
    vorticity_strength: f32,
    smoothing_radius: f32,
    dt: f32,
) {
    let count = particles.count;
    let h = smoothing_radius;

    // Phase 1: Compute vorticity (curl of velocity field)
    for i in 0..count {
        if particles.phase[i] != Phase::Fluid && particles.phase[i] != Phase::Gas {
            continue;
        }

        let pos_i = particles.predicted[i];
        let vel_i = particles.velocity[i];
        let mut omega = Vec3::ZERO;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            if j == i { return; }
            if particles.phase[j] != Phase::Fluid && particles.phase[j] != Phase::Gas {
                return;
            }

            let r = pos_i - particles.predicted[j];
            let r_len = r.length();
            if r_len < h && r_len > 1e-6 {
                let vel_diff = particles.velocity[j] - vel_i;
                let grad = spiky_gradient(r, r_len, h);
                omega += vel_diff.cross(grad);
            }
        });

        particles.vorticity[i] = omega;
    }

    // Phase 2: Apply corrective force
    // f_vorticity = epsilon * (eta / |eta|) x omega
    // where eta = gradient of |omega|
    let mut forces: Vec<Vec3> = vec![Vec3::ZERO; count];

    for i in 0..count {
        if particles.phase[i] != Phase::Fluid && particles.phase[i] != Phase::Gas {
            continue;
        }

        let pos_i = particles.predicted[i];
        let omega_i = particles.vorticity[i];
        let omega_len = omega_i.length();
        if omega_len < 1e-6 { continue; }

        // Compute gradient of |omega| using SPH
        let mut eta = Vec3::ZERO;

        grid.query_neighbors(pos_i, |j| {
            let j = j as usize;
            if j == i { return; }
            if particles.phase[j] != Phase::Fluid && particles.phase[j] != Phase::Gas {
                return;
            }

            let r = pos_i - particles.predicted[j];
            let r_len = r.length();
            if r_len < h && r_len > 1e-6 {
                let grad = spiky_gradient(r, r_len, h);
                eta += particles.vorticity[j].length() * grad;
            }
        });

        let eta_len = eta.length();
        if eta_len < 1e-6 { continue; }

        let n = eta / eta_len;
        forces[i] = n.cross(omega_i) * vorticity_strength;
    }

    // Apply forces as velocity change
    for i in 0..count {
        particles.velocity[i] += forces[i] * dt;
    }
}

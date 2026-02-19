use glam::Vec3;

use crate::grid::SpatialHashGrid;

/// A detected contact between two particles
#[derive(Clone)]
pub struct ContactConstraint {
    pub i: u32,           // particle A index
    pub j: u32,           // particle B index
    pub normal: Vec3,     // contact normal (A->B, normalized)
    pub penetration: f32, // overlap depth (positive = overlapping)
}

/// Detect all particle-particle contacts using the spatial grid.
/// Returns a list of contacts where sphere-sphere overlap is detected.
pub fn detect_contacts(
    positions: &[Vec3],
    radii: &[f32],
    count: usize,
    grid: &SpatialHashGrid,
) -> Vec<ContactConstraint> {
    let mut contacts = Vec::new();

    for i in 0..count {
        grid.query_neighbors(positions[i], |j| {
            if j <= i as u32 {
                return; // avoid duplicate pairs + self
            }
            let diff = positions[j as usize] - positions[i];
            let dist = diff.length();
            let min_dist = radii[i] + radii[j as usize];
            if dist < min_dist && dist > 1e-8 {
                let normal = diff / dist;
                let penetration = min_dist - dist;
                contacts.push(ContactConstraint {
                    i: i as u32,
                    j,
                    normal,
                    penetration,
                });
            }
        });
    }

    contacts
}

/// Solve contact constraints using Jacobi-style position corrections.
/// Pushes overlapping particles apart proportionally to penetration depth.
/// Applies Coulomb friction to tangential relative velocity.
///
/// `corrections` and `correction_counts` are accumulation buffers (same length as positions).
/// They must be zeroed before the first call in a solver iteration.
///
/// `predicted` are the current predicted positions. `previous` are the positions
/// before prediction (used to estimate velocity for friction).
/// `friction` is the Coulomb friction coefficient (0 = frictionless).
/// `dt` is the substep time step.
pub fn solve_contacts(
    contacts: &[ContactConstraint],
    predicted: &[Vec3],
    previous: &[Vec3],
    inv_mass: &[f32],
    corrections: &mut [Vec3],
    correction_counts: &mut [u32],
    friction: f32,
    dt: f32,
) {
    for contact in contacts {
        let i = contact.i as usize;
        let j = contact.j as usize;

        let w_i = inv_mass[i];
        let w_j = inv_mass[j];
        let w_sum = w_i + w_j;
        if w_sum < 1e-10 {
            continue; // both static
        }

        // Mass-weighted normal correction
        let correction = contact.normal * contact.penetration / w_sum;
        corrections[i] -= correction * w_i;
        corrections[j] += correction * w_j;

        // Coulomb friction: reduce tangential relative velocity
        if friction > 0.0 && dt > 1e-10 {
            let vel_i = (predicted[i] - previous[i]) / dt;
            let vel_j = (predicted[j] - previous[j]) / dt;
            let rel_vel = vel_i - vel_j;
            let vn = rel_vel.dot(contact.normal);
            let vt = rel_vel - contact.normal * vn;
            let vt_len = vt.length();
            if vt_len > 1e-8 {
                // Coulomb: tangential impulse <= mu * normal impulse
                let max_friction = friction * contact.penetration * 0.5;
                let friction_mag = (vt_len * dt).min(max_friction);
                let tangent = vt / vt_len;
                let friction_correction_i = tangent * friction_mag * w_i / w_sum;
                let friction_correction_j = tangent * friction_mag * w_j / w_sum;
                corrections[i] -= friction_correction_i;
                corrections[j] += friction_correction_j;
            }
        }

        correction_counts[i] += 1;
        correction_counts[j] += 1;
    }
}

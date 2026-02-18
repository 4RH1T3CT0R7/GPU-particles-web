use glam::Vec3;

use crate::grid::SpatialHashGrid;

/// A detected contact between two particles
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
///
/// `corrections` and `correction_counts` are accumulation buffers (same length as positions).
/// They must be zeroed before the first call in a solver iteration.
pub fn solve_contacts(
    contacts: &[ContactConstraint],
    _positions: &[Vec3],
    corrections: &mut [Vec3],
    correction_counts: &mut [u32],
) {
    for contact in contacts {
        let i = contact.i as usize;
        let j = contact.j as usize;
        // Each particle gets pushed half the penetration distance
        let correction = contact.normal * contact.penetration * 0.5;
        corrections[i] -= correction; // push A away from B
        corrections[j] += correction; // push B away from A
        correction_counts[i] += 1;
        correction_counts[j] += 1;
    }
}

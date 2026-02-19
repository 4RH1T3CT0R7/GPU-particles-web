use glam::Vec3;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

/// Barnes-Hut octree node for O(N log N) gravitational force computation.
///
/// Leaf nodes store a single particle. Internal nodes store the aggregate
/// center of mass and total mass of all children. The opening angle criterion
/// (theta) determines when a distant node can be approximated as a point mass.
///
/// Reference: Barnes & Hut, "A hierarchical O(N log N) force-calculation algorithm", Nature 1986
struct OctreeNode {
    center_of_mass: Vec3,
    total_mass: f32,
    bbox_min: Vec3,
    bbox_max: Vec3,
    children: [Option<Box<OctreeNode>>; 8],
    /// For leaf nodes: the particle index. None for internal nodes.
    particle_idx: Option<u32>,
}

impl OctreeNode {
    fn new_leaf(pos: Vec3, mass: f32, idx: u32) -> Self {
        Self {
            center_of_mass: pos,
            total_mass: mass,
            bbox_min: pos,
            bbox_max: pos,
            children: Default::default(),
            particle_idx: Some(idx),
        }
    }

    fn new_internal(bbox_min: Vec3, bbox_max: Vec3) -> Self {
        Self {
            center_of_mass: Vec3::ZERO,
            total_mass: 0.0,
            bbox_min,
            bbox_max,
            children: Default::default(),
            particle_idx: None,
        }
    }

    /// Determine which octant a position falls into relative to the center.
    fn octant(center: Vec3, pos: Vec3) -> usize {
        let mut idx = 0;
        if pos.x >= center.x { idx |= 1; }
        if pos.y >= center.y { idx |= 2; }
        if pos.z >= center.z { idx |= 4; }
        idx
    }

    /// Get the bounding box for a child octant.
    fn child_bounds(bbox_min: Vec3, bbox_max: Vec3, octant: usize) -> (Vec3, Vec3) {
        let center = (bbox_min + bbox_max) * 0.5;
        let mut cmin = bbox_min;
        let mut cmax = center;
        if octant & 1 != 0 { cmin.x = center.x; cmax.x = bbox_max.x; }
        if octant & 2 != 0 { cmin.y = center.y; cmax.y = bbox_max.y; }
        if octant & 4 != 0 { cmin.z = center.z; cmax.z = bbox_max.z; }
        (cmin, cmax)
    }

    /// Insert a particle into the octree. Returns false if max depth exceeded.
    fn insert(&mut self, pos: Vec3, mass: f32, idx: u32, depth: u32) -> bool {
        if depth > 32 {
            // Prevent infinite recursion for coincident particles
            return false;
        }

        let center = (self.bbox_min + self.bbox_max) * 0.5;

        if let Some(existing_idx) = self.particle_idx {
            // This is a leaf — split it into an internal node
            let existing_pos = self.center_of_mass;
            let existing_mass = self.total_mass;
            self.particle_idx = None;

            // Re-insert existing particle
            let oct_existing = Self::octant(center, existing_pos);
            let (cmin, cmax) = Self::child_bounds(self.bbox_min, self.bbox_max, oct_existing);
            let mut child = Box::new(OctreeNode::new_leaf(existing_pos, existing_mass, existing_idx));
            child.bbox_min = cmin;
            child.bbox_max = cmax;
            self.children[oct_existing] = Some(child);

            // Insert new particle
            let oct_new = Self::octant(center, pos);
            if let Some(ref mut child) = self.children[oct_new] {
                child.insert(pos, mass, idx, depth + 1);
            } else {
                let (cmin, cmax) = Self::child_bounds(self.bbox_min, self.bbox_max, oct_new);
                let mut leaf = Box::new(OctreeNode::new_leaf(pos, mass, idx));
                leaf.bbox_min = cmin;
                leaf.bbox_max = cmax;
                self.children[oct_new] = Some(leaf);
            }
        } else {
            // Internal node — insert into appropriate child
            let oct = Self::octant(center, pos);
            if let Some(ref mut child) = self.children[oct] {
                child.insert(pos, mass, idx, depth + 1);
            } else {
                let (cmin, cmax) = Self::child_bounds(self.bbox_min, self.bbox_max, oct);
                let mut leaf = Box::new(OctreeNode::new_leaf(pos, mass, idx));
                leaf.bbox_min = cmin;
                leaf.bbox_max = cmax;
                self.children[oct] = Some(leaf);
            }
        }

        // Update aggregate mass and center of mass
        self.total_mass += mass;
        self.center_of_mass =
            (self.center_of_mass * (self.total_mass - mass) + pos * mass) / self.total_mass;

        true
    }

    /// Bounding box side length.
    fn size(&self) -> f32 {
        let d = self.bbox_max - self.bbox_min;
        d.x.max(d.y).max(d.z)
    }
}

/// Build an octree from particle positions.
fn build_octree(positions: &[Vec3], count: usize) -> Option<OctreeNode> {
    if count == 0 {
        return None;
    }

    // Compute bounding box with margin
    let mut bmin = positions[0];
    let mut bmax = positions[0];
    for i in 1..count {
        bmin = bmin.min(positions[i]);
        bmax = bmax.max(positions[i]);
    }
    // Add small margin to avoid zero-size bbox
    let margin = Vec3::splat(0.01);
    bmin -= margin;
    bmax += margin;

    let mut root = OctreeNode::new_internal(bmin, bmax);

    for i in 0..count {
        // All particles have mass 1.0 (uniform mass assumption)
        root.insert(positions[i], 1.0, i as u32, 0);
    }

    Some(root)
}

/// Stack-based octree traversal for computing gravitational acceleration on a particle.
///
/// Uses the Barnes-Hut opening angle criterion: if s/d < theta, treat the node
/// as a point mass (where s = node size, d = distance to node CoM).
fn traverse_octree(
    root: &OctreeNode,
    pos: Vec3,
    particle_idx: u32,
    theta: f32,
    softening_sq: f32,
    g: f32,
) -> Vec3 {
    let mut acc = Vec3::ZERO;
    let mut stack: Vec<&OctreeNode> = vec![root];

    while let Some(node) = stack.pop() {
        // Skip if this is the particle itself
        if let Some(idx) = node.particle_idx {
            if idx == particle_idx {
                continue;
            }
        }

        if node.total_mass < 1e-10 {
            continue;
        }

        let diff = node.center_of_mass - pos;
        let dist_sq = diff.length_squared() + softening_sq;

        // Check if this is a leaf or if the opening angle criterion is satisfied
        let is_leaf = node.particle_idx.is_some();
        let s = node.size();
        let use_approximation = is_leaf || (s * s / dist_sq < theta * theta);

        if use_approximation {
            // Treat as point mass: a = G * M * r / |r|^3
            let dist = dist_sq.sqrt();
            if dist > 1e-8 {
                acc += diff * (g * node.total_mass / (dist_sq * dist));
            }
        } else {
            // Recurse into children
            for child in &node.children {
                if let Some(ref child_node) = child {
                    stack.push(child_node);
                }
            }
        }
    }

    acc
}

/// Apply Barnes-Hut N-body gravitational forces to all particles.
///
/// Builds an octree from particle positions, then traverses it for each
/// particle to compute gravitational acceleration. O(N log N) complexity.
///
/// Parameters from config:
/// - `g`: Gravitational constant
/// - `softening`: Softening parameter (prevents singularity at r=0)
/// - `theta`: Barnes-Hut opening angle (0.0 = exact, higher = faster but less accurate)
pub fn apply_nbody_gravity(
    positions: &[Vec3],
    velocities: &mut [Vec3],
    count: usize,
    g: f32,
    softening: f32,
    theta: f32,
    dt: f32,
) {
    let octree = match build_octree(positions, count) {
        Some(tree) => tree,
        None => return,
    };

    let softening_sq = softening * softening;

    #[cfg(feature = "parallel")]
    {
        // Compute accelerations in parallel, then apply
        let accels: Vec<Vec3> = (0..count)
            .into_par_iter()
            .map(|i| traverse_octree(&octree, positions[i], i as u32, theta, softening_sq, g))
            .collect();
        for i in 0..count {
            velocities[i] += accels[i] * dt;
        }
    }

    #[cfg(not(feature = "parallel"))]
    {
        for i in 0..count {
            let acc = traverse_octree(&octree, positions[i], i as u32, theta, softening_sq, g);
            velocities[i] += acc * dt;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_two_body_attraction() {
        // Two particles at distance 1.0 should attract each other
        let positions = vec![Vec3::new(-0.5, 0.0, 0.0), Vec3::new(0.5, 0.0, 0.0)];
        let mut velocities = vec![Vec3::ZERO; 2];

        apply_nbody_gravity(&positions, &mut velocities, 2, 1.0, 0.01, 0.0, 1.0);

        // Particle 0 should move toward particle 1 (positive x)
        assert!(velocities[0].x > 0.0, "Particle 0 should be attracted rightward");
        // Particle 1 should move toward particle 0 (negative x)
        assert!(velocities[1].x < 0.0, "Particle 1 should be attracted leftward");
        // Magnitudes should be equal (equal mass)
        assert!(
            (velocities[0].x + velocities[1].x).abs() < 1e-4,
            "Forces should be equal and opposite"
        );
    }

    #[test]
    fn test_inverse_square_falloff() {
        // Force should decrease with distance squared
        let positions_near = vec![Vec3::ZERO, Vec3::new(1.0, 0.0, 0.0)];
        let positions_far = vec![Vec3::ZERO, Vec3::new(2.0, 0.0, 0.0)];
        let mut vel_near = vec![Vec3::ZERO; 2];
        let mut vel_far = vec![Vec3::ZERO; 2];

        apply_nbody_gravity(&positions_near, &mut vel_near, 2, 1.0, 0.0, 0.0, 1.0);
        apply_nbody_gravity(&positions_far, &mut vel_far, 2, 1.0, 0.0, 0.0, 1.0);

        let force_near = vel_near[0].x.abs();
        let force_far = vel_far[0].x.abs();
        // At 2x distance, force should be ~1/4
        let ratio = force_near / force_far;
        assert!(
            (ratio - 4.0).abs() < 0.5,
            "Force should follow inverse square law, got ratio {}",
            ratio
        );
    }

    #[test]
    fn test_barnes_hut_approximation() {
        // With a cluster of particles far away, Barnes-Hut should give
        // approximately the same result as exact computation
        let mut positions = vec![Vec3::new(0.0, 0.0, 0.0)]; // test particle
        // Cluster at distance 10
        for i in 0..4 {
            positions.push(Vec3::new(
                10.0 + (i as f32) * 0.1,
                (i as f32) * 0.1,
                0.0,
            ));
        }

        let mut vel_exact = vec![Vec3::ZERO; 5];
        let mut vel_approx = vec![Vec3::ZERO; 5];

        apply_nbody_gravity(&positions, &mut vel_exact, 5, 1.0, 0.01, 0.0, 1.0);
        apply_nbody_gravity(&positions, &mut vel_approx, 5, 1.0, 0.01, 0.7, 1.0);

        // Results should be similar (within ~10% for this configuration)
        let exact_mag = vel_exact[0].length();
        let approx_mag = vel_approx[0].length();
        assert!(
            (exact_mag - approx_mag).abs() / exact_mag < 0.15,
            "Barnes-Hut approximation should be close to exact: exact={}, approx={}",
            exact_mag,
            approx_mag
        );
    }
}
